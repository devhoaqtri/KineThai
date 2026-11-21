/**
 * Run the TikTok calendar on this Mac with nobody at the keyboard, from launchd.
 *
 *   render     render the next --days planned posts (default 6), starting the dev server
 *              for the recording when none answers and stopping it afterwards
 *   draft      render any post due within --hours (default 24) that has no clip yet, propose
 *              a song for each due Facebook and YouTube post when that platform's sounds folder
 *              has any (tiktok.ts music-due; accepted at once), then save every due post as
 *              a TikTok draft in the emulator (tiktok.ts draft-due)
 *   publish    post on Facebook, Instagram and YouTube every post whose time has come (tiktok.ts
 *              publish-due); launchd runs it at the calendar's post times (publishTimes),
 *              and it does nothing, writing no log and showing no notification, while Meta
 *              is not connected or nothing is due
 *   install    write and load the three launchd jobs (--render-at 03:00, --draft-at 13:30,
 *              publish at the post times); run it again when the calendar's times change
 *              (`status` says when they no longer match)
 *   uninstall  unload and remove them
 *   status     whether the jobs are loaded, and the end of the latest run's log
 *
 * Every run writes logs/tiktok-auto/<date>-<job>.log and ends with a macOS notification, so
 * a failure is seen without opening a terminal. What is left by hand: tapping Post on each
 * draft in the emulator (TikTok keeps drafts on the device, not the account), then
 * `npm run tiktok -- mark <n> posted --url <link>`.
 *
 * Why these choices:
 *   launchd, not cron: a LaunchAgent runs in the logged-in session (the emulator needs a
 *   window server) and runs a missed time once the Mac wakes. It cannot wake a sleeping
 *   Mac; `sudo pmset repeat wake MTWRFSU 02:55:00` does that.
 *
 *   Rendering at night: the recording is a live page under Vite, and any source edit
 *   reloads it mid-take and ruins the clip, so it runs when nobody is editing.
 *
 *   One lock for the render and draft jobs: they would fight over the dev server and the
 *   emulator, so the second waits for the first. Publishing takes no lock: it uses neither.
 *
 * Times are this Mac's local time, which launchd uses; the calendar's times are Vietnam's.
 * They agree while the Mac is set to UTC+7.
 */
