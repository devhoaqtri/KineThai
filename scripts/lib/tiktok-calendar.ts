/**
 * The TikTok calendar: one word a day for a year, and what has happened to each day.
 *
 * The calendar is a file (scripts/data/tiktok-calendar.json), like the decks and the review
 * ledgers, so its history is in git. Each day names its word up front, so the whole year can
 * be read and changed before a clip exists. A day moves planned → rendered → drafted (saved
 * as a TikTok draft in the emulator) or scheduled (uploaded to TikTok Studio) → posted (or
 * missed); `scripts/tiktok.ts` is the command that moves it.
 *
 * Dates are calendar dates in Vietnam (UTC+7, no daylight saving), the audience's day. A
 * post's date and time are never decided on their own: they come from the schedule (the
 * start date, the daily time and an optional opening burst, see slotOfPost), so moving the
 * start or changing the cadence re-dates the year without touching which word falls where.
 *
 * A "day" in the file is a POST: entry N is the N-th word to go out. With no burst that is
 * also the N-th day; with one (say 3 a day for the first 7 days) the first 21 posts share
 * 7 dates, and one a day follows.
 *
 * Everything here is pure. The command does the reading, writing, rendering and printing.
 *
 * Exports: CALENDAR_DAYS, LEVEL_ORDERS, LevelOrder, DayStatus, CalendarDay, Calendar, Burst,
 *   PostSchedule, CandidateWord, parseDaySpec, parseBurst, dateOfDay, todayInVietnam,
 *   dayOfDate, weekdayOf, burstPosts, slotOfPost, firstPostOnDate, levelForDay, eligibleWords,
 *   planDays, captionFor, summarize, postTimeMs, postsToDraft, ExportedWords, ExportRecord,
 *   recordExport, calendarExportRef, exportConflicts, META_PLATFORMS, MetaPlatform,
 *   PlatformPost, postsToPublish, captionForPlatform
 */

/** How many hashtags TikTok keeps in a caption; it silently drops the rest. */
export const MAX_HASHTAGS = 5;

/** A year of days. */
export const CALENDAR_DAYS = 365;

/**
 * How the year walks through the levels:
 *   rising   a quarter each of A1, A2, B1, B2: a year that climbs with the viewer
 *   weekly   A1 and A2 on weekdays, B1 and B2 at the weekend
 *   easiest  A1 every day
 */
export const LEVEL_ORDERS = ["rising", "weekly", "easiest"] as const;
export type LevelOrder = (typeof LEVEL_ORDERS)[number];

export type DayStatus = "planned" | "rendered" | "drafted" | "scheduled" | "posted" | "missed";

export type CalendarDay = {
  /** The post's number: the N-th word to go out (the N-th day when there is no burst). */
  day: number;
  /** Derived from the schedule (slotOfPost); kept in the file so it can be read there. */
  date: string;
  /** When it goes out, Vietnam time, HH:MM; derived like `date`. */
  time?: string;
  wordId: string;
  word: string;
  code: string;
  level: string;
  topic: string;
  status: DayStatus;
  caption: string;
  /** The rendered clip, once there is one. */
  clip: string | null;
  durationSec: number | null;
  renderedAt: string | null;
  scheduledAt: string | null;
  /** When it was saved as a TikTok draft in the emulator; absent on days from before drafts. */
  draftedAt?: string | null;
  postedAt: string | null;
  /** The post's TikTok link, once it is live. */
  url: string | null;
  /**
   * The same clip on the other platforms (scripts/lib/meta-publish.ts), each on its own
   * track: TikTok's own state stays in `status` above.
   */
  platforms?: Partial<Record<MetaPlatform, PlatformPost>>;
  note: string | null;
};

