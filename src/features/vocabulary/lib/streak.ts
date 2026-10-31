/**
 * The reader's daily streak, kept on this device and nowhere else.
 *
 * A day counts only once the reader has FINISHED `DAY_MIN_WORDS` distinct words in it, so a
 * streak cannot be kept by opening the app for a second. Milestones are days, not words,
 * and each is celebrated exactly once ever.
 *
 * Why the shape is what it is: the stored value is O(1), not a log. Only two facts are
 * needed to extend a run — the qualifying days themselves, and which words today has
 * already counted — and the second is discarded the moment the day qualifies. So the word
 * set is bounded by `DAY_MIN_WORDS` no matter how long a reader keeps going, and there is
 * no growth to prune. A `Record<day, count>` would have needed a cap bolted on instead;
 * here the bound is the shape.
 *
 * That also means this module can never answer "how many words today" past the threshold,
 * which is deliberate: the feature shows nothing before a milestone is earned, so the
 * number has no reader. Storing it would be storing something only a future progress bar
 * could want, and that is the thing that makes the log unbounded.
 *
 * A leaf module: it imports only ./day, so the feed chunk never pulls a catalog in to
 * render a badge — the hazard useSavedCount.ts exists to document.
 *
 * Exports: STREAK_KEY, STREAK_EVENT, DAY_MIN_WORDS, DAY_LIMIT, MILESTONES, STREAK_REPEATS,
 *   StreakStore, parseStreak, recordFinishedWord, currentStreak, milestonesReached,
 *   streakRunsCompleted, streakRepeatsEarned, readStreak, writeStreak, emptyStreak
 * Depends on: ./day
 */

import { previousDay, startOfDay } from "./day";

/** The `kinetic.vocab.*` family, like reactions, reported and the two choice keys. */
export const STREAK_KEY = "kinetic.vocab.streak";

/**
 * Same-tab change signal. The native `storage` event skips the tab that wrote, so the
 * drawer would not see a badge earned in the feed beside it without this.
 */
export const STREAK_EVENT = "kinetic:vocab-streak";

/**
 * Distinct words a reader must finish before the day counts towards the streak.
 *
 * Three, not five, because `isWordAllowed` in ./history caps each word at one view per day
 * and the stream has a reachable "everything blocked" state: a reader on a narrow
 * difficulty filter can genuinely be unable to finish five words on some day, and would
 * then lose a streak to the catalog's shape rather than to anything they did. Three is
 * still far more than opening the app and closing it.
 */
export const DAY_MIN_WORDS = 3;

/**
 * How many qualifying days are kept. Oldest fall off first.
 *
 * Truncation can only ever shorten a reported streak, and only past 400 consecutive days —
 * beyond the last milestone. Mirrors the 400-item cap in ./reported-words. Nothing a reader
 * has earned may depend on these days alone: they age out, so badges are saved when earned.
 */
export const DAY_LIMIT = 400;

/**
 * The ladder, in days. A list and not a formula on purpose: a formula hides where the
 * rungs are and where they stop, and this is the one place either should be changed.
 * Starts at three days and a week, so the first two medals come within a reader's first
 * week rather than one at five.
 */
export const MILESTONES = [3, 7, 10, 20, 30, 50, 75, 100, 150, 200, 300, 365] as const;

/**
 * Rungs that were on the ladder once and no longer are. Nobody can earn them now, but a
 * reader who did keeps the medal: parsing must not quietly drop it.
 */
const RETIRED_MILESTONES: readonly number[] = [5];

/** Run length in days → completed runs that earn its repeat badge. */
export const STREAK_REPEATS: Readonly<Record<number, number>> = { 3: 5, 7: 3, 10: 3 };

export type StreakStore = {
  /** Local midnights of qualifying days, newest first, unique, at most DAY_LIMIT. */
  days: number[];
  /**
   * The day in progress and the distinct words finished in it. Dropped once the day
   * qualifies and moves into `days`, which is what keeps this bounded.
   */
  pending?: { day: number; words: string[] };
  /** Milestones already celebrated, ascending. The celebrate-once record. */
  earned: number[];
  /**
   * Run lengths whose repeat badge is earned, ascending. Saved rather than counted from
   * `days` each time, because those age out and a badge must not leave with them.
   */
  repeats: number[];
};

/** A device that has never finished a word. @returns the empty store @pure true */
export function emptyStreak(): StreakStore {
  return { days: [], earned: [], repeats: [] };
}