import { spawn, spawnSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { loadMetaConfig, metaReady } from "./lib/meta-publish";
import { loadYouTubeConfig, youtubeReady } from "./lib/youtube-publish";
import { loadThreadsConfig, threadsReady } from "./lib/threads-publish";
import {
  MUSIC_PLATFORMS,
  PUBLISH_PLATFORMS,
  postsAwaitingMusic,
  postsToDraft,
  postsToPublish,
  publishTimes,
  todayInVietnam,
  type Calendar,
  type PublishPlatform,
} from "./lib/tiktok-calendar";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LOG_DIR = join(ROOT, "logs", "tiktok-auto");
const LOCK = join(LOG_DIR, "run.lock");
const CALENDAR_FILE = join(ROOT, "scripts/data/tiktok-calendar.json");
const DEV_PORT = 5195;
const BASE = `http://localhost:${DEV_PORT}`;
const AGENTS = join(homedir(), "Library", "LaunchAgents");
const LABELS = {
  render: "com.kinemedia.tiktok-render",
  draft: "com.kinemedia.tiktok-draft",
  publish: "com.kinemedia.tiktok-publish",
} as const;
type Job = keyof typeof LABELS;

const [command, ...rest] = process.argv.slice(2);
/** When this run began, to tell what it posted from what was posted before. */
const runStarted = new Date().toISOString();
function flag(name: string): string | undefined {
  const at = rest.indexOf(`--${name}`);
  return at !== -1 ? rest[at + 1] : undefined;
}

let log: ReturnType<typeof createWriteStream> | null = null;
function say(line: string) {
  const stamped = `[${new Date().toLocaleTimeString("en-GB")}] ${line}`;
  console.log(stamped);
  log?.write(`${stamped}\n`);
}

/**
 * Show a macOS notification. Passed as arguments, so a quote in the message cannot break
 * the script. Needs no Accessibility grant, only the notification permission.
 */
function notify(title: string, message: string) {
  spawnSync("osascript", [
    "-e",
    "on run argv",
    "-e",
    'display notification (item 2 of argv) with title (item 1 of argv) sound name "Glass"',
    "-e",
    "end run",
    title,
    message.slice(0, 240),
  ]);
}

/** Run a command, its output into the log as well as this process's own. */
function run(cmd: string, args: string[]): Promise<number> {
  say(`$ ${cmd} ${args.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(" ")}`);
  return new Promise((done) => {
    const child = spawn(cmd, args, { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
    const pass = (chunk: Buffer) => {
      process.stdout.write(chunk);
      log?.write(chunk);
    };
    child.stdout.on("data", pass);
    child.stderr.on("data", pass);
    child.on("close", (code) => done(code ?? 1));
  });
}

const tiktok = (args: string[]) => run("npx", ["tsx", join(ROOT, "scripts/tiktok.ts"), ...args]);

async function devServerAnswers(): Promise<boolean> {
  try {
    return (await fetch(`${BASE}/showcase`, { signal: AbortSignal.timeout(20_000) })).ok;
  } catch {
    return false;
  }
}

/**
 * A dev server on the render port for as long as `body` runs. One already running (the
 * reader's own) is used and left alone; one started here is stopped, process group and all.
 */
async function withDevServer<T>(body: () => Promise<T>): Promise<T> {
  if (await devServerAnswers()) {
    say(`dev server already answers on :${DEV_PORT}; using it`);
    return body();
  }
  say(`starting the dev server on :${DEV_PORT}`);
  const server = spawn("npm", ["run", "dev", "--", "--port", String(DEV_PORT), "--strictPort"], {
    cwd: ROOT,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (c: Buffer) => log?.write(c));
  server.stderr.on("data", (c: Buffer) => log?.write(c));
  const stop = () => {
    try {
      process.kill(-server.pid!, "SIGTERM");
    } catch {
      // already gone
    }
  };
  try {
    // A cold server loads every deck before its first page.
    for (let i = 0; ; i += 1) {
      if (server.exitCode !== null) throw new Error(`the dev server exited (code ${server.exitCode})`);
      if (await devServerAnswers()) break;
      if (i >= 60) throw new Error(`the dev server did not answer on :${DEV_PORT} within 3 minutes`);
      await sleep(3000);
    }
    return await body();
  } finally {
    say("stopping the dev server");
    stop();
  }
}

/** Hold the run lock, waiting up to 40 minutes for another run to finish. */
async function takeLock() {
  for (let i = 0; i < 240; i += 1) {
    const holder = existsSync(LOCK) ? Number(readFileSync(LOCK, "utf8")) : 0;
    let alive = false;
    if (holder) {
      try {
        process.kill(holder, 0);
        alive = true;
      } catch {
        // a lock left by a run that died
      }
    }
    if (!alive) {
      writeFileSync(LOCK, String(process.pid));
      process.on("exit", () => {
        try {
          if (readFileSync(LOCK, "utf8") === String(process.pid)) unlinkSync(LOCK);
        } catch {
          // nothing to release
        }
      });
      return;
    }
    if (i === 0) say(`waiting for run ${holder} to finish`);
    await sleep(10_000);
  }
  throw new Error("another TikTok run held the lock for 40 minutes");
}

function loadCalendar(): Calendar {
  return JSON.parse(readFileSync(CALENDAR_FILE, "utf8")) as Calendar;
}

async function renderJob() {
  const days = flag("days") ?? "6";
  await withDevServer(async () => {
    if ((await tiktok(["render", "--days", days])) !== 0) throw new Error("rendering failed; see the log");
  });
  notify("TikTok clips rendered", `The next ${days} planned post(s) have clips.`);
}

async function draftJob() {
  const hours = flag("hours") ?? "24";
  const { unrendered } = postsToDraft(loadCalendar(), Date.now(), Number(hours));
  if (unrendered.length) {
    const list = unrendered.map((d) => d.day).join(",");
    say(`post(s) ${list} are due with no clip; rendering them first`);
    await withDevServer(async () => {
      if ((await tiktok(["render", "--day", list])) !== 0) throw new Error(`rendering post(s) ${list} failed`);
    });
  }
  // Songs first, so each post's mix exists well before its time.
  const withSongs = (calendar: Calendar) =>
    calendar.days.flatMap((d) => MUSIC_PLATFORMS.filter((p) => d.platforms?.[p]?.music).map((p) => `#${d.day} ${p}`));
  const songsBefore = new Set(withSongs(loadCalendar()));
  const musicCode = await tiktok(["music-due", "--hours", hours]);
  const songs = withSongs(loadCalendar()).filter((s) => !songsBefore.has(s));
  if (songs.length) notify("Songs picked", `${songs.join(", ")}: accepted; swap one on /posting if you like.`);
  const before = new Set(loadCalendar().days.filter((d) => d.status === "drafted").map((d) => d.day));
  const code = await tiktok(["draft-due", "--hours", hours]);
  const drafted = loadCalendar().days.filter((d) => d.status === "drafted" && !before.has(d.day));
  // The emulator is up: read every TikTok video's views for the hashtag experiment
  // (hashtag-experiment.ts). Its failure costs one day's reading, never the drafts.
  if ((await tiktok(["views"])) !== 0) say("! reading TikTok views failed; the hashtag experiment skips today");
  // A clip rendered just now missed the publish run at its own time (it had nothing to send):
  // send what is due before reporting.
  let publishProblem: string | null = null;
  if (publishDue()) {
    try {
      await publishJob();
    } catch (error) {
      publishProblem = error instanceof Error ? error.message : String(error);
    }
  }
  if (code !== 0) throw new Error(`not every due post was drafted${drafted.length ? ` (drafted ${drafted.map((d) => d.day).join(", ")})` : ""}`);
  if (musicCode !== 0) throw new Error("a song could not be mixed into a due post; see the log");
  if (publishProblem) throw new Error(publishProblem);
  notify(
    "TikTok drafts ready",
    drafted.length
      ? drafted.map((d) => `#${d.day} at ${d.time ?? ""}`).join(", ") + ": post them from Drafts in the emulator."
      : "Nothing was due.",
  );
}

/** Whether a platform is connected: Meta's Page token, Threads' token, or YouTube's refresh token. */
function connected(platform: PublishPlatform): boolean {
  if (platform === "youtube") return !youtubeReady(loadYouTubeConfig(ROOT));
  if (platform === "threads") return !threadsReady(loadThreadsConfig(ROOT), loadMetaConfig(ROOT));
  return !metaReady(loadMetaConfig(ROOT), platform);
}

/** Whether any connected platform has a post due now: the publish job's quiet check. */
function publishDue(): boolean {
  const calendar = loadCalendar();
  return PUBLISH_PLATFORMS.some(
    (p) =>
      connected(p) &&
      (postsToPublish(calendar, Date.now(), p).length > 0 || postsAwaitingMusic(calendar, Date.now(), p).length > 0),
  );
}

async function publishJob() {
  const code = await tiktok(["publish-due"]);
  const posted = loadCalendar().days.flatMap((d) =>
    PUBLISH_PLATFORMS.filter((p) => d.platforms?.[p]?.status === "posted" && (d.platforms[p]!.at ?? "") > runStarted)
      .map((p) => `#${d.day} ${p}`),
  );
  if (code !== 0) throw new Error(`publishing failed${posted.length ? ` (posted ${posted.join(", ")})` : ""}; see /posting`);
  if (posted.length) notify("Posted", posted.join(", "));
  const calendar = loadCalendar();
  const waiting = PUBLISH_PLATFORMS.flatMap((p) => postsAwaitingMusic(calendar, Date.now(), p).map((d) => `#${d.day} ${p}`));
  // Accepting publishes a post whose time has passed at once, so nothing else need wait.
  if (waiting.length) notify("Waiting for its song", `${waiting.join(", ")}: accept the song on /posting and it goes out.`);
}

/** The plist for one job, run daily at each of `times` (HH:MM), with the paths this machine has now. */
function plist(label: string, job: Job, times: string[], args: string[]): string {
  const slots = times.map((at) => {
    const [hour, minute] = at.split(":").map(Number);
    if (!(hour! >= 0 && hour! < 24 && minute! >= 0 && minute! < 60)) throw new Error(`"${at}" is not HH:MM`);
    return `    <dict>
      <key>Hour</key>
      <integer>${hour}</integer>
      <key>Minute</key>
      <integer>${minute}</integer>
    </dict>`;
  });
  const schedule = `<key>StartCalendarInterval</key>
  <array>
${slots.join("\n")}
  </array>`;
  const tsx = join(ROOT, "node_modules", ".bin", "tsx");
  if (!existsSync(tsx)) throw new Error(`no tsx at ${tsx}; run npm install`);
  // launchd starts jobs with a bare PATH; node, npx, adb and ffmpeg live outside it.
  const path = [dirname(process.execPath), "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"];
  const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const strings = (items: string[]) => items.map((s) => `    <string>${xml(s)}</string>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${label}</string>
  <key>ProgramArguments</key>
  <array>
${strings([tsx, join(ROOT, "scripts", "tiktok-auto.ts"), job, ...args])}
  </array>
  <key>WorkingDirectory</key>
  <string>${xml(ROOT)}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${xml([...new Set(path)].join(":"))}</string>
    <key>HOME</key>
    <string>${xml(homedir())}</string>
  </dict>
  ${schedule}
  <!-- Unset, launchd throttles a job's CPU and I/O. The recording runs in real time, so a
       throttled render dropped to about 13 distinct frames a second against the usual 22-24. -->
  <key>ProcessType</key>
  <string>Interactive</string>
  <!-- The emulator a draft run boots must outlive the job: you post from it afterwards. -->
  <key>AbandonProcessGroup</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${xml(join(LOG_DIR, `launchd-${job}.log`))}</string>
  <key>StandardErrorPath</key>
  <string>${xml(join(LOG_DIR, `launchd-${job}.log`))}</string>
</dict>
</plist>
`;
}

const uid = process.getuid!();

function install() {
  mkdirSync(AGENTS, { recursive: true });
  const jobs: { job: Job; times: string[]; args: string[] }[] = [
    { job: "render", times: [flag("render-at") ?? "03:00"], args: ["--days", flag("render-days") ?? "6"] },
    // 13:30, when the owner is at the Mac (2026-11-18): night runs found it asleep, lid shut.
    { job: "draft", times: [flag("draft-at") ?? "13:30"], args: ["--hours", flag("hours") ?? "24"] },
    // Instagram's API cannot schedule, so posts go out from here at their time. A failure is
    // retried at the next slot within publish-due's 6-hour grace, or by hand from /posting.
    { job: "publish", times: publishTimes(loadCalendar(), todayInVietnam(Date.now())), args: [] },
  ];
  for (const { job, times, args } of jobs) {
    const label = LABELS[job];
    const file = join(AGENTS, `${label}.plist`);
    spawnSync("launchctl", ["bootout", `gui/${uid}/${label}`]); // a no-op when not loaded
    writeFileSync(file, plist(label, job, times, args));
    const loaded = spawnSync("launchctl", ["bootstrap", `gui/${uid}`, file], { encoding: "utf8" });
    if (loaded.status !== 0) throw new Error(`launchctl bootstrap ${label} failed: ${loaded.stderr.trim()}`);
    console.log(`✓ ${label}: daily at ${times.join(", ")} (${file})`);
  }
  console.log(
    "\nThe Mac must be awake: launchd runs a missed time on wake but cannot wake it.\n" +
      "  To wake it each night: sudo pmset repeat wake MTWRFSU 02:55:00\n" +
      "Try a job now: launchctl kickstart gui/" + uid + "/" + LABELS.draft,
  );
}

function uninstall() {
  for (const label of Object.values(LABELS)) {
    spawnSync("launchctl", ["bootout", `gui/${uid}/${label}`]);
    rmSync(join(AGENTS, `${label}.plist`), { force: true });
    console.log(`✓ removed ${label}`);
  }
}

/** The HH:MM times a plist's StartCalendarInterval runs at. */
function installedTimes(xml: string): string[] {
  const pad = (n: string) => n.padStart(2, "0");
  return [...xml.matchAll(/<key>Hour<\/key>\s*<integer>(\d+)<\/integer>\s*<key>Minute<\/key>\s*<integer>(\d+)<\/integer>/g)]
    .map((m) => `${pad(m[1]!)}:${pad(m[2]!)}`)
    .sort();
}

function status() {
  for (const label of Object.values(LABELS)) {
    const printed = spawnSync("launchctl", ["print", `gui/${uid}/${label}`], { encoding: "utf8" });
    if (printed.status !== 0) {
      console.log(`${label}: not loaded`);
      continue;
    }
    const field = (name: string) => new RegExp(`^\\s*${name} = (.*)$`, "m").exec(printed.stdout)?.[1] ?? "?";
    console.log(`${label}: loaded · state ${field("state")} · runs ${field("runs")} · last exit ${field("last exit code")}`);
  }
  // The publish job carries the calendar's times from when it was installed.
  const installed = existsSync(join(AGENTS, `${LABELS.publish}.plist`))
    ? installedTimes(readFileSync(join(AGENTS, `${LABELS.publish}.plist`), "utf8"))
    : null;
  const wanted = publishTimes(loadCalendar(), todayInVietnam(Date.now()));
  if (installed) {
    const missing = wanted.filter((t) => !installed.includes(t));
    console.log(`publish runs at ${installed.join(", ") || "no fixed time"}; the calendar posts at ${wanted.join(", ")}`);
    if (missing.length) console.log(`! nothing publishes at ${missing.join(", ")}: npx tsx scripts/tiktok-auto.ts install`);
  }
  const today = todayInVietnam(Date.now());
  for (const job of ["render", "draft", "publish"]) {
    const file = join(LOG_DIR, `${today}-${job}.log`);
    if (!existsSync(file)) continue;
    console.log(`\n── ${file} (last lines)`);
    console.log(readFileSync(file, "utf8").trim().split("\n").slice(-8).join("\n"));
  }
}

async function main() {
  if (command === "install") return install();
  if (command === "uninstall") return uninstall();
  if (command === "status") return status();
  if (command !== "render" && command !== "draft" && command !== "publish") {
    throw new Error("commands: render, draft, publish, install, uninstall, status (see the top of scripts/tiktok-auto.ts)");
  }
  // At a slot with nothing due (or Meta not connected): no log, no lock, no notification.
  if (command === "publish" && !publishDue()) return;
  mkdirSync(LOG_DIR, { recursive: true });
  log = createWriteStream(join(LOG_DIR, `${todayInVietnam(Date.now())}-${command}.log`), { flags: "a" });
  say(`── TikTok ${command} run (pid ${process.pid})`);
  // Keep the Mac from idling to sleep halfway through a recording or a draft.
  spawn("caffeinate", ["-i", "-w", String(process.pid)], { stdio: "ignore", detached: true }).unref();
  try {
    // Publishing needs neither the dev server nor the emulator, so it never waits behind a
    // render or draft run that holds them (the draft job and a post share 13:30).
    if (command !== "publish") await takeLock();
    await (command === "render" ? renderJob() : command === "draft" ? draftJob() : publishJob());
    say(`✓ ${command} run finished`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    say(`✗ ${message}`);
    notify(`TikTok ${command} failed`, `${message.split("\n")[0]} (logs/tiktok-auto)`);
    process.exitCode = 1;
  } finally {
    await new Promise((done) => log!.end(done));
  }
}

main().catch((error) => {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