export type Calendar = {
  version: 1;
  locale: "en";
  /** Day 1, as a date in Vietnam. */
  startDate: string;
  /** When each post goes out, Vietnam time; what TikTok Studio is set to. */
  postTime: string;
  /** Several posts a day at the start, then one a day at `postTime`. Absent: one a day. */
  burst?: Burst | null;
  order: LevelOrder;
  seed: number;
  /** Where clips are written; outside the repo, a year is several gigabytes. */
  clipDir: string;
  /** Word ids swapped out of a day, so planning never brings them back. */
  excluded: string[];
  days: CalendarDay[];
};

/**
 * An opening run of several posts a day: `perDay` posts on each of the first `days` dates,
 * at `times` (one per post, Vietnam time). After it the calendar posts once a day.
 */
export type Burst = { days: number; perDay: number; times: string[] };

/** What a post's date and time are worked out from. */
export type PostSchedule = Pick<Calendar, "startDate" | "postTime" | "burst">;

/** The part of a deck word the planner and the caption read. */
export type CandidateWord = {
  id: string;
  word: string;
  level: string;
  topic: string;
  shareCode?: string;
  ipa?: string;
  meaningVi?: string;
  pos?: string;
  usage?: { en?: string }[];
};

const DAY_MS = 86_400_000;
const VIETNAM_OFFSET_MS = 7 * 3_600_000;

/**
 * Days named on the command line: "3", "1-10", "1-10,12,20-22".
 * @param spec - the list as typed
 * @returns The day numbers, ascending and without repeats
 * @throws On anything that is not a day or a range of days
 * @pure true
 */
export function parseDaySpec(spec: string): number[] {
  const days = new Set<number>();
  for (const part of spec.split(",").map((p) => p.trim()).filter(Boolean)) {
    const range = /^(\d+)(?:-(\d+))?$/.exec(part);
    if (!range) throw new Error(`"${part}" is not a day or a range of days`);
    const from = Number(range[1]);
    const to = Number(range[2] ?? range[1]);
    if (from < 1 || to < from) throw new Error(`"${part}" is not a range of days`);
    for (let day = from; day <= to; day += 1) days.add(day);
  }
  return [...days].sort((a, b) => a - b);
}

function parseDate(date: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error(`"${date}" is not a date (YYYY-MM-DD)`);
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function formatDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * @param startDate - day 1
 * @param day - the day's number
 * @returns The day's date
 * @pure true
 */
export function dateOfDay(startDate: string, day: number): string {
  return formatDate(parseDate(startDate) + (day - 1) * DAY_MS);
}

/**
 * @param now - the moment, in ms
 * @returns Today's date in Vietnam
 * @pure true
 */
export function todayInVietnam(now: number): string {
  return formatDate(now + VIETNAM_OFFSET_MS);
}

/**
 * @param startDate - day 1
 * @param date - any date
 * @returns The day number that date falls on; 0 or less before the start
 * @pure true
 */
export function dayOfDate(startDate: string, date: string): number {
  return Math.round((parseDate(date) - parseDate(startDate)) / DAY_MS) + 1;
}

/**
 * Read a burst as typed: "7x3" (7 days, 3 a day) and its times "11:30,19:00,21:30".
 * @param spec - DAYSxPERDAY, or "none" / "0" for no burst
 * @param times - comma-separated HH:MM, one per post of a day
 * @returns The burst, or null for none
 * @throws On a malformed spec, a time that is not HH:MM, or the wrong number of times
 * @pure true
 */
export function parseBurst(spec: string, times: string): Burst | null {
  if (spec === "none" || spec === "0") return null;
  const match = /^(\d+)x(\d+)$/.exec(spec.trim());
  if (!match) throw new Error(`"${spec}" is not a burst: write DAYSxPERDAY, e.g. 7x3`);
  const days = Number(match[1]);
  const perDay = Number(match[2]);
  if (days < 1 || perDay < 2) throw new Error(`"${spec}": a burst is at least 1 day of 2 or more posts`);
  const list = times.split(",").map((t) => t.trim()).filter(Boolean);
  for (const time of list) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error(`"${time}" is not a time (HH:MM)`);
  }
  if (list.length !== perDay) throw new Error(`a ${perDay}-a-day burst needs ${perDay} times, got ${list.length}`);
  return { days, perDay, times: [...list].sort() };
}

