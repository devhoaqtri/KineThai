/**
 * Run the TikTok calendar: a word a post, a post a day for a year, optionally opening with a
 * burst of several a day (scripts/data/tiktok-calendar.json). A "day" number below is a
 * post's number; its date and time come from the schedule (lib/tiktok-calendar slotOfPost).
 *
 *   plan      choose a word for every day of the year (keeps days already under way)
 *   render    make the clips for the next days, with their captions beside them
 *   status    what is posted, scheduled and rendered, and how many days are left in hand
 *   mark      record what happened: a day scheduled in TikTok Studio, posted, or missed
 *   swap      give a day a different word
 *   caption   print a day's caption and copy it (the emulator shares the Mac's clipboard)
 *   handoff   open a day's clip in TikTok's editor in the emulator (post-to-tiktok.ts)
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
 *   npm run tiktok -- handoff 3
 *
 * Rendering needs the dev server (`npm run dev`, port 5195), because the showcase route
 * exists only there, and records in real time: about a minute a day.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WORD_HOOK } from "../src/features/vocabulary/lib/first-visit";
import { siteAddress } from "../src/features/vocabulary/lib/target-language";
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
  summarize,
  todayInVietnam,
  type Calendar,
  type CalendarDay,
  type CandidateWord,
  type DayStatus,
  type LevelOrder,
} from "./lib/tiktok-calendar";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CALENDAR_FILE = join(ROOT, "scripts/data/tiktok-calendar.json");
const DECK_DIR = join(ROOT, "src/features/vocabulary/data/packs");
const REPORTS_FILE = join(ROOT, "src/features/vocabulary/data/word-reports.json");
const CLUE_LEDGER_FILE = join(ROOT, "scripts/data/clue-review-ledger.json");
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

function saveCalendar(calendar: Calendar) {
  for (const day of calendar.days) Object.assign(day, slotOf(calendar, day.day));
  calendar.days.sort((a, b) => a.day - b.day);
  writeFileSync(CALENDAR_FILE, `${JSON.stringify(calendar, null, 2)}\n`);
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
    address: siteAddress(calendar.locale),
  });
}

/** Fill `dayNumbers` with words, keeping every other day's; `total` is the year's length. */
function fill(calendar: Calendar, words: CandidateWord[], dayNumbers: number[], total: number) {
  const byId = new Map(words.map((w) => [w.id, w]));
  const excluded = new Set(calendar.excluded);
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
  const order = (flag("order") ?? (fresh ? "rising" : undefined)) as LevelOrder | undefined;
  if (order && !LEVEL_ORDERS.includes(order)) throw new Error(`--order is one of ${LEVEL_ORDERS.join(", ")}`);
  const calendar: Calendar = fresh
    ? {
        version: 1,
        locale: "en",
        startDate: flag("start") ?? tomorrow,
        postTime: flag("time") ?? "19:00",
        order: order!,
        seed: Number(flag("seed") ?? 1),
        clipDir: flag("clip-dir") ?? DEFAULT_CLIP_DIR,
        excluded: [],
        days: [],
      }
    : loadCalendar();
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
  // New days, and, when the level order changed, every day not yet rendered: its level moved.
  const toFill = Array.from({ length: total }, (_, i) => i + 1).filter(
    (day) => !have.has(day) || (orderChanged && calendar.days.find((d) => d.day === day)?.status === "planned"),
  );
  fill(calendar, loadEligible(), toFill, total);
  // Nothing scheduled or posted is touched: its caption is already in TikTok.
  for (const day of calendar.days) {
    if (day.status === "planned" || day.status === "rendered") day.caption = caption(calendar, day.day, day.level);
  }
  const moved = refileClips(calendar);
  saveCalendar(calendar);

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
  const dir = expandHome(calendar.clipDir);
  mkdirSync(dir, { recursive: true });
  console.log(`Rendering ${chosen.length} day(s) into ${dir} (about a minute each)`);
  for (const day of chosen) {
    const out = join(dir, `day-${pad(day.day)}-${day.date}-${slug(day.word)}.mp4`);
    console.log(`\n── day ${day.day} (${day.date}) · ${day.level} · “${day.word}” ${day.code}`);
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
      ],
      { stdio: "inherit", cwd: ROOT },
    );
    const info = run.status === 0 ? probe(out) : null;
    // What a post needs: a vertical full-HD clip, long enough to be the whole word and no
    // longer than the renderer's own two-minute ceiling.
    const fine = info && info.width === 1080 && info.height === 1920 && info.duration >= 15 && info.duration <= 120;
    if (!fine) {
      saveCalendar(calendar);
      throw new Error(
        `day ${day.day} did not render a usable clip` +
          (info ? ` (${info.width}×${info.height}, ${info.duration.toFixed(1)}s)` : "") +
          `; the days before it are saved. Rerun with --day ${day.day} once it is fixed.`,
      );
    }
    day.caption = caption(calendar, day.day, day.level);
    writeFileSync(out.replace(/\.mp4$/, ".txt"), `${day.caption}\n`);
    Object.assign(day, {
      status: "rendered" as DayStatus,
      clip: out.startsWith(homedir()) ? `~${out.slice(homedir().length)}` : out,
      durationSec: Math.round(info.duration * 10) / 10,
      renderedAt: now(),
    });
    saveCalendar(calendar);
    console.log(`✓ day ${day.day}: ${info.duration.toFixed(1)}s, caption beside it`);
  }
  console.log(`\n✓ ${chosen.length} clip(s) ready. Upload them in TikTok Studio, then: npm run tiktok -- mark <days> scheduled`);
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
    `  posted ${s.counts.posted} · scheduled ${s.counts.scheduled} · rendered ${s.counts.rendered} · planned ${s.counts.planned} · missed ${s.counts.missed}`,
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
  const statuses: DayStatus[] = ["planned", "rendered", "scheduled", "posted", "missed"];
  if (!spec || !next || !statuses.includes(next as DayStatus)) {
    throw new Error(`usage: mark <days> <${statuses.join("|")}> [--url <link>] [--note <text>]`);
  }
  const calendar = loadCalendar();
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
    if (next === "posted") day.postedAt = now();
    if (url) day.url = url;
    if (flag("note")) day.note = flag("note")!;
  }
  saveCalendar(calendar);
  console.log(`✓ day(s) ${spec} marked ${next}`);
}