/**
 * Every milestone a streak of this length has reached.
 * @param streak - Consecutive qualifying days
 * @returns The reached thresholds, ascending
 * @pure true
 */
export function milestonesReached(streak: number): number[] {
  return MILESTONES.filter((at) => streak >= at);
}

/**
 * How many times a run of `length` days has been completed, over the days kept. A long run
 * counts once per full stretch, so carrying on is never worse than breaking and starting
 * over: nine days in a row are three 3-day runs.
 * @param days - Qualifying days, newest first, unique (StreakStore.days)
 * @param length - Days in one run
 * @returns Completed runs
 * @pure true
 */
export function streakRunsCompleted(days: readonly number[], length: number): number {
  if (length <= 0) return 0;
  let total = 0;
  let run = 0;
  for (let at = 0; at < days.length; at += 1) {
    run = at > 0 && days[at] === previousDay(days[at - 1]!) ? run + 1 : 1;
    const ends = at === days.length - 1 || days[at + 1] !== previousDay(days[at]!);
    if (ends) total += Math.floor(run / length);
  }
  return total;
}

/**
 * The repeat badges a reader holds: those already saved, plus any these days now reach.
 * @param days - Qualifying days, newest first, unique
 * @param earned - Milestones earned; a repeat needs its run to have been earned once
 * @param saved - Run lengths already saved
 * @returns Run lengths with their badge earned, ascending
 * @pure true
 */
export function streakRepeatsEarned(
  days: readonly number[],
  earned: readonly number[],
  saved: readonly number[],
): number[] {
  const held = new Set(saved);
  for (const [length, times] of Object.entries(STREAK_REPEATS)) {
    const run = Number(length);
    if (earned.includes(run) && streakRunsCompleted(days, run) >= times) held.add(run);
  }
  return [...held].sort((a, b) => a - b);
}

/**
 * Consecutive qualifying days ending today or yesterday.
 *
 * Yesterday anchors as well as today: a reader part-way through today has not broken
 * anything, and a badge row that read 0 until they finished three more words would be
 * telling them they had lost something they still have.
 * @param store - The stored streak
 * @param now - Reference time
 * @returns Days in the current run; 0 when the run has lapsed
 * @pure true
 */
export function currentStreak(store: StreakStore, now: number = Date.now()): number {
  const days = store.days;
  if (!days.length) return 0;
  const today = startOfDay(now);
  const newest = days[0]!;
  if (newest !== today && newest !== previousDay(today)) return 0;
  let streak = 1;
  for (let at = 1; at < days.length; at += 1) {
    if (days[at] !== previousDay(days[at - 1]!)) break;
    streak += 1;
  }
  return streak;
}

/**
 * Record one finished word, returning the new store and anything to celebrate.
 *
 * Pure, and does not write — the ./history `recordView` split, where the logic is testable
 * at a fixed `now` and the hook owns persistence.
 *
 * The same word twice in one day counts once, because `word.id` is the only identifier
 * stable across stream remounts, shuffles and repeat occurrences of one word in a stream.
 * `occurrenceId` never reaches storage.
 * @param store - The current store
 * @param wordId - The catalog id of the finished word
 * @param now - Reference time
 * @returns The store to persist, and the milestones newly earned by this word
 * @pure true
 */
export function recordFinishedWord(
  store: StreakStore,
  wordId: string,
  now: number = Date.now(),
): { store: StreakStore; celebrate: number[] } {
  const today = startOfDay(now);
  // Already counted: nothing to do, and nothing to write.
  if (store.days[0] === today) return { store, celebrate: [] };

  const pending =
    store.pending && store.pending.day === today ? store.pending : { day: today, words: [] };
  if (pending.words.includes(wordId)) return { store, celebrate: [] };

  const words = [...pending.words, wordId];
  if (words.length < DAY_MIN_WORDS) {
    return { store: { ...store, pending: { day: today, words } }, celebrate: [] };
  }

  // The day qualifies. It joins `days` and its word list is discarded.
  const days = [today, ...store.days].slice(0, DAY_LIMIT);
  const next: StreakStore = { days, earned: store.earned, repeats: store.repeats };
  const celebrate = milestonesReached(currentStreak(next, now)).filter(
    (at) => !next.earned.includes(at),
  );
  const earned = celebrate.length
    ? [...next.earned, ...celebrate].sort((a, b) => a - b)
    : next.earned;
  return {
    store: { ...next, earned, repeats: streakRepeatsEarned(days, earned, store.repeats) },
    celebrate,
  };
}