/** @returns How many posts the opening burst holds (0 without one). @pure true */
export function burstPosts(schedule: PostSchedule): number {
  return schedule.burst ? schedule.burst.days * schedule.burst.perDay : 0;
}

/**
 * When a post goes out.
 * @param schedule - start date, daily time and burst
 * @param post - the post's number, from 1
 * @returns Its date and time, Vietnam time
 * @pure true
 */
export function slotOfPost(schedule: PostSchedule, post: number): { date: string; time: string } {
  const burst = schedule.burst;
  const opening = burstPosts(schedule);
  if (burst && post <= opening) {
    const index = post - 1;
    return {
      date: dateOfDay(schedule.startDate, Math.floor(index / burst.perDay) + 1),
      time: burst.times[index % burst.perDay] ?? schedule.postTime,
    };
  }
  return {
    date: dateOfDay(schedule.startDate, (burst?.days ?? 0) + (post - opening)),
    time: schedule.postTime,
  };
}

/**
 * The first post that goes out on a date: the counterpart of dayOfDate for posts.
 * @param schedule - start date, daily time and burst
 * @param date - any date
 * @returns That post's number; 0 or less before the start (as dayOfDate)
 * @pure true
 */
export function firstPostOnDate(schedule: PostSchedule, date: string): number {
  const day = dayOfDate(schedule.startDate, date);
  const burst = schedule.burst;
  if (day < 1) return day;
  if (burst && day <= burst.days) return (day - 1) * burst.perDay + 1;
  return burstPosts(schedule) + (day - (burst?.days ?? 0));
}

/** @returns 0 for Sunday … 6 for Saturday. @pure true */
export function weekdayOf(date: string): number {
  return new Date(parseDate(date)).getUTCDay();
}

/**
 * The level a day draws its word from.
 * @param order - the year's walk through the levels
 * @param day - the day's number
 * @param date - the day's date (the weekly order reads its weekday)
 * @param total - days in the year
 * @returns A deck level, e.g. "A1"
 * @pure true
 */
export function levelForDay(order: LevelOrder, day: number, date: string, total = CALENDAR_DAYS): string {
  if (order === "easiest") return "A1";
  if (order === "weekly") {
    const weekday = weekdayOf(date);
    const weekend = weekday === 0 || weekday === 6;
    // Alternate inside each band, so neither level waits a whole week.
    return weekend ? (weekday === 6 ? "B1" : "B2") : day % 2 === 1 ? "A1" : "A2";
  }
  const quarter = Math.min(3, Math.floor(((day - 1) * 4) / total));
  return ["A1", "A2", "B1", "B2"][quarter]!;
}

/**
 * The words that may go out: everything the clip shows is there (share code, IPA, meaning,
 * word type, example), no reader has reported it, and no reviewer has found its clue broken.
 * A public post is held to a stricter line than the feed's blocklist: one open report is
 * enough to leave a word out of the year.
 * @param words - the deck
 * @param reportedIds - word ids, or the words themselves, with an open report
 * @param brokenIds - card ids with a "broken" verdict in the clue review ledger
 * @returns The words in deck order
 * @pure true
 */
export function eligibleWords(
  words: readonly CandidateWord[],
  reportedIds: ReadonlySet<string>,
  brokenIds: ReadonlySet<string>,
): CandidateWord[] {
  return words.filter(
    (w) =>
      !!w.shareCode &&
      !!w.ipa &&
      !!w.meaningVi &&
      !!w.pos &&
      !!w.usage?.[0]?.en &&
      !reportedIds.has(w.id) &&
      !reportedIds.has(w.word.toLowerCase()) &&
      !brokenIds.has(w.id),
  );
}

