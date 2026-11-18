/**
 * Run the TikTok calendar: a word a post, a post a day for a year, optionally opening with a
 * burst of several a day (scripts/data/tiktok-calendar.json). A "day" number below is a
 * post's number; its date and time come from the schedule (lib/tiktok-calendar slotOfPost).
 *
 *   plan      choose a word for every day of the year (keeps days already under way)
 *   render    make the clips for the next days, with their captions beside them, and each
 *             word's finished pages (the Instagram carousel) in <clipDir>/carousels
 *   carousel  render the finished pages again for --day N (days rendered before carousels)
 *   status    what is posted, scheduled and rendered, and how many days are left in hand
 *   mark      record what happened: a day scheduled in TikTok Studio, posted, or missed
 *   swap      give a day a different word
 *   caption   print a day's caption and copy it (the emulator shares the Mac's clipboard)
 *   handoff   save a day's clip as a TikTok draft in the emulator (post-to-tiktok.ts), with
 *             its calendar caption, and mark it drafted
 *   draft-due hand off every rendered post due from today until --hours from now (what the
 *             unattended job runs, scripts/tiktok-auto.ts); fails if any is not drafted
 *   publish   post a day now: a Reel of the clip on the Facebook Page, a carousel of the
 *             finished pages on Instagram, a Short on YouTube (scripts/lib/youtube-publish.ts)
 *             (scripts/lib/meta-publish.ts); what the /posting page's buttons run
 *   publish-due  publish every post whose slot has come on Facebook and Instagram (the
 *             scheduled job, scripts/tiktok-auto.ts publish); quiet when nothing is due
 *   music     the song under a post's Facebook Reel or YouTube Short (scripts/lib/music-mix.ts,
 *             `--platform facebook|youtube`, Facebook by default; each has its own library):
 *             `music 8` proposes one from that sounds folder and mixes it in,
 *             `--song <file|none>` and `--start <s>` choose, `music accept 8` lets the post
 *             go out with it (and publishes at once when its slot has passed); a proposed
 *             song holds the post on that platform
 *   music-due  propose a song for every post due within --hours (default 24) that has none,
 *             on each connected music platform whose sounds folder has any (the morning job)
 *   times     move the post times (`--burst-times 13:30,20:30,02:30`, `--time 19:00`); a time
 *             earlier than the one before it is the night after; posts already out keep theirs
 *   youtube-setup  sign in to Google once (in your browser) and keep YouTube's refresh token
 *             in .env.local; needs YT_CLIENT_ID and YT_CLIENT_SECRET there first
 *   meta-setup  turn META_USER_TOKEN (Graph API Explorer) into the Page's lasting token and
 *             the linked Instagram account, written to .env.local
 *   exported  the words that have already gone out anywhere (scripts/data/exported-words.json),
 *             and any calendar day that would post one of them again; `exported add` records
 *             an export no tool saw (a post made by hand)
 *
 * No word goes out twice. exported-words.json lists every word ever exported; every command
 * first brings it up to date from what is on disk (carousel folders and TikTok lab clips
 * under exports/, and every calendar post with a clip), only ever adding. `plan` and `swap`
 * never pick a listed word, and `render` refuses a day whose word went out elsewhere.
 *
 * Usage:
 *   npm run tiktok -- plan [--start 2026-11-15] [--time 19:00] [--order rising|weekly|easiest]
 *                          [--seed 1] [--clip-dir ~/KineMedia-tiktok/clips] [--days 365]
 *                          [--burst 7x3 [--burst-times 11:30,19:00,21:30] | --burst none]
 *   npm run tiktok -- render [--days 14] [--day 3,5-7] [--base http://localhost:5195]
 *                            [--frame 4x5|9x16] [--look aurora|glass|mint|sunrise]
 *     (4x5, the default, is the TikTok lab's upload layout: the clip on a 4:5 canvas
 *     between fading black bands; 9x16 is the older whole-screen clip)
 *   npm run tiktok -- status
 *   npm run tiktok -- mark 1-10 scheduled
 *   npm run tiktok -- mark 3 posted --url https://www.tiktok.com/@.../video/...
 *   npm run tiktok -- mark 4 missed --note "server down"
 *   npm run tiktok -- swap 12 [--word vi-holiday]
 *   npm run tiktok -- caption 3
 *   npm run tiktok -- handoff 3 [--no-draft] [--no-location]
 *   npm run tiktok -- draft-due [--hours 24]
 *   npm run tiktok -- publish 5 [--platform facebook|instagram|all] [--dry-run]
 *   npm run tiktok -- publish-due [--dry-run]
 *   npm run tiktok -- meta-setup [--page <id or name>]
 *   npm run tiktok -- exported [add <code> --where tiktok --ref <link or note> [--at 2026-10-20]]
 *
 * Rendering needs the dev server (`npm run dev`, port 5195), because the showcase route
 * exists only there, and records in real time: about a minute a day.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WORD_HOOK } from "../src/features/vocabulary/lib/first-visit";
import { updateJsonFile } from "./lib/locked-file";
import { exchangeForPageToken, loadMetaConfig, metaReady, publishCarousel, publishReel, writeEnvLocal } from "./lib/meta-publish";
import { SOUNDS_DIRS, listSongs, mixSong, songTitle } from "./lib/music-mix";
import { loadYouTubeConfig, publishShort, youtubeReady, youtubeSetup } from "./lib/youtube-publish";
import { renderCarousel } from "./render-carousel";
import { siteAddress, withScheme } from "../src/features/vocabulary/lib/target-language";
import {
  CALENDAR_DAYS,
  LEVEL_ORDERS,
  captionFor,
  dateOfDay,
  dayOfDate,
  firstPostOnDate,
  parseBurst,
  slotOfPost,
  eligibleWords,
  levelForDay,
  parseDaySpec,
  planDays,
  postsToDraft,
  summarize,
  todayInVietnam,
  type Calendar,
  type CalendarDay,
  type CandidateWord,
  type DayStatus,
  type LevelOrder,
  type ExportedWords,
  type MusicPlatform,
  type PlatformPost,
  type PublishPlatform,
  PUBLISH_PLATFORMS,
  MUSIC_PLATFORMS,
  soundsDirFor,
  youtubeTitle,
  META_PLATFORMS,
  captionForPlatform,
  postsToPublish,
  postsAwaitingMusic,
  musicHolds,
  mixedClipPath,
  pickSong,
  postTimeMs,
  isPostLevel,
  MIN_POST_LEVEL,
  carouselSlides,
  calendarExportRef,
  exportConflicts,
  recordExport,
} from "./lib/tiktok-calendar";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CALENDAR_FILE = join(ROOT, "scripts/data/tiktok-calendar.json");
const DECK_DIR = join(ROOT, "src/features/vocabulary/data/packs");
const REPORTS_FILE = join(ROOT, "src/features/vocabulary/data/word-reports.json");
const CLUE_LEDGER_FILE = join(ROOT, "scripts/data/clue-review-ledger.json");
const EXPORTED_FILE = join(ROOT, "scripts/data/exported-words.json");
const EXPORTS_DIR = join(ROOT, "exports");
const DEFAULT_CLIP_DIR = "~/KineMedia-tiktok/clips";
/** Vietnam's lunch and evening peaks, for a burst given without its own times. */
const DEFAULT_BURST_TIMES = "11:30,19:00,21:30";

const [command, ...rest] = process.argv.slice(2);
function flag(name: string): string | undefined {
  const at = rest.indexOf(`--${name}`);
  return at !== -1 ? rest[at + 1] : undefined;
}
/** The arguments that are not flags or flag values. */
const positional = rest.filter((arg, i) => !arg.startsWith("--") && !rest[i - 1]?.startsWith("--"));

