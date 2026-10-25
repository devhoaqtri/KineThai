/**
 * How far a reader has got through each level, and the word milestones that earns.
 *
 * The view history cannot answer this. It keys timestamps by word id with no level and
 * prunes everything older than a week, because its job is the repeat caps. Progress has to
 * outlast that, so the moment a view is recorded the word's id is also filed under its
 * level here. Every distinct word is kept: the store is bounded by the catalog itself
 * (a few hundred ids a level), never by how long someone reads.
 *
 * Progress is counted per SCOPE: "all" (every level) and each difficulty track, whose
 * levels overlap. A scope fills towards targets 100 words apart — 100, 200, 300… — and its
 * last target is its own size, so every scope can be finished. Reaching a target earns a
 * badge, celebrated once ever: `earned` is the celebrate-once record, like the streak's.
 *
 * Each origin has its own storage, so every language host keeps its own progress.
 *
 * Exports: MILESTONE_STEP, LEVEL_PROGRESS_KEY, LEVEL_PROGRESS_EVENT, LevelProgress,
 *   ProgressStore, ProgressScope, WordMilestone, milestoneKey, parseMilestoneKey,
 *   scopeProgress, tierProgress, milestonesReached, recordSeenWord, readProgress,
 *   writeProgress
 * Depends on: ./schema
 */

import type { VocabularyLevel } from "./schema";

/** Targets are this many words apart. */
export const MILESTONE_STEP = 100;
export const LEVEL_PROGRESS_KEY = "kinetic.vocab.level-progress.v2";
/** The first shape: seen ids only, capped at 100 a level. Read once, then removed. */
const LEGACY_KEY = "kinetic.vocab.level-progress.v1";
/** Same-tab change signal; the native `storage` event skips the tab that wrote. */
export const LEVEL_PROGRESS_EVENT = "kinetic:vocab-level-progress";

/** Distinct word ids seen per level, in the order they were first seen. */
export type LevelProgress = Partial<Record<VocabularyLevel, string[]>>;

export type ProgressStore = {
  seen: LevelProgress;
  /** Milestone keys already celebrated (see milestoneKey). */
  earned: string[];
};

/** What progress is counted over: "all", or a difficulty track by id. */
export type ProgressScope = { id: string; levels: readonly VocabularyLevel[] };

/** One badge: a scope reached `words`; `complete` when that is the scope's whole size. */
export type WordMilestone = { scope: string; words: number; complete: boolean };

/** @returns The key a milestone is recorded under, e.g. "vo-long:200". @pure true */
export function milestoneKey(milestone: Pick<WordMilestone, "scope" | "words">): string {
  return `${milestone.scope}:${milestone.words}`;
}

/** @returns The scope and word count in a milestone key, or null for a malformed one. @pure true */
export function parseMilestoneKey(key: string): { scope: string; words: number } | null {
  const at = key.lastIndexOf(":");
  const words = Number(key.slice(at + 1));
  if (at <= 0 || !Number.isInteger(words) || words <= 0) return null;
  return { scope: key.slice(0, at), words };
}

/**
 * Words seen over a scope's levels, and the scope's size.
 * @param levels The scope's levels
 * @param seen Seen ids per level
 * @param levelCounts Words per level in the catalog
 * @returns `seen` capped per level at that level's size, and `total`
 * @pure true
 */
export function scopeProgress(
  levels: readonly VocabularyLevel[],
  seen: LevelProgress,
  levelCounts: Partial<Record<VocabularyLevel, number>>,
): { seen: number; total: number } {
  let count = 0;
  let total = 0;
  for (const level of levels) {
    const size = levelCounts[level] ?? 0;
    total += size;
    count += Math.min(size, seen[level]?.length ?? 0);
  }
  return { seen: count, total };
}

/**
 * Where a scope stands against its current target. A full target hands over to the next
 * one at once, so the bar is never parked full: 100 of 635 reads as 0 of the way to 200.
 * @param seen Words seen in the scope
 * @param total The scope's size
 * @returns The last target passed (`from`), the one being filled (`target`), and the share
 *   of the way from one to the other; a finished scope is 1 of the way to its own size
 * @pure true
 */