/** A small seeded generator, so the same seed plans the same year. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * Pick a word for every day in `dayNumbers`, keeping every other day as it is. No word is
 * used twice in the year, and no two days in a row share a topic.
 * @param input.words - eligible words
 * @param input.taken - day number → the word already there, for days that keep theirs
 * @param input.dayNumbers - the days to fill, ascending
 * @param input.levelOf - the level each day draws from
 * @param input.seed - the year's seed; a day's own number is mixed in, so filling one day
 *   again does not reshuffle the others
 * @returns day number → word, for the days filled
 * @throws When a level runs out of words
 * @pure true
 */
export function planDays(input: {
  words: readonly CandidateWord[];
  taken: ReadonlyMap<number, CandidateWord>;
  dayNumbers: readonly number[];
  levelOf: (day: number) => string;
  seed: number;
}): Map<number, CandidateWord> {
  const used = new Set([...input.taken.values()].map((w) => w.id));
  const byLevel = new Map<string, CandidateWord[]>();
  for (const word of input.words) {
    const list = byLevel.get(word.level) ?? [];
    list.push(word);
    byLevel.set(word.level, list);
  }
  const picked = new Map<number, CandidateWord>();
  const wordOn = (day: number) => picked.get(day) ?? input.taken.get(day);
  for (const day of input.dayNumbers) {
    const level = input.levelOf(day);
    const pool = shuffled(byLevel.get(level) ?? [], mulberry32(input.seed * 1_000_003 + day));
    const before = wordOn(day - 1)?.topic;
    const after = wordOn(day + 1)?.topic;
    const free = pool.filter((w) => !used.has(w.id));
    const choice =
      free.find((w) => w.topic !== before && w.topic !== after) ??
      free.find((w) => w.topic !== before) ??
      free[0];
    if (!choice) throw new Error(`level ${level} has no unused word left for day ${day}`);
    used.add(choice.id);
    picked.set(day, choice);
  }
  return picked;
}

/**
 * The post's caption. It never names the word or its meaning: the clip is a guess, and a
 * caption is on screen while it plays (the same rule as a share link's message). It counts
 * words, not days ("Từ số 12/365"): with several posts a day, a day count would repeat.
 * It carries at most MAX_HASHTAGS tags, since TikTok drops any beyond that.
 * @param input.day - the post's number
 * @param input.total - posts in the year
 * @param input.level - the word's level
 * @param input.hook - the clip's own opening line (WORD_HOOK)
 * @param input.address - the site, for viewers who want more
 * @returns Text to paste into TikTok's caption box
 * @pure true
 */
export function captionFor(input: {
  day: number;
  total: number;
  level: string;
  hook: string;
  address: string;
}): string {
  return [
    `${input.hook} 🤔 Đoán trước khi đáp án hiện ra!`,
    `Từ số ${input.day}/${input.total} · trình độ ${input.level}`,
    "Bình luận đáp án của bạn nhé 👇",
    `Học thêm mỗi ngày tại ${input.address}`,
    "",
    // TikTok keeps the first five hashtags of a caption and drops the rest on paste.
    `#hoctienganh #tuvungtienganh #tienganhmoingay #englishvocabulary #${input.level.toLowerCase()}`,
  ].join("\n");
}

/** What `status` prints, worked out from the calendar and today's date. */
export type CalendarSummary = {
  today: string;
  /** The first post due today; 0 or less before the start, above the total after the end. */
  todayDay: number;
  counts: Record<DayStatus, number>;
  /** The last day, from today on, up to which every day is scheduled or posted. */
  scheduledThrough: CalendarDay | null;
  /** The last day, from today on, up to which every day has at least a clip. */
  renderedThrough: CalendarDay | null;
  /** Days already gone (before today) that were never marked posted or missed. */
  overdue: CalendarDay[];
  /** Posted days in a row, ending on the latest day that should be out by now. */
  streak: number;
};

/**
 * @param calendar - the calendar
 * @param today - today's date in Vietnam
 * @returns Counts, runway and what needs attention
 * @pure true
 */