const expandHome = (path: string) => (path.startsWith("~/") ? join(homedir(), path.slice(2)) : path);
const pad = (n: number) => String(n).padStart(3, "0");
const now = () => new Date().toISOString();

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

function loadCalendar(): Calendar {
  if (!existsSync(CALENDAR_FILE)) throw new Error("no calendar yet: run `npm run tiktok -- plan` first");
  return readJson<Calendar>(CALENDAR_FILE);
}

/**
 * Whether a post has gone out, or been handed to a platform, anywhere: its date and time are
 * then history, and a schedule change must not rewrite them.
 */
function settled(day: CalendarDay): boolean {
  if (day.status === "posted" || day.status === "missed" || day.status === "scheduled") return true;
  return Object.values(day.platforms ?? {}).some((t) => t?.status === "posted" || t?.status === "publishing");
}

/** The calendar's file text, every post not yet out re-dated from the schedule. */
function calendarText(calendar: Calendar): string {
  for (const day of calendar.days) if (!settled(day)) Object.assign(day, slotOf(calendar, day.day));
  calendar.days.sort((a, b) => a.day - b.day);
  return `${JSON.stringify(calendar, null, 2)}\n`;
}

/**
 * Change the calendar as it is on disk now, under its lock (scripts/lib/locked-file.ts), and
 * save it unless `change` returns false. Never save a calendar read earlier: the jobs overlap,
 * and a copy read before a render once wiped a publish run's results (post 10 went out twice).
 * @param read - the calendar to start from (plan passes a blank one when there is no file)
 */
function updateCalendar<R>(change: (calendar: Calendar) => R, read: () => Calendar = loadCalendar): R {
  return updateJsonFile(CALENDAR_FILE, read, calendarText, change);
}

/** One post of a calendar, which must exist. */
function postOf(calendar: Calendar, dayNumber: number): CalendarDay {
  const day = calendar.days.find((d) => d.day === dayNumber);
  if (!day) throw new Error(`there is no post ${dayNumber}`);
  return day;
}

/** The English deck, every level. */
function loadDeck(): CandidateWord[] {
  const words: CandidateWord[] = [];
  for (const file of readdirSync(DECK_DIR).filter((f) => /^en-.*\.json$/.test(f)).sort()) {
    const deck = readJson<{ words: CandidateWord[] }>(join(DECK_DIR, file));
    words.push(...deck.words);
  }
  return words;
}

/** The deck less anything with an open report or a broken clue. */
function loadEligible(): CandidateWord[] {
  const reports = readJson<{ wordId: string; word?: string; status: string }[]>(REPORTS_FILE);
  const reported = new Set<string>();
  for (const report of reports.filter((r) => r.status !== "resolved")) {
    reported.add(report.wordId);
    reported.add(report.wordId.toLowerCase());
    if (report.word) reported.add(report.word.toLowerCase());
  }
  const ledger = readJson<{ entries: { id: string; verdict: string }[] }>(CLUE_LEDGER_FILE);
  const broken = new Set(ledger.entries.filter((e) => e.verdict === "broken").map((e) => e.id));
  return eligibleWords(loadDeck(), reported, broken);
}

/** A post's date and time, as the file stores them. */
function slotOf(calendar: Calendar, day: number): { date: string; time: string } {
  return slotOfPost(calendar, day);
}

function newDay(calendar: Calendar, day: number, word: CandidateWord): CalendarDay {
  return {
    day,
    ...slotOf(calendar, day),
    wordId: word.id,
    word: word.word,
    code: word.shareCode!,
    level: word.level,
    topic: word.topic,
    status: "planned",
    caption: caption(calendar, day, word.level),
    clip: null,
    durationSec: null,
    renderedAt: null,
    scheduledAt: null,
    postedAt: null,
    url: null,
    note: null,
  };
}

function caption(calendar: Calendar, day: number, level: string): string {
  return captionFor({
    day,
    total: Math.max(CALENDAR_DAYS, calendar.days.length),
    level,
    hook: WORD_HOOK,
    // The full https:// address, so a reader sees a link to type, not a word.
    address: withScheme(siteAddress(calendar.locale)),
  });
}

function loadExported(): ExportedWords {
  return existsSync(EXPORTED_FILE) ? readJson<ExportedWords>(EXPORTED_FILE) : { version: 1, words: {} };
}

function exportedText(list: ExportedWords): string {
  const words = Object.fromEntries(Object.entries(list.words).sort(([a], [b]) => a.localeCompare(b)));
  return `${JSON.stringify({ version: 1, words }, null, 2)}\n`;
}

/** Change the exported-words list as it is on disk now, under its lock; saved unless `change` returns false. */
function updateExported<R>(change: (list: ExportedWords) => R): R {
  return updateJsonFile(EXPORTED_FILE, loadExported, exportedText, change);
}

/** The day a file or folder was made, for an export found on disk. */
const madeOn = (path: string) => statSync(path).mtime.toISOString().slice(0, 10);

/**
 * The exported-words list brought up to date with what is on disk: carousel folders
 * (exports/carousel/<brand>-<code>-<format>), TikTok lab clips (exports/tiktok/<code>-…mp4)
 * and every calendar post that has a clip. Only adds, and saves when anything was added.
 */
function syncExported(calendar: Calendar): ExportedWords {
  const byCode = new Map(loadDeck().filter((w) => w.shareCode).map((w) => [w.shareCode!.toUpperCase(), w]));
  let added = 0;
  let synced: ExportedWords | null = null;
  updateExported((list) => {
    synced = list;
    const add = (code: string, where: string, ref: string, at: string) => {
      const word = byCode.get(code);
      if (!word) {
        console.warn(`  ! ${ref}: no word in the English deck has code ${code}; add it by hand if it went out`);
        return;
      }
      if (recordExport(list, { id: word.id, word: word.word, code, level: word.level }, { where, ref, at })) added += 1;
    };
    const carousel = join(EXPORTS_DIR, "carousel");
    if (existsSync(carousel)) {
      for (const dir of readdirSync(carousel)) {
        const code = /-([0-9A-Z]{3})-[^-]+$/.exec(dir)?.[1];
        if (code) add(code, "carousel", `exports/carousel/${dir}`, madeOn(join(carousel, dir)));
      }
    }
    const lab = join(EXPORTS_DIR, "tiktok");
    if (existsSync(lab)) {
      for (const file of readdirSync(lab).filter((f) => f.endsWith(".mp4"))) {
        const code = /^([0-9A-Z]{3})-/.exec(file)?.[1];
        if (code) add(code, "tiktok-lab", `exports/tiktok/${file}`, madeOn(join(lab, file)));
      }
    }
    for (const day of calendar.days) {
      if (!day.clip || day.status === "planned" || day.status === "missed") continue;
      const record = { where: "calendar", ref: calendarExportRef(day.day), at: (day.renderedAt ?? now()).slice(0, 10) };
      if (recordExport(list, { id: day.wordId, word: day.word, code: day.code, level: day.level }, record)) added += 1;
    }
    return added > 0;
  });
  if (added) console.log(`  (${added} export(s) added to scripts/data/exported-words.json)`);
  return synced!;
}

/** One line per clash, for the commands that refuse or warn. */
function describeConflicts(calendar: Calendar, list: ExportedWords): string[] {
  return exportConflicts(calendar, list).map(
    ({ day, clashes }) =>
      `post ${day.day} (${day.date}, ${day.status}) is “${day.word}” ${day.code}, already out: ` +
      clashes.map((c) => `${c.where} ${c.ref} (${c.at})`).join("; "),
  );
}

