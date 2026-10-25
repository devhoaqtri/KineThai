/**
 * The daily goals: badges earned on every day the reader finishes 10, 25 or 50 distinct
 * words, counted rather than collected — each medal shows how many days it has been
 * earned, so the second time reads 2, the third 3. One day can earn all three; the bigger
 * goals show up as the next thing to aim for once the one below has been met.
 *
 * Kept apart from the streak (./streak) on purpose. The streak asks for a few words a day
 * and breaks on a missed day; these ask for more and never break, so a reader who skips a
 * week still adds to them the next time they read enough. The words of the day in progress
 * are the only list kept — never more than the largest goal — and it is dropped when a new
 * day starts, so the store stays small however long anyone reads.
 *
 * A leaf module like ./streak: it imports only ./day, so the saved drawer can read it
 * without pulling a catalog in.
 *
 * Exports: DAILY_GOAL_KEY, DAILY_GOAL_EVENT, DAILY_GOALS, DailyGoal, DailyGoalStore,
 *   emptyDailyGoal, parseDailyGoal, recordDailyWord, wordsToday, readDailyGoal,
 *   writeDailyGoal
 * Depends on: ./day
 */

import { startOfDay } from "./day";

export const DAILY_GOAL_KEY = "kinetic.vocab.daily-goal";
/** Same-tab change signal; the native `storage` event skips the tab that wrote. */
export const DAILY_GOAL_EVENT = "kinetic:vocab-daily-goal";
/** Distinct words in one day that each earn a badge, smallest first. */
export const DAILY_GOALS = [10, 25, 50] as const;
export type DailyGoal = (typeof DAILY_GOALS)[number];

const LARGEST = DAILY_GOALS[DAILY_GOALS.length - 1];

export type DailyGoalStore = {
  /** How many days each goal has been met, ever. */
  times: Record<DailyGoal, number>;
  /** The day in progress: its distinct finished words (up to the largest goal). */
  pending?: { day: number; words: string[] };
};

/** @returns The store of a device that has never met a goal @pure true */
export function emptyDailyGoal(): DailyGoalStore {
  return { times: { 10: 0, 25: 0, 50: 0 } };
}

/**
 * @param raw Stored JSON, or null
 * @param now Reference time: a pending day that is not today is forgotten
 * @returns A well-formed store; anything unreadable becomes the empty one
 * @pure true
 */
export function parseDailyGoal(raw: string | null, now: number): DailyGoalStore {
  if (!raw) return emptyDailyGoal();
  try {
    const value = JSON.parse(raw) as { times?: unknown; pending?: DailyGoalStore["pending"] };
    const store = emptyDailyGoal();
    const times = (value.times ?? {}) as Record<string, unknown>;
    for (const goal of DAILY_GOALS) {
      const count = times[goal];
      if (Number.isInteger(count) && (count as number) > 0) store.times[goal] = count as number;
    }
    const pending = value.pending;
    if (
      pending &&
      pending.day === startOfDay(now) &&
      Array.isArray(pending.words) &&
      pending.words.every((word) => typeof word === "string")
    ) {
      store.pending = { day: pending.day, words: [...new Set(pending.words)].slice(0, LARGEST) };
    }
    return store;
  } catch {
    return emptyDailyGoal();
  }
}

/**
 * Count one finished word towards today.
 * @param store Current store
 * @param wordId The finished word
 * @param now Reference time
 * @returns The same store when nothing changed (the word already counted today, or every
 *   goal met), otherwise a new one; `reached` is the goal this word completed, if any
 * @pure true
 */
export function recordDailyWord(
  store: DailyGoalStore,
  wordId: string,
  now: number,
): { store: DailyGoalStore; reached: DailyGoal | null } {
  const today = startOfDay(now);
  const words = store.pending?.day === today ? store.pending.words : [];
  if (words.length >= LARGEST || words.includes(wordId)) return { store, reached: null };
  const next = [...words, wordId];
  const reached = DAILY_GOALS.find((goal) => goal === next.length) ?? null;
  return {
    store: {
      times: reached ? { ...store.times, [reached]: store.times[reached] + 1 } : store.times,
      pending: { day: today, words: next },
    },
    reached,
  };
}

/** @returns Distinct words finished today, up to the largest goal. @pure true */
export function wordsToday(store: DailyGoalStore, now: number): number {
  return store.pending?.day === startOfDay(now) ? store.pending.words.length : 0;
}

/** @returns The stored daily goals; never throws. */
export function readDailyGoal(now: number = Date.now()): DailyGoalStore {
  if (typeof window === "undefined") return emptyDailyGoal();
  try {
    return parseDailyGoal(localStorage.getItem(DAILY_GOAL_KEY), now);
  } catch {
    return emptyDailyGoal();
  }
}

/** Persist the store and tell this tab's listeners; never throws. */
export function writeDailyGoal(store: DailyGoalStore): void {
  try {
    localStorage.setItem(DAILY_GOAL_KEY, JSON.stringify(store));
  } catch {
    // Quota or privacy mode — the counts simply stay in memory for this visit.
  }
  window.dispatchEvent(new Event(DAILY_GOAL_EVENT));
}
