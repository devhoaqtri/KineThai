/**
 * The TikTok calendar: one word a day for a year, and what has happened to each day.
 *
 * The calendar is a file (scripts/data/tiktok-calendar.json), like the decks and the review
 * ledgers, so its history is in git. Each day names its word up front, so the whole year can
 * be read and changed before a clip exists. A day moves planned → rendered → scheduled →
 * posted (or missed); `scripts/tiktok.ts` is the command that moves it.
 *
 * Dates are calendar dates in Vietnam (UTC+7, no daylight saving), the audience's day. A
 * day's date is never stored on its own: it is always the start date plus the day's number,
 * so moving the start re-dates the year without touching which word falls where.
 *
 * Everything here is pure. The command does the reading, writing, rendering and printing.
 *
 * Exports: CALENDAR_DAYS, LEVEL_ORDERS, LevelOrder, DayStatus, CalendarDay, Calendar,
 *   CandidateWord, parseDaySpec, dateOfDay, todayInVietnam, dayOfDate, weekdayOf, levelForDay,
 *   eligibleWords, planDays, captionFor, summarize
 */

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

export type DayStatus = "planned" | "rendered" | "scheduled" | "posted" | "missed";

export type CalendarDay = {
  day: number;
  /** Derived from the calendar's start; kept in the file so it can be read there. */
  date: string;
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
  postedAt: string | null;
  /** The post's TikTok link, once it is live. */
  url: string | null;
  note: string | null;
};

export type Calendar = {
  version: 1;
  locale: "en";
  /** Day 1, as a date in Vietnam. */
  startDate: string;
  /** When each post goes out, Vietnam time; what TikTok Studio is set to. */
  postTime: string;
  order: LevelOrder;
  seed: number;
  /** Where clips are written; outside the repo, a year is several gigabytes. */
  clipDir: string;
  /** Word ids swapped out of a day, so planning never brings them back. */
  excluded: string[];
  days: CalendarDay[];
};

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
 * caption is on screen while it plays (the same rule as a share link's message).
 * @param input.day - the day's number
 * @param input.total - days in the year
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
    `Ngày ${input.day}/${input.total} · trình độ ${input.level}`,
    "Bình luận đáp án của bạn nhé 👇",
    `Học thêm mỗi ngày tại ${input.address}`,
    "",
    `#hoctienganh #tuvungtienganh #tienganhmoingay #learnenglish #englishvocabulary #${input.level.toLowerCase()}`,
  ].join("\n");
}

/** What `status` prints, worked out from the calendar and today's date. */
export type CalendarSummary = {
  today: string;
  /** Today's day number; 0 or less before the start, above the total after the end. */
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
    scheduled: 0,
    posted: 0,
    missed: 0,
  };
  for (const day of calendar.days) counts[day.status] += 1;
  const todayDay = dayOfDate(calendar.startDate, today);
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