/** Fill `dayNumbers` with words, keeping every other day's; `total` is the year's length. */
function fill(calendar: Calendar, words: CandidateWord[], dayNumbers: number[], total: number) {
  const byId = new Map(words.map((w) => [w.id, w]));
  // Never a word that has already gone out anywhere, nor one taken off the calendar.
  const excluded = new Set([...calendar.excluded, ...Object.keys(syncExported(calendar).words)]);
  const refill = new Set(dayNumbers);
  const taken = new Map<number, CandidateWord>();
  for (const day of calendar.days) {
    if (refill.has(day.day)) continue;
    // A day keeps its word even if the deck has since dropped it; the plan only needs its
    // id and topic to stay clear of it.
    taken.set(day.day, byId.get(day.wordId) ?? { id: day.wordId, word: day.word, level: day.level, topic: day.topic });
  }
  const picked = planDays({
    words: words.filter((w) => !excluded.has(w.id)),
    taken,
    dayNumbers,
    levelOf: (day) => levelForDay(calendar.order, day, slotOf(calendar, day).date, total),
    seed: calendar.seed,
  });
  calendar.days = calendar.days.filter((d) => !refill.has(d.day));
  for (const [day, word] of picked) calendar.days.push(newDay(calendar, day, word));
}

function plan() {
  const fresh = !existsSync(CALENDAR_FILE);
  const tomorrow = dateOfDay(todayInVietnam(Date.now()), 2);
  const order = (flag("order") ?? (fresh ? "mixed" : undefined)) as LevelOrder | undefined;
  if (order && !LEVEL_ORDERS.includes(order)) throw new Error(`--order is one of ${LEVEL_ORDERS.join(", ")}`);
  const blank = (): Calendar => ({
    version: 1,
    locale: "en",
    startDate: flag("start") ?? tomorrow,
    postTime: flag("time") ?? "19:00",
    order: order!,
    seed: Number(flag("seed") ?? 1),
    clipDir: flag("clip-dir") ?? DEFAULT_CLIP_DIR,
    excluded: [],
    days: [],
  });
  const { calendar, toFill, moved } = updateCalendar((calendar) => {
    const orderChanged = !fresh && order !== undefined && order !== calendar.order;
    if (!fresh) {
      if (flag("start")) calendar.startDate = flag("start")!;
      if (flag("time")) calendar.postTime = flag("time")!;
      if (order) calendar.order = order;
      if (flag("seed")) calendar.seed = Number(flag("seed"));
      if (flag("clip-dir")) calendar.clipDir = flag("clip-dir")!;
    }
    if (flag("burst")) {
      calendar.burst = parseBurst(flag("burst")!, flag("burst-times") ?? DEFAULT_BURST_TIMES);
    }
    dateOfDay(calendar.startDate, 1); // throws on a malformed --start
    const total = Number(flag("days") ?? Math.max(CALENDAR_DAYS, calendar.days.length));
    const have = new Set(calendar.days.map((d) => d.day));
    // New days, and every day not yet drafted whose level no longer fits the order (the order
    // changed, or its levels did: every order starts at MIN_POST_LEVEL since 2026-11-16). A
    // rendered day goes back to planned with its new word; its old clip is left on disk.
    const levelNow = (day: number) => levelForDay(calendar.order, day, slotOf(calendar, day).date, total);
    const toFill = Array.from({ length: total }, (_, i) => i + 1).filter((day) => {
      const kept = calendar.days.find((d) => d.day === day);
      if (!kept) return true;
      const open = kept.status === "planned" || kept.status === "rendered";
      return open && (orderChanged || kept.level !== levelNow(day));
    });
    fill(calendar, loadEligible(), toFill, total);
    // Nothing scheduled or posted is touched: its caption is already in TikTok.
    for (const day of calendar.days) {
      if (day.status === "planned" || day.status === "rendered") day.caption = caption(calendar, day.day, day.level);
    }
    const moved = refileClips(calendar);
    return { calendar, toFill, moved };
  }, fresh ? blank : loadCalendar);

  const levels = new Map<string, number>();
  for (const day of calendar.days) levels.set(day.level, (levels.get(day.level) ?? 0) + 1);
  console.log(`✓ ${CALENDAR_FILE.replace(`${ROOT}/`, "")}: ${calendar.days.length} days, ${toFill.length} newly planned`);
  console.log(`  day 1 is ${calendar.startDate}, posting at ${calendar.postTime} (Vietnam), order "${calendar.order}"`);
  if (calendar.burst) {
    const { days, perDay, times } = calendar.burst;
    const after = slotOf(calendar, days * perDay + 1);
    console.log(
      `  opening burst: ${perDay} a day for ${days} day(s) at ${times.join(", ")} (posts 1-${days * perDay}), ` +
        `then one a day at ${calendar.postTime} from ${after.date}`,
    );
  }
  if (moved) console.log(`  ${moved} rendered clip(s) renamed to their new date, captions beside them rewritten`);
  console.log(`  levels: ${[...levels].map(([l, n]) => `${l} ${n}`).join(", ")}`);
  console.log(`  clips go to ${expandHome(calendar.clipDir)}`);
}

/**
 * A rendered clip is named after its post's date. When the schedule moves a post, rename the
 * clip (and its caption file) to match, and write the caption afresh beside it, so the file
 * picked in TikTok Studio says the day it is for.
 * @returns How many clips moved
 */
function refileClips(calendar: Calendar): number {
  let moved = 0;
  for (const day of calendar.days) {
    if (day.status !== "rendered" || !day.clip) continue;
    const { date } = slotOf(calendar, day.day);
    const from = expandHome(day.clip);
    const to = join(dirname(from), `day-${pad(day.day)}-${date}-${slug(day.word)}.mp4`);
    if (from !== to && existsSync(from) && !existsSync(to)) {
      renameSync(from, to);
      const text = from.replace(/\.mp4$/, ".txt");
      if (existsSync(text)) renameSync(text, to.replace(/\.mp4$/, ".txt"));
      // The clip's song mixes and its cover hint travel with it.
      for (const p of MUSIC_PLATFORMS) {
        if (existsSync(mixedClipPath(from, p))) renameSync(mixedClipPath(from, p), mixedClipPath(to, p));
      }
      if (existsSync(`${from}.meta.json`)) renameSync(`${from}.meta.json`, `${to}.meta.json`);
      day.clip = to.startsWith(homedir()) ? `~${to.slice(homedir().length)}` : to;
      moved += 1;
    }
    const target = expandHome(day.clip);
    if (existsSync(target)) writeFileSync(target.replace(/\.mp4$/, ".txt"), `${day.caption}\n`);
  }
  return moved;
}

/** A word as a file name can hold it. */
function slug(word: string): string {
  return word.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "word";
}

/** Width, height and duration of a rendered clip, or null when ffprobe cannot read it. */
function probe(file: string): { width: number; height: number; duration: number } | null {
  const run = spawnSync(
    "ffprobe",
    ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "json", file],
    { encoding: "utf8" },
  );
  if (run.status !== 0) return null;
  const info = JSON.parse(run.stdout) as { streams?: { width: number; height: number }[]; format?: { duration: string } };
  const stream = info.streams?.[0];
  if (!stream || !info.format) return null;
  return { width: stream.width, height: stream.height, duration: Number(info.format.duration) };
}