function swap() {
  const [spec] = positional;
  if (!spec) throw new Error("usage: swap <days> [--word <word id or word>]");
  const calendar = loadCalendar();
  const numbers = parseDaySpec(spec);
  const words = loadEligible();
  const wanted = flag("word");
  if (wanted && numbers.length !== 1) throw new Error("--word belongs to one day");
  for (const n of numbers) {
    const day = calendar.days.find((d) => d.day === n);
    if (!day) throw new Error(`there is no day ${n}`);
    if (day.status !== "planned" && day.status !== "rendered") {
      throw new Error(`day ${n} is ${day.status}; only a planned or rendered day can change its word`);
    }
  }
  const before = new Map(numbers.map((n) => [n, calendar.days.find((d) => d.day === n)!.word]));
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
  saveCalendar(calendar);
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

function handoff() {
  const day = dayWithClip();
  if (!day.clip) throw new Error(`day ${day.day} has no clip yet: npm run tiktok -- render --day ${day.day}`);
  const run = spawnSync("npx", ["tsx", join(ROOT, "scripts/post-to-tiktok.ts"), expandHome(day.clip), "--boot"], {
    stdio: "inherit",
    cwd: ROOT,
  });
  if (run.status !== 0) process.exit(run.status ?? 1);
  console.log("");
  copyCaption(day);
  console.log(`After posting: npm run tiktok -- mark ${day.day} posted --url <link>`);
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
    default:
      throw new Error("commands: plan, render, status, mark, swap, caption, handoff (see the top of scripts/tiktok.ts)");
  }
}

main().catch((error) => {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