export function summarize(calendar: Calendar, today: string): CalendarSummary {
  const counts: Record<DayStatus, number> = {
    planned: 0,
    rendered: 0,
    drafted: 0,
    scheduled: 0,
    posted: 0,
    missed: 0,
  };
  for (const day of calendar.days) counts[day.status] += 1;
  const todayDay = firstPostOnDate(calendar, today);
  const from = Math.max(1, todayDay);
  const ahead = calendar.days.filter((d) => d.day >= from).sort((a, b) => a.day - b.day);
  const through = (ok: (d: CalendarDay) => boolean): CalendarDay | null => {
    let last: CalendarDay | null = null;
    for (const day of ahead) {
      if (!ok(day)) break;
      last = day;
    }
    return last;
  };
  const scheduledThrough = through((d) => d.status === "scheduled" || d.status === "posted");
  const renderedThrough = through((d) => d.status !== "planned" && d.status !== "missed");
  const overdue = calendar.days.filter(
    (d) => d.day < todayDay && d.status !== "posted" && d.status !== "missed",
  );
  let streak = 0;
  const gone = calendar.days
    .filter((d) => d.day < todayDay || (d.day === todayDay && d.status === "posted"))
    .sort((a, b) => b.day - a.day);
  for (const day of gone) {
    if (day.status !== "posted") break;
    streak += 1;
  }
  return { today, todayDay, counts, scheduledThrough, renderedThrough, overdue, streak };
}

/**
 * When a post goes out, as an instant.
 * @param day - a day carrying its date and time (Vietnam, UTC+7 with no daylight saving)
 * @param fallbackTime - the calendar's daily time, for a day stored without its own
 * @returns Milliseconds since the epoch
 * @pure true
 */
export function postTimeMs(day: Pick<CalendarDay, "date" | "time">, fallbackTime: string): number {
  return Date.parse(`${day.date}T${day.time ?? fallbackTime}:00+07:00`);
}

/**
 * The posts an unattended run should save as drafts now: every one dated today (Vietnam)
 * or later that goes out within `hours`. A post whose time has already passed today is
 * still drafted, since a late post beats none; days before today are overdue, not due.
 * @param calendar - the calendar
 * @param nowMs - the current instant
 * @param hours - how far ahead to look
 * @returns `ready` (rendered, to draft) and `unrendered` (due but with no clip yet), by post
 * @pure true
 */
export function postsToDraft(
  calendar: Calendar,
  nowMs: number,
  hours: number,
): { ready: CalendarDay[]; unrendered: CalendarDay[] } {
  const today = todayInVietnam(nowMs);
  const until = nowMs + hours * 3_600_000;
  const due = calendar.days
    .filter((d) => d.date >= today && postTimeMs(d, calendar.postTime) <= until)
    .sort((a, b) => a.day - b.day);
  return {
    ready: due.filter((d) => d.status === "rendered"),
    unrendered: due.filter((d) => d.status === "planned"),
  };
}

/**
 * Where a word has gone out. `where` names the tool or channel ("calendar", "carousel",
 * "tiktok-lab", "tiktok"); `ref` says which one (a calendar post, an export folder, a
 * clip file, a TikTok post) so the same export is never recorded twice.
 */
export type ExportRecord = { where: string; ref: string; at: string; note?: string };

/**
 * Every word ever exported, by word id (scripts/data/exported-words.json): the guard
 * against posting a word twice. Records are only ever added, never dropped, so a word
 * whose clip or folder has since been deleted stays taken.
 */
export type ExportedWords = {
  version: 1;
  words: Record<string, { word: string; code: string; level: string; exports: ExportRecord[] }>;
};

/** The ref a calendar post records its export under. @pure true */
export function calendarExportRef(day: number): string {
  return `post ${day}`;
}

/**
 * Add one export, unless that exact one (same where and ref) is already there.
 * @returns Whether the list changed
 */