async function render() {
  const calendar = loadCalendar();
  const base = flag("base") ?? "http://localhost:5195";
  // The TikTok lab's upload layout unless asked otherwise (scripts/render-export-clip.ts).
  const frame = flag("frame") ?? "4x5";
  if (frame !== "4x5" && frame !== "9x16") throw new Error('--frame is "4x5" or "9x16"');
  const look = flag("look");
  try {
    const answer = await fetch(`${base}/showcase`);
    if (!answer.ok) throw new Error(`HTTP ${answer.status}`);
  } catch (error) {
    throw new Error(`the dev server does not answer at ${base}/showcase (${(error as Error).message}); start it with \`npm run dev\``);
  }
  const todayDay = firstPostOnDate(calendar, todayInVietnam(Date.now()));
  const chosen = flag("day")
    ? parseDaySpec(flag("day")!).map((n) => {
        const day = calendar.days.find((d) => d.day === n);
        if (!day) throw new Error(`there is no day ${n}`);
        if (day.status !== "planned" && day.status !== "rendered") {
          throw new Error(`day ${n} is ${day.status}; only a planned or rendered day is rendered again`);
        }
        return day;
      })
    : calendar.days
        .filter((d) => d.status === "planned" && d.day >= Math.max(1, todayDay))
        .slice(0, Number(flag("days") ?? 14));
  if (chosen.length === 0) {
    console.log("Nothing to render: every day from today on already has a clip.");
    return;
  }
  // A word that has gone out elsewhere is never rendered again: swap the day first.
  const clashes = describeConflicts({ ...calendar, days: chosen }, syncExported(calendar));
  if (clashes.length) {
    throw new Error(`${clashes.join("\n  ")}\n  give each a new word first: npm run tiktok -- swap <post>`);
  }
  const dir = expandHome(calendar.clipDir);
  mkdirSync(dir, { recursive: true });
  console.log(`Rendering ${chosen.length} day(s) into ${dir} (about a minute each)`);
  for (const day of chosen) {
    const out = join(dir, `day-${pad(day.day)}-${day.date}-${slug(day.word)}.mp4`);
    console.log(`\n── day ${day.day} (${day.date}) · ${day.level} · “${day.word}” ${day.code}`);
    const attempt = () => {
      const run = spawnSync(
        "npx",
        [
          "tsx",
          join(ROOT, "scripts/render-export-clip.ts"),
          day.code,
          "--mode",
          "showcase",
          "--frame",
          frame,
          ...(look ? ["--look", look] : []),
          "--base",
          base,
          "--out",
          out,
          // A take cut off by the time limit is a failure, never a clip (it may stop before the answer).
          "--require-finish",
        ],
        { stdio: "inherit", cwd: ROOT },
      );
      return run.status === 0 ? probe(out) : null;
    };
    // What a post needs: a vertical full-HD clip, long enough to be the whole word and no
    // longer than the renderer's own two-minute ceiling.
    const usable = (info: ReturnType<typeof probe>) =>
      !!info && info.width === 1080 && info.height === 1920 && info.duration >= 15 && info.duration <= 120;
    let info = attempt();
    // One retry: headless Chrome now and then stops answering mid-take (a screencast ack
    // that never comes), and a fresh browser records the same word cleanly.
    if (!usable(info)) {
      console.log(`  day ${day.day} did not render; trying once more`);
      info = attempt();
    }
    if (!info || !usable(info)) {
      throw new Error(
        `day ${day.day} did not render a usable clip` +
          (info ? ` (${info.width}×${info.height}, ${info.duration.toFixed(1)}s)` : "") +
          `; the days before it are saved. Rerun with --day ${day.day} once it is fixed.`,
      );
    }
    day.caption = caption(calendar, day.day, day.level);
    writeFileSync(out.replace(/\.mp4$/, ".txt"), `${day.caption}\n`);
    const rendered = {
      caption: day.caption,
      status: "rendered" as DayStatus,
      clip: out.startsWith(homedir()) ? `~${out.slice(homedir().length)}` : out,
      durationSec: Math.round(info.duration * 10) / 10,
      renderedAt: now(),
    };
    Object.assign(day, rendered);
    // Only this post's fields, onto the calendar as it is now: the take ran for minutes, and a
    // publish run may have recorded other posts meanwhile.
    updateCalendar((fresh) => {
      Object.assign(postOf(fresh, day.day), rendered);
    });
    console.log(`✓ day ${day.day}: ${info.duration.toFixed(1)}s, caption beside it`);
    // Instagram's post. A failure here does not cost the clip: the day stays rendered for
    // TikTok and Facebook, and Instagram refuses it until the pages exist.
    try {
      await renderDayCarousel(day, base, dir);
      updateCalendar((fresh) => {
        postOf(fresh, day.day).carousel = day.carousel;
      });
    } catch (error) {
      console.log(`  ! no carousel for day ${day.day} (${(error as Error).message}); Instagram waits for: npm run tiktok -- carousel --day ${day.day}`);
    }
  }
  console.log(`\n✓ ${chosen.length} clip(s) ready. Upload them in TikTok Studio, then: npm run tiktok -- mark <days> scheduled`);
}

/** The account the carousel's closing page names: the channel's own Instagram. */
const INSTAGRAM_HANDLE = "@anh.chayla";

/** A path under the home folder written as ~/…, the way the calendar keeps them. */
function tilde(path: string): string {
  return path.startsWith(homedir()) ? `~${path.slice(homedir().length)}` : path;
}

/**
 * Render a day's finished pages (the Instagram carousel) beside its clip and note the folder
 * on the day. Needs the dev server, like the clip.
 */
async function renderDayCarousel(day: CalendarDay, base: string, dir: string) {
  const result = await renderCarousel({
    code: day.code,
    base,
    format: "4x5",
    handle: INSTAGRAM_HANDLE,
    out: join(dir, "carousels"),
  });
  if (result.warning) console.log(`  ! carousel: ${result.warning}`);
  day.carousel = tilde(result.folder);
  console.log(`✓ day ${day.day}: ${result.slides.length} pages for Instagram in ${day.carousel}`);
}

/** Render the finished pages for days that have none (or again): `carousel --day 6-7`. */
async function carousel() {
  const spec = flag("day");
  if (!spec) throw new Error("usage: carousel --day <days> [--base <url>]");
  const base = flag("base") ?? "http://localhost:5195";
  const answer = await fetch(`${base}/carousel/x`).catch(() => null);
  if (!answer) throw new Error(`the dev server does not answer at ${base}; start it with \`npm run dev\``);
  const calendar = loadCalendar();
  const dir = expandHome(calendar.clipDir);
  for (const n of parseDaySpec(spec)) {
    const day = calendar.days.find((d) => d.day === n);
    if (!day) throw new Error(`there is no day ${n}`);
    refuseBelowFloor(day);
    await renderDayCarousel(day, base, dir);
    updateCalendar((fresh) => {
      postOf(fresh, n).carousel = day.carousel;
    });
  }
}

/** A day's carousel slides as files, first page first; throws with the fix when there are none. */
function carouselImages(day: CalendarDay): string[] {
  const folder = day.carousel ? expandHome(day.carousel) : null;
  const names = folder && existsSync(folder) ? carouselSlides(readdirSync(folder)) : [];
  if (!folder || names.length === 0) {
    throw new Error(`post ${day.day} has no finished pages for Instagram: npm run tiktok -- carousel --day ${day.day}`);
  }
  return names.map((name) => join(folder, name));
}

