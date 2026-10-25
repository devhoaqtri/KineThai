/**
 * How far a reader has got into each level: the first LEVEL_GOAL distinct words seen at
 * every level, kept on this device.
 *
 * The view history cannot answer this. It keys timestamps by word id with no level, and
 * prunes everything older than a week, because its job is the repeat caps. Progress has
 * to outlast that, so the moment a view is recorded the word's id is also filed under its
 * level here, up to the goal and never beyond, which bounds the store at LEVEL_GOAL ids a
 * level. Each origin has its own storage, so every language host keeps its own progress.
 *
 * Exports: LEVEL_GOAL, LEVEL_PROGRESS_KEY, LevelProgress, loadLevelProgress,
 *   saveLevelProgress, recordLevelProgress, progressFor
 * Depends on: ./schema
 */

import type { VocabularyLevel } from "./schema";

/** The words that count at each level: the first hundred seen fill its bar. */
export const LEVEL_GOAL = 100;
export const LEVEL_PROGRESS_KEY = "kinetic.vocab.level-progress.v1";

/** Distinct word ids seen per level, in the order they were first seen. */
export type LevelProgress = Partial<Record<VocabularyLevel, string[]>>;

function isValidProgress(value: unknown): value is LevelProgress {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return Object.values(value as Record<string, unknown>).every(
    (ids) => Array.isArray(ids) && ids.every((id) => typeof id === "string"),
  );
}

/** @returns The stored progress, or none when storage is empty, unreadable or corrupt. */
export function loadLevelProgress(): LevelProgress {
  try {
    if (typeof localStorage === "undefined") return {};
    const raw = localStorage.getItem(LEVEL_PROGRESS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return isValidProgress(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** Persist progress; never throws. @param progress Map to store. */
export function saveLevelProgress(progress: LevelProgress): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(LEVEL_PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // Quota or privacy mode — progress simply stays in memory.
  }
}

/**
 * File one seen word under its level.
 * @param progress Current map
 * @param level The word's level
 * @param wordId The word's id
 * @returns The same map when nothing changed (already counted, or the level is full),
 *   otherwise a new one
 * @pure true
 */
export function recordLevelProgress(
  progress: LevelProgress,
  level: VocabularyLevel,
  wordId: string,
): LevelProgress {
  const ids = progress[level] ?? [];
  if (ids.length >= LEVEL_GOAL || ids.includes(wordId)) return progress;
  return { ...progress, [level]: [...ids, wordId] };
}

/**
 * Progress over a set of levels, for one picker row.
 *
 * Each level counts up to its own goal: LEVEL_GOAL, or the level's whole size when it is
 * smaller, so a level with twelve words is complete at twelve. A row spanning several
 * levels adds them up, so its bar fills only as every level it covers fills.
 * @param levels The row's levels
 * @param progress Seen words per level
 * @param levelCounts Words per level in the catalog
 * @returns Words counted, the goal, and the share done (0 when the goal is 0)
 * @pure true
 */
export function progressFor(
  levels: readonly VocabularyLevel[],
  progress: LevelProgress,
  levelCounts: Partial<Record<VocabularyLevel, number>>,
): { seen: number; goal: number; ratio: number } {
  let seen = 0;
  let goal = 0;
  for (const level of levels) {
    const levelGoal = Math.min(LEVEL_GOAL, levelCounts[level] ?? 0);
    goal += levelGoal;
    seen += Math.min(levelGoal, progress[level]?.length ?? 0);
  }
  return { seen, goal, ratio: goal > 0 ? seen / goal : 0 };
}