export function recordExport(
  list: ExportedWords,
  word: { id: string; word: string; code: string; level: string },
  record: ExportRecord,
): boolean {
  const entry = (list.words[word.id] ??= { word: word.word, code: word.code, level: word.level, exports: [] });
  if (entry.exports.some((e) => e.where === record.where && e.ref === record.ref)) return false;
  entry.exports.push(record);
  return true;
}

/**
 * Calendar days whose word has already gone out somewhere other than that very day: the
 * duplicates waiting to happen. A day's own calendar export does not count against it.
 * @returns Each such day with the exports that clash
 * @pure true
 */
export function exportConflicts(
  calendar: Pick<Calendar, "days">,
  list: ExportedWords,
): { day: CalendarDay; clashes: ExportRecord[] }[] {
  const out: { day: CalendarDay; clashes: ExportRecord[] }[] = [];
  for (const day of calendar.days) {
    const own = calendarExportRef(day.day);
    // The post's own exports (its clip, and the same clip on Facebook or Instagram) all
    // carry its ref; only an export under another ref is a repeat.
    const clashes = (list.words[day.wordId]?.exports ?? []).filter((e) => e.ref !== own);
    if (clashes.length) out.push({ day, clashes });
  }
  return out.sort((a, b) => a.day.day - b.day.day);
}

/** The platforms published through Meta's API, besides TikTok's own track. */
export const META_PLATFORMS = ["facebook", "instagram"] as const;
export type MetaPlatform = (typeof META_PLATFORMS)[number];

/**
 * One post on one platform. `pending` (or absent) waits for its slot; `publishing` is a
 * run in flight; `failed` is retried by the scheduled job until `attempts` reaches
 * MAX_PUBLISH_ATTEMPTS; `skipped` is the admin saying no.
 */
export type PlatformPost = {
  status: "pending" | "publishing" | "posted" | "failed" | "skipped";
  /** This platform's own caption, when it differs from the calendar's. */
  caption?: string | null;
  id?: string | null;
  url?: string | null;
  at?: string | null;
  error?: string | null;
  attempts?: number;
};

/** Tries the scheduled job makes at a failing post before leaving it to the admin. */
export const MAX_PUBLISH_ATTEMPTS = 3;

/** The caption a platform posts: its own when set, else the calendar's. @pure true */
export function captionForPlatform(day: CalendarDay, platform: MetaPlatform): string {
  return day.platforms?.[platform]?.caption?.trim() || day.caption;
}

/**
 * The posts a platform should get now: rendered (or further along on TikTok), their slot
 * reached, at most `graceHours` late, and not posted, skipped, in flight or out of tries.
 * A post far past its slot is left alone: going out hours late in the middle of the night
 * is worse than the admin deciding.
 * @param calendar - the calendar
 * @param nowMs - the current instant
 * @param platform - which platform's track
 * @param graceHours - how late a post may still go out on its own
 * @returns The due posts, by post number
 * @pure true
 */
export function postsToPublish(
  calendar: Calendar,
  nowMs: number,
  platform: MetaPlatform,
  graceHours = 6,
): CalendarDay[] {
  return calendar.days
    .filter((day) => {
      if (!day.clip || day.status === "planned" || day.status === "missed") return false;
      const track = day.platforms?.[platform];
      // A run that died mid-publish leaves `publishing` behind; after half an hour it is
      // treated as a failure and tried again.
      const stale = track?.status === "publishing" && nowMs - Date.parse(track.at ?? "") > 30 * 60_000;
      const retry = (track?.status === "failed" || stale) && (track?.attempts ?? 0) < MAX_PUBLISH_ATTEMPTS;
      if (track && track.status !== "pending" && !retry) return false;
      const slot = postTimeMs(day, calendar.postTime);
      return slot <= nowMs && nowMs - slot <= graceHours * 3_600_000;
    })
    .sort((a, b) => a.day - b.day);
}