function status() {
  const calendar = loadCalendar();
  const today = todayInVietnam(Date.now());
  const s = summarize(calendar, today);
  const total = calendar.days.length;
  const dayLabel = (d: CalendarDay | null) => (d ? `post ${d.day} (${d.date} ${d.time ?? calendar.postTime})` : "nothing");
  // Runway in calendar days, not posts: during a burst three posts are one day.
  const firstDate = dateOfDay(calendar.startDate, 1);
  const fromDay = Math.max(1, dayOfDate(calendar.startDate, today));
  const daysAhead = (d: CalendarDay | null) => (d ? dayOfDate(firstDate, d.date) - fromDay + 1 : 0);
  const cadence = calendar.burst
    ? `${calendar.burst.perDay} a day for the first ${calendar.burst.days} day(s) at ${calendar.burst.times.join(", ")}, then 1 a day at ${calendar.postTime}`
    : `1 a day at ${calendar.postTime}`;
  console.log(`TikTok calendar · ${total} posts from ${calendar.startDate} · ${cadence} (Vietnam time) · order "${calendar.order}"`);
  console.log(
    s.todayDay < 1
      ? `Today is ${today}: post 1 goes out in ${1 - s.todayDay} day(s).`
      : s.todayDay > total
        ? `Today is ${today}: the year ended on ${slotOf(calendar, total).date}.`
        : `Today is ${today}: post ${s.todayDay} of ${total} is today's first.`,
  );
  console.log(
    `  posted ${s.counts.posted} · scheduled ${s.counts.scheduled} · drafted ${s.counts.drafted} · rendered ${s.counts.rendered} · planned ${s.counts.planned} · missed ${s.counts.missed}`,
  );
  console.log(`  streak: ${s.streak} post(s) out in a row`);
  console.log(`  scheduled through ${dayLabel(s.scheduledThrough)}: ${daysAhead(s.scheduledThrough)} day(s) in hand`);
  console.log(`  rendered through ${dayLabel(s.renderedThrough)}: ${daysAhead(s.renderedThrough)} day(s) of clips`);

  const warnings: string[] = [];
  for (const day of s.overdue) {
    warnings.push(`post ${day.day} (${day.date}) has gone but is still "${day.status}": mark it posted (with --url) or missed`);
  }
  if (s.todayDay <= total) {
    if (daysAhead(s.scheduledThrough) < 3) warnings.push("fewer than 3 days are scheduled: upload the next clips in TikTok Studio");
    if (daysAhead(s.renderedThrough) < 14) warnings.push("fewer than 14 days have clips: npm run tiktok -- render");
  }
  for (const clash of describeConflicts(calendar, syncExported(calendar))) {
    warnings.push(`${clash}: npm run tiktok -- swap ${/^post (\d+)/.exec(clash)![1]}`);
  }
  if (warnings.length) {
    console.log("\nNeeds attention:");
    for (const warning of warnings) console.log(`  ! ${warning}`);
  }

  console.log("\nNext posts:");
  const from = Math.max(1, s.todayDay);
  for (const day of calendar.days.filter((d) => d.day >= from).slice(0, 12)) {
    console.log(
      `  ${String(day.day).padStart(3)}  ${day.date} ${day.time ?? calendar.postTime}  ${day.level}  ${day.status.padEnd(9)}  ${day.word} (${day.code})`,
    );
  }
}

function mark() {
  const [spec, next] = positional;
  const statuses: DayStatus[] = ["planned", "rendered", "drafted", "scheduled", "posted", "missed"];
  if (!spec || !next || !statuses.includes(next as DayStatus)) {
    throw new Error(`usage: mark <days> <${statuses.join("|")}> [--url <link>] [--note <text>]`);
  }
  updateCalendar((calendar) => {
    const numbers = parseDaySpec(spec);
    const url = flag("url");
    if (url && numbers.length !== 1) throw new Error("--url belongs to one day");
    for (const n of numbers) {
      const day = calendar.days.find((d) => d.day === n);
      if (!day) throw new Error(`there is no day ${n}`);
      if ((next === "scheduled" || next === "posted") && !day.clip) {
        console.log(`  ! day ${n} has no clip in the calendar; marking it ${next} anyway`);
      }
      day.status = next as DayStatus;
      if (next === "scheduled") day.scheduledAt = now();
      if (next === "drafted") day.draftedAt = now();
      if (next === "posted") day.postedAt = now();
      if (url) day.url = url;
      if (flag("note")) day.note = flag("note")!;
    }
  });
  console.log(`✓ day(s) ${spec} marked ${next}`);
}

function swap() {
  const [spec] = positional;
  if (!spec) throw new Error("usage: swap <days> [--word <word id or word>]");
  const numbers = parseDaySpec(spec);
  const words = loadEligible();
  let before = new Map<number, string>();
  const calendar = updateCalendar((calendar) => {

    const wanted = flag("word");
    if (wanted && numbers.length !== 1) throw new Error("--word belongs to one day");
    for (const n of numbers) {
      const day = calendar.days.find((d) => d.day === n);
      if (!day) throw new Error(`there is no day ${n}`);
      if (day.status !== "planned" && day.status !== "rendered") {
        throw new Error(`day ${n} is ${day.status}; only a planned or rendered day can change its word`);
      }
    }
    before = new Map(numbers.map((n) => [n, calendar.days.find((d) => d.day === n)!.word]));
    for (const n of numbers) calendar.excluded.push(calendar.days.find((d) => d.day === n)!.wordId);
    if (wanted) {
      const word = words.find((w) => w.id === wanted || w.word.toLowerCase() === wanted.toLowerCase());
      if (!word) throw new Error(`“${wanted}” is not an eligible word in the English deck`);
      if (calendar.days.some((d) => d.wordId === word.id && d.day !== numbers[0])) {
        throw new Error(`“${word.word}” already has day ${calendar.days.find((d) => d.wordId === word.id)!.day}`);
      }
      calendar.days = calendar.days.filter((d) => d.day !== numbers[0]);
      calendar.days.push(newDay(calendar, numbers[0]!, word));
    } else {
      fill(calendar, words, numbers, Math.max(CALENDAR_DAYS, calendar.days.length));
    }
    return calendar;
  });
  for (const n of numbers) {
    const day = calendar.days.find((d) => d.day === n)!;
    console.log(`✓ day ${n}: “${before.get(n)}” → “${day.word}” (${day.level}, ${day.code}); render it again`);
  }
}

function dayWithClip(): CalendarDay {
  const [spec] = positional;
  if (!spec) throw new Error("name a day");
  const calendar = loadCalendar();
  const day = calendar.days.find((d) => d.day === parseDaySpec(spec)[0]);
  if (!day) throw new Error(`there is no day ${spec}`);
  return day;
}

function copyCaption(day: CalendarDay) {
  // The emulator shares the Mac's clipboard, so this is pasteable there as well.
  spawnSync("pbcopy", { input: day.caption });
  console.log(`${day.caption}\n\n(copied to the clipboard)`);
}

/**
 * Stop a post whose word is easier than MIN_POST_LEVEL from going anywhere: the user's rule
 * is B1 and up on every platform, whatever the calendar still holds from before the floor.
 * @throws naming the day, its word and level, and the fix
 */
function refuseBelowFloor(day: CalendarDay) {
  if (isPostLevel(day.level)) return;
  throw new Error(
    `post ${day.day} is “${day.word}” (${day.level}), below ${MIN_POST_LEVEL}: nothing under ${MIN_POST_LEVEL} goes out. ` +
      `Give it a new word first: npm run tiktok -- swap ${day.day}`,
  );
}

/**
 * Save one day's clip as a TikTok draft in the emulator, with the calendar's caption, and
 * mark it drafted. The poster exits non-zero unless the draft really was saved.
 * @param pass - the flags handed on to post-to-tiktok.ts
 * @returns whether the draft was saved
 */
function draftDay(day: CalendarDay, pass: string[]): boolean {
  if (!day.clip) throw new Error(`day ${day.day} has no clip yet: npm run tiktok -- render --day ${day.day}`);
  refuseBelowFloor(day);
  console.log(`\n── post ${day.day} (${day.date} ${day.time ?? ""}) · ${day.level} · “${day.word}” ${day.code}`);
  const attempt = () =>
    spawnSync(
      "npx",
      [
        "tsx",
        join(ROOT, "scripts/post-to-tiktok.ts"),
        expandHome(day.clip!),
        "--boot",
        "--code",
        day.code,
        "--day",
        String(day.day),
        "--caption",
        day.caption,
        ...pass,
      ],
      { stdio: "inherit", cwd: ROOT },
    ).status === 0;
  // One retry: the poster starts TikTok from scratch each time, so a popup or a slow first
  // start that sank the first attempt is usually gone on the second.
  if (!attempt()) {
    console.log(`  post ${day.day} failed; trying once more`);
    if (!attempt()) return false;
  }
  if (pass.includes("--no-draft")) return true;
  // Onto the calendar as it is now: it may have moved on while TikTok was being driven.
  updateCalendar((calendar) => {
    const saved = postOf(calendar, day.day);
    saved.status = "drafted";
    saved.draftedAt = now();
  });
  return true;
}