export function tierProgress(
  seen: number,
  total: number,
): { from: number; target: number; ratio: number } {
  if (total <= 0) return { from: 0, target: 0, ratio: 0 };
  if (seen >= total) return { from: total, target: total, ratio: 1 };
  const from = Math.floor(seen / MILESTONE_STEP) * MILESTONE_STEP;
  const target = Math.min(total, from + MILESTONE_STEP);
  return { from, target, ratio: (seen - from) / (target - from) };
}

/**
 * Every milestone a scope has reached: each 100 passed, and the scope's own size once it
 * is finished (unless that is itself a multiple of 100, already in the list).
 * @param scope The scope's id
 * @param seen Words seen in the scope
 * @param total The scope's size
 * @returns Milestones, ascending
 * @pure true
 */
export function milestonesReached(scope: string, seen: number, total: number): WordMilestone[] {
  const reached: WordMilestone[] = [];
  const top = Math.min(seen, total);
  for (let words = MILESTONE_STEP; words <= top; words += MILESTONE_STEP) {
    reached.push({ scope, words, complete: words === total });
  }
  if (total > 0 && seen >= total && total % MILESTONE_STEP !== 0) {
    reached.push({ scope, words: total, complete: true });
  }
  return reached;
}

/**
 * File one seen word under its level, and collect the milestones that crossed.
 * @param store Current store
 * @param level The word's level
 * @param wordId The word's id
 * @param scopes Every scope progress is counted over
 * @param levelCounts Words per level in the catalog
 * @returns The same store when the word was already counted, otherwise a new one, plus the
 *   milestones earned by this word (now recorded as earned), in scope order
 * @pure true
 */
export function recordSeenWord(
  store: ProgressStore,
  level: VocabularyLevel,
  wordId: string,
  scopes: readonly ProgressScope[],
  levelCounts: Partial<Record<VocabularyLevel, number>>,
): { store: ProgressStore; reached: WordMilestone[] } {
  const ids = store.seen[level] ?? [];
  if (ids.includes(wordId)) return { store, reached: [] };
  const seen = { ...store.seen, [level]: [...ids, wordId] };
  const earned = new Set(store.earned);
  const reached: WordMilestone[] = [];
  for (const scope of scopes) {
    if (!scope.levels.includes(level)) continue;
    const progress = scopeProgress(scope.levels, seen, levelCounts);
    for (const milestone of milestonesReached(scope.id, progress.seen, progress.total)) {
      const key = milestoneKey(milestone);
      if (earned.has(key)) continue;
      earned.add(key);
      reached.push(milestone);
    }
  }
  return { store: { seen, earned: [...earned] }, reached };
}

function isIdMap(value: unknown): value is LevelProgress {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return Object.values(value as Record<string, unknown>).every(
    (ids) => Array.isArray(ids) && ids.every((id) => typeof id === "string"),
  );
}

function parse(raw: string | null): ProgressStore | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return null;
    const { seen, earned } = value as Partial<ProgressStore>;
    if (!isIdMap(seen) || !Array.isArray(earned)) return null;
    return { seen, earned: earned.filter((key): key is string => typeof key === "string") };
  } catch {
    return null;
  }
}

/** @returns The stored progress; never throws, and empty when there is none. */
export function readProgress(): ProgressStore {
  try {
    if (typeof localStorage === "undefined") return { seen: {}, earned: [] };
    const current = parse(localStorage.getItem(LEVEL_PROGRESS_KEY));
    if (current) return current;
    // The first shape held only the seen ids; carry them over once.
    const legacy: unknown = JSON.parse(localStorage.getItem(LEGACY_KEY) ?? "null");
    const migrated = { seen: isIdMap(legacy) ? legacy : {}, earned: [] };
    if (isIdMap(legacy)) writeProgress(migrated);
    localStorage.removeItem(LEGACY_KEY);
    return migrated;
  } catch {
    return { seen: {}, earned: [] };
  }
}

/** Persist the store and tell this tab's listeners; never throws. */
export function writeProgress(store: ProgressStore): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(LEVEL_PROGRESS_KEY, JSON.stringify(store));
  } catch {
    // Quota or privacy mode — progress simply stays in memory.
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(LEVEL_PROGRESS_EVENT));
}