/**
 * Read a stored value back into a store, repairing or discarding anything unrecognised.
 *
 * Hand-rolled, like isValidHistory and reactions' toCount — no schema library reaches the
 * reader path anywhere in this feature.
 *
 * Three repairs worth naming. A day stamped in the future is dropped, so a device whose
 * clock was briefly wrong cannot poison the log for good. A day older than DAY_LIMIT is
 * dropped too — `1` is a perfectly finite number and would otherwise be read as a day in
 * 1970, and nothing that far back can reach a streak anyway. And an absent `earned` is
 * seeded from the streak already lived rather than left empty, so adding a lower milestone
 * in a later release cannot retro-fire a celebration for days long past.
 *
 * Repeat badges are worked out from every stored day, before the age limit drops any, so a
 * reader who earned one before badges were saved keeps it.
 * @param raw - The stored string, or null
 * @param now - Reference time
 * @returns A valid store
 * @pure true
 */
export function parseStreak(raw: string | null, now: number = Date.now()): StreakStore {
  if (!raw) return emptyStreak();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return emptyStreak();
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return emptyStreak();
  const source = parsed as Record<string, unknown>;

  const today = startOfDay(now);
  // A plausible window, bounded at both ends. Future days are rejected so a clock that was
  // briefly wrong cannot poison the log for good; ancient ones because `1` is a finite
  // number and would otherwise be read as a day in 1970 — and a day further back than
  // DAY_LIMIT is already beyond anything a streak can reach.
  const newestAllowed = today + 2 * 24 * 60 * 60 * 1000;
  const oldestAllowed = today - DAY_LIMIT * 24 * 60 * 60 * 1000;
  const seen = new Set<number>();
  const stored = (Array.isArray(source.days) ? source.days : [])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    .map(startOfDay)
    .filter((day) => {
      if (day >= newestAllowed || seen.has(day)) return false;
      seen.add(day);
      return true;
    })
    .sort((a, b) => b - a);
  const days = stored.filter((day) => day >= oldestAllowed).slice(0, DAY_LIMIT);

  const store: StreakStore = { days, earned: [], repeats: [] };

  // A day that never reached the threshold is forgotten the moment it stops being today.
  const pending = source.pending;
  if (pending && typeof pending === "object" && !Array.isArray(pending)) {
    const entry = pending as Record<string, unknown>;
    const day = typeof entry.day === "number" ? startOfDay(entry.day) : 0;
    if (day === today && !days.includes(today)) {
      const words = (Array.isArray(entry.words) ? entry.words : [])
        .filter((value): value is string => typeof value === "string" && value.length > 0)
        .slice(0, DAY_MIN_WORDS);
      if (words.length) store.pending = { day, words: [...new Set(words)] };
    }
  }

  const earned = Array.isArray(source.earned)
    ? source.earned.filter(
        (value): value is number =>
          typeof value === "number" &&
          ((MILESTONES as readonly number[]).includes(value) || RETIRED_MILESTONES.includes(value)),
      )
    : null;
  store.earned = (earned ?? milestonesReached(currentStreak(store, now))).sort((a, b) => a - b);
  const saved = (Array.isArray(source.repeats) ? source.repeats : []).filter(
    (value): value is number => typeof value === "number" && value in STREAK_REPEATS,
  );
  store.repeats = streakRepeatsEarned(stored, store.earned, saved);
  return store;
}

/**
 * The stored streak for this device.
 * @param now - Reference time
 * @returns The store; empty during server rendering or when storage is unreadable
 */
export function readStreak(now: number = Date.now()): StreakStore {
  if (typeof window === "undefined") return emptyStreak();
  try {
    return parseStreak(localStorage.getItem(STREAK_KEY), now);
  } catch {
    return emptyStreak();
  }
}

/**
 * Persist the streak and tell this tab about it.
 *
 * The event fires even when the write threw, as writeReactions does: a full or private-mode
 * device still earned the milestone, and the celebration is the part the reader came for.
 * @param store - The store to persist
 */
export function writeStreak(store: StreakStore): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STREAK_KEY, JSON.stringify(store));
  } catch {
    /* Quota or privacy mode — the streak simply stops advancing. */
  }
  window.dispatchEvent(new Event(STREAK_EVENT));
}