function handoff() {
  const day = dayWithClip();
  const pass = ["no-draft", "no-location", "no-cover", "no-sound"].filter((f) => rest.includes(`--${f}`)).map((f) => `--${f}`);
  if (!draftDay(day, pass)) process.exit(1);
  console.log(
    pass.includes("--no-draft")
      ? `\nAfter posting: npm run tiktok -- mark ${day.day} posted --url <link>`
      : `\n✓ post ${day.day} drafted. Post it from TikTok's Drafts in the emulator, then: npm run tiktok -- mark ${day.day} posted --url <link>`,
  );
}

/** Draft every post due within --hours (24 by default); exit non-zero if any is left undone. */
function draftDue() {
  const hours = Number(flag("hours") ?? 24);
  if (!(hours > 0)) throw new Error("--hours is a positive number");
  const { ready, unrendered } = postsToDraft(loadCalendar(), Date.now(), hours);
  const failed: number[] = [];
  for (const day of ready) if (!draftDay(day, [])) failed.push(day.day);
  const drafted = ready.filter((d) => !failed.includes(d.day)).map((d) => d.day);
  console.log(
    `\n${drafted.length ? `✓ drafted post(s) ${drafted.join(", ")}` : "Nothing drafted"} (due within ${hours}h)`,
  );
  const problems = [
    ...failed.map((n) => `post ${n} was not drafted`),
    ...unrendered.map((d) => `post ${d.day} (${d.date} ${d.time ?? ""}) is due but has no clip: npm run tiktok -- render --day ${d.day}`),
  ];
  if (problems.length) throw new Error(problems.join("\n  "));
}

/** Where Instagram's cover should sit: the clip's letter hint, as the TikTok cover does. */
function coverMsOf(day: CalendarDay): number | null {
  const clip = day.clip ? expandHome(day.clip) : null;
  if (!clip || !day.durationSec || !existsSync(`${clip}.meta.json`)) return null;
  const fraction = readJson<{ hintFraction?: number | null }>(`${clip}.meta.json`).hintFraction;
  return typeof fraction === "number" ? fraction * day.durationSec * 1000 : null;
}

/**
 * Change one platform's track of one day on the calendar as it is now, so other writers are
 * not undone. Nothing is saved when `change` returns false.
 * @returns What `change` returned
 */
function updateTrack<R>(dayNumber: number, platform: PublishPlatform, change: (track: PlatformPost) => R): R {
  return updateCalendar((calendar) => {
    const day = postOf(calendar, dayNumber);
    day.platforms ??= {};
    const track = (day.platforms[platform] ??= { status: "pending" });
    return change(track);
  });
}

/** A post being sent this long is taken to have died mid-upload, as postsToPublish takes it. */
const PUBLISHING_STALE_MS = 30 * 60_000;

/**
 * Take a post for one platform: mark it publishing, unless it is already out there or another
 * run is sending it right now. Checked and marked under the calendar's lock, so of two runs
 * that both found it due, only one uploads it.
 * @returns null when this run may send it, or why it may not
 */
function claimTrack(dayNumber: number, platform: PublishPlatform): string | null {
  return updateTrack(dayNumber, platform, (t) => {
    if (t.status === "posted") return `already posted on ${platform}${t.url ? ` (${t.url})` : ""}`;
    if (t.status === "publishing" && Date.now() - Date.parse(t.at ?? "") < PUBLISHING_STALE_MS) {
      return `another run is sending it to ${platform} (since ${t.at})`;
    }
    t.status = "publishing";
    t.at = now();
    t.error = null;
    t.attempts = (t.attempts ?? 0) + 1;
    return null;
  });
}

/** What a platform still lacks before it can publish, or null when it is connected. */
function platformReady(platform: PublishPlatform): string | null {
  return platform === "youtube" ? youtubeReady(loadYouTubeConfig(ROOT)) : metaReady(loadMetaConfig(ROOT), platform);
}

/**
 * Publish one day on one platform and record the outcome on the calendar (and, once it is
 * live, on the exported-words list). A dry run touches neither.
 * @returns Whether it went out
 */
async function publishDay(dayNumber: number, platform: PublishPlatform, dryRun: boolean): Promise<boolean> {
  const day = loadCalendar().days.find((d) => d.day === dayNumber);
  if (!day) throw new Error(`there is no post ${dayNumber}`);
  refuseBelowFloor(day);
  // Instagram posts the finished pages as a carousel, never the video; Facebook and YouTube the clip.
  const images = platform === "instagram" ? carouselImages(day) : null;
  if (!images && !day.clip) throw new Error(`post ${dayNumber} has no clip yet: npm run tiktok -- render --day ${dayNumber}`);
  if (musicHolds(day, platform)) {
    throw new Error(
      `post ${dayNumber}'s ${platform} song is not accepted yet: accept it on /posting or run npm run tiktok -- music accept ${dayNumber} --platform ${platform}`,
    );
  }
  const video = images ? null : videoFor(day, platform);
  const meta = { ...loadMetaConfig(ROOT), ...(dryRun ? { dryRun: true } : {}) };
  const youtube = { ...loadYouTubeConfig(ROOT), ...(dryRun ? { dryRun: true } : {}) };
  const isDry = platform === "youtube" ? youtube.dryRun : meta.dryRun;
  console.log(`\n── ${platform} · post ${day.day} (${day.date} ${day.time ?? ""}) · “${day.word}”${isDry ? " · dry run" : ""}`);
  if (!isDry) {
    const taken = claimTrack(day.day, platform);
    if (taken) {
      console.log(`  skipped: ${taken}`);
      return true;
    }
  }
  try {
    const log = (line: string) => console.log(line);
    const caption = captionForPlatform(day, platform);
    const result: { id: string; url: string | null; privacy?: string } =
      platform === "youtube"
        ? await publishShort({ config: youtube, file: video!, title: youtubeTitle(day, WORD_HOOK), description: caption, log })
        : images
          ? await publishCarousel({ config: meta, images, caption, log })
          : await publishReel({ config: meta, platform, file: video!, caption, coverMs: coverMsOf(day), log });
    if (isDry) {
      console.log("✓ dry run: every step would be sent");
      return true;
    }
    updateTrack(day.day, platform, (t) =>
      Object.assign(t, {
        status: "posted",
        id: result.id,
        url: result.url,
        at: now(),
        error: null,
        ...(result.privacy ? { privacy: result.privacy } : {}),
      }),
    );
    updateExported((list) =>
      recordExport(list, { id: day.wordId, word: day.word, code: day.code, level: day.level }, {
        where: platform,
        ref: calendarExportRef(day.day),
        at: now().slice(0, 10),
      }),
    );
    console.log(`✓ posted on ${platform}${result.url ? `: ${result.url}` : ""}${result.privacy && result.privacy !== "public" ? ` (${result.privacy})` : ""}`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!isDry) updateTrack(day.day, platform, (t) => Object.assign(t, { status: "failed", error: message, at: now() }));
    console.error(`✗ ${platform}: ${message}`);
    return false;
  }
}

const isMusicPlatform = (platform: PublishPlatform): platform is MusicPlatform =>
  (MUSIC_PLATFORMS as readonly string[]).includes(platform);
