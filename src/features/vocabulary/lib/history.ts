/** On-device viewing history with sliding-window repeat caps. Exports: history helpers. Depends on: ./day (localStorage only). */
import { nextDay, previousDay, startOfDay } from "./day";
import type { Locale } from "./locale";
import { BASE_LOCALE, DEFAULT_LOCALE } from "./locale";

export const DAY_MS = 24 * 60 * 60 * 1000;
export const THREE_DAYS_MS = 3 * DAY_MS;
export const WEEK_MS = 7 * DAY_MS;
export const HISTORY_KEY = "wordcrawler:view-history:v1";

export type ViewHistory = Record<string, number[]>;

function isValidHistory(value: unknown): value is ViewHistory {
  if (typeof value !== "object" || value === null) return false;
  return Object.values(value as Record<string, unknown>).every(
    (item) => Array.isArray(item) && item.every((t) => typeof t === "number" && Number.isFinite(t)),
  );
}

/** Remove timestamps older than one week; drop empty words. @param history Raw map. @param now Reference time. @returns Pruned map (mutates input). */
export function pruneHistory(history: ViewHistory, now: number = Date.now()): ViewHistory {
  const cutoff = now - WEEK_MS;
  for (const [wordId, times] of Object.entries(history)) {
    const kept = times.filter((t) => t > cutoff && t <= now + 60_000);
    if (kept.length) history[wordId] = kept;
    else delete history[wordId];
  }
  return history;
}

/** Load history from localStorage; never throws. @returns Pruned map. */
export function loadHistory(now: number = Date.now()): ViewHistory {
  try {
    if (typeof localStorage === "undefined") return {};
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!isValidHistory(parsed)) return {};
    return pruneHistory(parsed, now);
  } catch {
    return {};
  }
}

/** Persist history; never throws. @param history Map to store. */
export function saveHistory(history: ViewHistory): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    // Quota or privacy mode — history simply stays in memory.
  }
}

/** Count views inside a sliding window. @param times Timestamps. @param now Reference. @param windowMs Window. @returns Count. */
export function countSince(times: number[], now: number, windowMs: number): number {
  const cutoff = now - windowMs;
  let count = 0;
  for (const t of times) if (t > cutoff && t <= now + 60_000) count++;
  return count;
}

/** Check repeat caps: <=1/day, <=2/3days, <=3/week. @param history Map. @param wordId Word id. @param now Reference. @returns True when the word may be shown. */
export function isWordAllowed(
  history: ViewHistory,
  wordId: string,
  now: number = Date.now(),
): boolean {
  const times = history[wordId];
  if (!times || !times.length) return true;
  if (countSince(times, now, DAY_MS) >= 1) return false;
  if (countSince(times, now, THREE_DAYS_MS) >= 2) return false;
  if (countSince(times, now, WEEK_MS) >= 3) return false;
  return true;
}

/** Earliest time the word becomes showable again. @param history Map. @param wordId Word id. @param now Reference. @returns Timestamp (now when already allowed). */
export function nextAvailableAt(
  history: ViewHistory,
  wordId: string,
  now: number = Date.now(),
): number {
  if (isWordAllowed(history, wordId, now)) return now;
  const times = [...(history[wordId] ?? [])].sort((a, b) => b - a);
  const blocked: number[] = [];
  const day = times.filter((t) => t > now - DAY_MS);
  if (day.length >= 1) blocked.push(Math.min(...day) + DAY_MS);
  const three = times.filter((t) => t > now - THREE_DAYS_MS);
  if (three.length >= 2)
    blocked.push(three.sort((a, b) => a - b)[three.length - 2] + THREE_DAYS_MS);
  const week = times.filter((t) => t > now - WEEK_MS);
  if (week.length >= 3) blocked.push(week.sort((a, b) => a - b)[week.length - 3] + WEEK_MS);
  return blocked.length ? Math.max(...blocked) : now;
}

/** Record one view, returning a new map. @param history Previous map. @param wordId Word id. @param now Reference. @returns New pruned map. */
export function recordView(
  history: ViewHistory,
  wordId: string,
  now: number = Date.now(),
): ViewHistory {
  const next: ViewHistory = { ...history, [wordId]: [...(history[wordId] ?? []), now] };
  return pruneHistory(next, now);
}

/** What the memory sheet shows: the rolling week, or one day by its local midnight. */
export type HistoryScope = "week" | number;

/** The three cells in the settings sheet, each a scope of the same history. */
export type MemoryCell = "yesterday" | "today" | "week";

/** @returns The scope a memory cell shows. @pure true */
export function scopeOfCell(cell: MemoryCell, now: number): HistoryScope {
  if (cell === "week") return "week";
  const today = startOfDay(now);
  return cell === "today" ? today : previousDay(today);
}

/** One distinct word inside a scope. */
export type HistoryEntry = {
  id: string;
  /** The newest view inside the scope. */
  at: number;
  /** Views inside the scope. */
  views: number;
};