const soundsDirOf = (calendar: Calendar, platform: MusicPlatform) => soundsDirFor(calendar, platform, SOUNDS_DIRS);
/** Where each library's tracks come from, for the messages that send the admin there. */
const LIBRARY_NAME: Record<MusicPlatform, string> = {
  facebook: "Meta's Sound Collection",
  youtube: "YouTube Studio's Audio Library",
};

/**
 * The video a platform uploads: the clip as rendered, or its mix with the accepted song,
 * mixed again when the file is gone (a clip renamed when the schedule moved).
 */
function videoFor(day: CalendarDay, platform: PublishPlatform): string {
  const clip = expandHome(day.clip!);
  const music = day.platforms?.[platform]?.music;
  if (!music?.song || !isMusicPlatform(platform)) return clip;
  const out = mixedClipPath(clip, platform);
  if (!existsSync(out)) {
    console.log(`  mixing “${songTitle(music.song)}” into the clip again (no mix on disk)`);
    mixSong({ clip, song: music.song, startSec: music.startSec, out, soundsDir: soundsDirOf(loadCalendar(), platform) });
  }
  return out;
}

/** Every song earlier posts carry on a platform, for pickSong. */
function songsUsed(calendar: Calendar, platform: MusicPlatform): { song: string; day: number }[] {
  return calendar.days.flatMap((d) => {
    const song = d.platforms?.[platform]?.music?.song;
    return song ? [{ song, day: d.day }] : [];
  });
}

/**
 * Give a post a song (or none) on one platform and mix it in, as a proposal the admin then
 * accepts.
 * @param song - a file in that platform's sounds folder, null for no music, or undefined to pick one
 * @returns The song set
 */
function proposeSong(dayNumber: number, platform: MusicPlatform, song: string | null | undefined, startSec: number): string | null {
  const calendar = loadCalendar();
  const day = calendar.days.find((d) => d.day === dayNumber);
  if (!day) throw new Error(`there is no post ${dayNumber}`);
  if (!day.clip) throw new Error(`post ${dayNumber} has no clip yet`);
  const track = day.platforms?.[platform];
  if (track?.status === "posted" || track?.status === "publishing") throw new Error(`post ${dayNumber} is ${track.status} on ${platform}`);
  const dir = soundsDirOf(calendar, platform);
  const songs = listSongs(dir);
  const chosen = song === undefined ? pickSong(songs, songsUsed(calendar, platform), dayNumber) : song;
  if (song === undefined && !chosen) throw new Error(`no songs in ${dir}: download tracks from ${LIBRARY_NAME[platform]} there`);
  if (chosen && !songs.includes(chosen)) throw new Error(`no song “${chosen}” in ${dir}`);
  if (chosen) {
    const out = mixedClipPath(expandHome(day.clip), platform);
    mixSong({ clip: expandHome(day.clip), song: chosen, startSec, out, soundsDir: dir });
  }
  updateTrack(dayNumber, platform, (t) => {
    t.music = { song: chosen, startSec: chosen ? startSec : 0, status: "proposed", at: now() };
  });
  return chosen;
}

/** Let a post go out with its song; publish it now when its slot has already passed. */
async function acceptSong(dayNumber: number, platform: MusicPlatform) {
  const day = loadCalendar().days.find((d) => d.day === dayNumber);
  if (!day) throw new Error(`there is no post ${dayNumber}`);
  const music = day.platforms?.[platform]?.music;
  if (!music) throw new Error(`post ${dayNumber} has no ${platform} song to accept: npm run tiktok -- music ${dayNumber} --platform ${platform}`);
  updateTrack(dayNumber, platform, (t) => {
    t.music = { ...music, status: "accepted", at: now() };
  });
  console.log(`✓ post ${dayNumber} goes out on ${platform} with ${music.song ? `“${songTitle(music.song)}”` : "no music"}`);
  const late = postsToPublish(loadCalendar(), Date.now(), platform).some((d) => d.day === dayNumber);
  if (late && !platformReady(platform)) {
    console.log("  its time has passed: publishing now");
    if (!(await publishDay(dayNumber, platform, false))) process.exitCode = 1;
  }
}

/** The one music platform a --platform flag names (Facebook when it names none). */
function musicPlatformFlag(): MusicPlatform {
  const wanted = flag("platform") ?? "facebook";
  if (!(MUSIC_PLATFORMS as readonly string[]).includes(wanted)) throw new Error(`--platform is ${MUSIC_PLATFORMS.join(" or ")}`);
  return wanted as MusicPlatform;
}

/** `music <post> [--platform facebook|youtube] [--song <file|none>] [--start <s>]` and `music accept <post>`. */
async function music() {
  const platform = musicPlatformFlag();
  if (positional[0] === "accept") {
    const n = Number(positional[1]);
    if (!Number.isInteger(n)) throw new Error("usage: music accept <post> [--platform facebook|youtube]");
    return acceptSong(n, platform);
  }
  const n = Number(positional[0]);
  if (!Number.isInteger(n)) {
    const calendar = loadCalendar();
    for (const p of MUSIC_PLATFORMS) {
      const songs = listSongs(soundsDirOf(calendar, p));
      console.log(`${p}: ${songs.length} song(s) in ${soundsDirOf(calendar, p)} (${LIBRARY_NAME[p]})`);
      for (const song of songs) console.log(`  ${song}`);
    }
    console.log("\nusage: music <post> [--platform facebook|youtube] [--song <file|none>] [--start <s>] · music accept <post> [--platform …]");
    return;
  }
  const songFlag = flag("song");
  const start = Number(flag("start") ?? 0);
  if (!(start >= 0)) throw new Error("--start is seconds into the song");
  const chosen = proposeSong(n, platform, songFlag === undefined ? undefined : songFlag === "none" ? null : songFlag, start);
  const day = loadCalendar().days.find((d) => d.day === n)!;
  console.log(
    chosen
      ? `✓ ${platform} · post ${n} “${day.word}”: “${songTitle(chosen)}” from ${start}s, mixed into ${mixedClipPath(day.clip!, platform)}`
      : `✓ ${platform} · post ${n} “${day.word}”: no music`,
  );
  console.log(`  it waits for: npm run tiktok -- music accept ${n} --platform ${platform} (or Accept on /posting)`);
}

/**
 * Propose a song for every post due within --hours that has none, on each music platform
 * that is connected and has songs.
 */
function musicDue() {
  const hours = Number(flag("hours") ?? 24);
  if (!(hours > 0)) throw new Error("--hours is a positive number");
  const problems: string[] = [];
  for (const platform of MUSIC_PLATFORMS) {
    const calendar = loadCalendar();
    if (platformReady(platform)) continue; // not connected: nothing to hold
    if (!listSongs(soundsDirOf(calendar, platform)).length) {
      console.log(`${platform}: no songs in ${soundsDirOf(calendar, platform)}; posts go out silent.`);
      continue;
    }
    const nowMs = Date.now();
    const due = calendar.days.filter((d) => {
      const slot = postTimeMs(d, calendar.postTime);
      const track = d.platforms?.[platform];
      return (
        d.clip &&
        isPostLevel(d.level) &&
        slot > nowMs - 3_600_000 &&
        slot <= nowMs + hours * 3_600_000 &&
        !track?.music &&
        (!track || track.status === "pending")
      );
    });
    for (const day of due) {
      try {
        const song = proposeSong(day.day, platform, undefined, 0);
        console.log(`✓ ${platform} · post ${day.day} “${day.word}” (${day.date} ${day.time ?? ""}): “${songTitle(song!)}”`);
      } catch (error) {
        problems.push(`${platform} post ${day.day}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (!due.length) console.log(`${platform}: every post due within ${hours}h already has its song.`);
    else console.log(`  accept them on /posting, or: npm run tiktok -- music accept <post> --platform ${platform}`);
  }
  if (problems.length) throw new Error(problems.join("\n  "));
}

/** The platforms a --platform flag names (all of them when it says all or nothing). */
function platformsFlag(): PublishPlatform[] {
  const wanted = flag("platform") ?? "all";
  if (wanted === "all") return [...PUBLISH_PLATFORMS];
  const list = wanted.split(",") as PublishPlatform[];
  for (const p of list) if (!PUBLISH_PLATFORMS.includes(p)) throw new Error(`--platform is ${PUBLISH_PLATFORMS.join(", ")} or all`);
  return list;
}

async function publish() {
  const [spec] = positional;
  if (!spec) throw new Error(`usage: publish <post> [--platform ${PUBLISH_PLATFORMS.join("|")}|all] [--dry-run]`);
  let failed = 0;
  for (const platform of platformsFlag()) if (!(await publishDay(Number(spec), platform, rest.includes("--dry-run")))) failed += 1;
  if (failed) process.exitCode = 1;
}

/** Everything due now on each platform that is set up; silent when nothing is. */
async function publishDue() {
  const dryRun = rest.includes("--dry-run");
  let failed = 0;
  let sent = 0;
  let waiting = 0;
  for (const platform of PUBLISH_PLATFORMS) {
    if (!dryRun && platformReady(platform)) continue; // not connected yet
    for (const day of postsToPublish(loadCalendar(), Date.now(), platform)) {
      if (await publishDay(day.day, platform, dryRun)) sent += 1;
      else failed += 1;
    }
    for (const day of postsAwaitingMusic(loadCalendar(), Date.now(), platform)) {
      console.log(`… ${platform} · post ${day.day} “${day.word}” waits for its song to be accepted on /posting`);
      waiting += 1;
    }
  }
  if (sent || failed || waiting) console.log(`\npublished ${sent}, failed ${failed}, waiting on a song ${waiting}`);
  if (failed) process.exitCode = 1;
}

/** Sign in to Google once and keep YouTube's refresh token in .env.local. */
async function youtubeSetupCommand() {
  const { channel, channelId } = await youtubeSetup(ROOT);
  console.log(`✓ YouTube channel “${channel}” (${channelId}) connected; its token is in .env.local`);
  console.log("  Check that is the Anh.ChayLá channel before any upload (docs/youtube-publishing.md).");
}

/**
 * Move the post times: `times --burst-times 13:30,20:30,02:30 [--time 19:00]`. Posts that have
 * already gone out keep their recorded times; every other post is re-dated, its rendered clip
 * renamed to match. The publish job reads the times when it is installed, so this ends by
 * saying to reinstall it.
 */
function times() {
  const moved = updateCalendar((calendar) => {
    const burstTimes = flag("burst-times");
    const daily = flag("time");
    if (!burstTimes && !daily) throw new Error("usage: times [--burst-times HH:MM,HH:MM,…] [--time HH:MM]");
    if (daily) {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(daily)) throw new Error(`"${daily}" is not a time (HH:MM)`);
      calendar.postTime = daily;
    }
    if (burstTimes) {
      if (!calendar.burst) throw new Error("this calendar has no opening burst; set one with plan --burst");
      const { days, perDay } = calendar.burst;
      calendar.burst = parseBurst(`${days}x${perDay}`, burstTimes);
    }
    return refileClips(calendar);
  });
  const fresh = loadCalendar();
  const today = todayInVietnam(Date.now());
  console.log(
    `✓ posting ${fresh.burst ? `${fresh.burst.times.join(", ")} during the burst, then ` : ""}${fresh.postTime} a day (Vietnam)`,
  );
  if (moved) console.log(`  ${moved} rendered clip(s) renamed to their new date`);
  for (const day of fresh.days.filter((d) => d.date >= today && !settled(d)).slice(0, 6)) {
    console.log(`  ${String(day.day).padStart(3)}  ${day.date} ${day.time ?? fresh.postTime}  ${day.status.padEnd(9)} ${day.word}`);
  }
  console.log("\nReinstall the jobs so publishing follows: npx tsx scripts/tiktok-auto.ts install");
}

/** Exchange META_USER_TOKEN for the Page token and Instagram id, into .env.local. */
async function metaSetup() {
  const result = await exchangeForPageToken(loadMetaConfig(ROOT), flag("page") ?? null);
  writeEnvLocal(ROOT, {
    META_PAGE_ID: result.pageId,
    META_PAGE_TOKEN: result.pageToken,
    META_IG_USER_ID: result.igUserId,
    // Short-lived and spent: the Page token is what lasts.
    META_USER_TOKEN: null,
  });
  console.log(`✓ Facebook Page “${result.pageName}” (${result.pageId}) connected; its token is in .env.local`);
  console.log(
    result.igUserId
      ? `✓ Instagram account ${result.igUserId} (linked to that Page) connected`
      : "! that Page has no linked Instagram professional account: link one in Meta Business Suite and rerun meta-setup",
  );
}

/** List what has gone out, or record an export no tool saw (`exported add <code> …`). */
function exported() {
  const calendar = loadCalendar();
  const list = syncExported(calendar);
  if (positional[0] === "add") {
    const code = positional[1]?.toUpperCase();
    const where = flag("where");
    const ref = flag("ref");
    if (!code || !where || !ref) throw new Error("usage: exported add <code> --where <tiktok|carousel|…> --ref <link or note> [--at YYYY-MM-DD]");
    const word = loadDeck().find((w) => w.shareCode?.toUpperCase() === code);
    if (!word) throw new Error(`no word in the English deck has code ${code}`);
    const at = flag("at") ?? now().slice(0, 10);
    const changed = updateExported((fresh) =>
      recordExport(fresh, { id: word.id, word: word.word, code, level: word.level }, { where, ref, at, ...(flag("note") ? { note: flag("note")! } : {}) }),
    );
    console.log(changed ? `✓ “${word.word}” ${code} recorded as exported (${where}, ${ref})` : `“${word.word}” already has that export`);
    return;
  }
  const entries = Object.entries(list.words);
  const byWhere = new Map<string, number>();
  for (const [, entry] of entries) for (const e of entry.exports) byWhere.set(e.where, (byWhere.get(e.where) ?? 0) + 1);
  console.log(`${entries.length} word(s) exported · ${[...byWhere].map(([w, n]) => `${w} ${n}`).join(" · ")}`);
  for (const [id, entry] of entries.sort(([, a], [, b]) => a.word.localeCompare(b.word))) {
    const where = [...new Set(entry.exports.map((e) => e.where))].join(", ");
    console.log(`  ${entry.word.padEnd(16)} ${entry.code}  ${entry.level.padEnd(3)} ${where.padEnd(22)} ${id}`);
  }
  const clashes = describeConflicts(calendar, list);
  console.log(clashes.length ? `\nWould go out twice:\n  ${clashes.join("\n  ")}` : "\nNo calendar day repeats an exported word.");
}

async function main() {
  switch (command) {
    case "plan":
      return plan();
    case "render":
      return render();
    case "status":
      return status();
    case "mark":
      return mark();
    case "swap":
      return swap();
    case "caption":
      return copyCaption(dayWithClip());
    case "handoff":
      return handoff();
    case "draft-due":
      return draftDue();
    case "exported":
      return exported();
    case "carousel":
      return carousel();
    case "publish":
      return publish();
    case "publish-due":
      return publishDue();
    case "meta-setup":
      return metaSetup();
    case "music":
      return music();
    case "music-due":
      return musicDue();
    case "youtube-setup":
      return youtubeSetupCommand();
    case "times":
      return times();
    default:
      throw new Error("commands: plan, render, status, mark, swap, caption, handoff, draft-due, exported, publish, publish-due, music, music-due, meta-setup, youtube-setup, times (see the top of scripts/tiktok.ts)");
  }
}

main().catch((error) => {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