/**
 * The distinct words seen in a scope, newest view first.
 *
 * The bounds are the ones `historyStats` counts, so a list can never disagree with the
 * number printed on the cell that opened it. A day is a calendar day; the week is the
 * rolling seven days.
 * @param history Map. @param scope Week or day. @param now Reference time. @returns Entries.
 * @pure true
 */
export function historyEntries(
  history: ViewHistory,
  scope: HistoryScope,
  now: number = Date.now(),
): HistoryEntry[] {
  const from = scope === "week" ? now - WEEK_MS + 1 : scope;
  const to = scope === "week" ? Number.POSITIVE_INFINITY : nextDay(scope);
  const entries: HistoryEntry[] = [];
  for (const [id, times] of Object.entries(history)) {
    const inScope = times.filter((t) => t >= from && t < to && t <= now + 60_000);
    if (inScope.length) entries.push({ id, at: Math.max(...inScope), views: inScope.length });
  }
  return entries.sort((a, b) => b.at - a.at || a.id.localeCompare(b.id));
}

/** One column of the week's rhythm. */
export type HistoryDay = { start: number; ids: string[] };

/**
 * The last seven calendar days, oldest first, each with the distinct words seen on it.
 * @param history Map. @param now Reference time. @returns Seven days ending today.
 * @pure true
 */
export function historyDays(history: ViewHistory, now: number = Date.now()): HistoryDay[] {
  const days: HistoryDay[] = [];
  let start = startOfDay(now);
  for (let index = 0; index < 7; index += 1) {
    days.unshift({ start, ids: historyEntries(history, start, now).map((entry) => entry.id) });
    start = previousDay(start);
  }
  return days;
}

export type HistoryStats = {
  /** Words seen since local midnight. */
  distinctToday: number;
  /** Words seen during the previous calendar day. */
  distinctYesterday: number;
  distinct7d: number;
  totalViews7d: number;
};

/**
 * Summarize distinct words seen. Today and yesterday are calendar days (local midnight to
 * midnight), so the two cells never count the same view; the week is the rolling seven
 * days the repeat caps use.
 * @param history Map. @param now Reference. @returns Stats.
 */
export function historyStats(history: ViewHistory, now: number = Date.now()): HistoryStats {
  const today = startOfDay(now);
  const yesterday = previousDay(today);
  let distinctToday = 0;
  let distinctYesterday = 0;
  let distinct7d = 0;
  let totalViews7d = 0;
  for (const times of Object.values(history)) {
    if (times.some((t) => t >= today && t <= now + 60_000)) distinctToday++;
    if (times.some((t) => t >= yesterday && t < today)) distinctYesterday++;
    if (countSince(times, now, WEEK_MS) > 0) distinct7d++;
    totalViews7d += countSince(times, now, WEEK_MS);
  }
  return { distinctToday, distinctYesterday, distinct7d, totalViews7d };
}

/**
 * Countdown duration for the "seen every word" scene, localized per locale. The unit
 * words ("phút/giờ/ngày", Thai, Japanese) are looked up per language so the stream's
 * empty-state sentence (`stream.nextUnlock`) never reads Vietnamese under another locale.
 * @param target Future time. @param now Reference. @param locale Selected content locale.
 * @returns A bare duration like "5 giờ 12 phút" (vi), safe to place after the locale's `stream.nextUnlock` lead-in.
 */
export function formatCountdown(
  target: number,
  now: number = Date.now(),
  locale: Locale = DEFAULT_LOCALE,
): string {
  // Missing locale → Vietnamese data base, never blank. The UI default
  // (DEFAULT_LOCALE = ja) is already populated, so this only fires for stubs.
  const units = COUNTDOWN_UNITS[locale] ?? COUNTDOWN_UNITS[BASE_LOCALE];
  const ms = Math.max(0, target - now);
  const mins = Math.ceil(ms / 60_000);
  if (mins < 1) return units.moments;
  if (mins < 60) return `${mins} ${units.minute}`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours} ${units.hour} ${mins % 60} ${units.minute}`;
  const days = Math.floor(hours / 24);
  return `${days} ${units.day} ${hours % 24} ${units.hour}`;
}

/** Per-locale countdown unit words. `vi` is the base; each entry lists its units in the locale's natural order. */
const COUNTDOWN_UNITS: Record<
  Locale,
  { moments: string; minute: string; hour: string; day: string }
> = {
  vi: { moments: "ít phút", minute: "phút", hour: "giờ", day: "ngày" },
  th: { moments: "ไม่กี่นาที", minute: "นาที", hour: "ชั่วโมง", day: "วัน" },
  ja: { moments: "数分", minute: "分", hour: "時間", day: "日" },
  zh: { moments: "几分钟", minute: "分钟", hour: "小时", day: "天" },
  ko: { moments: "몇 분", minute: "분", hour: "시간", day: "일" },
  fil: { moments: "ilang minuto", minute: "minuto", hour: "oras", day: "araw" },
};
