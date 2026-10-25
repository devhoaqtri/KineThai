/**
 * Word-milestone badges: which scopes progress is counted over on a host, and how each
 * badge looks and reads.
 *
 * lib/level-progress decides what is earned; this ties it to the app. The scopes are
 * "all" plus every difficulty track the host's catalog can serve, sized from the bundled
 * level ladder, so the counts are the catalog's own and need no request. The badges are
 * struck in the same four metals as the streak medals (./streak-tiers), and the medal,
 * the celebration and the saved drawer's shelf all read the tier from here.
 *
 * Exports: ALL_SCOPE, progressScopes, scopeLabel, wordTier, wordBadgeTitle, wordBadgeBlurb
 * Depends on: ./difficulty, ./level-ladder, ./level-progress, ./streak-tiers,
 *   ./target-language
 */

import { difficultyLevels, isTrackAvailable, tracksFor } from "./difficulty";
import { levelLadderFor } from "./level-ladder";
import type { ProgressScope, WordMilestone } from "./level-progress";
import type { VocabularyLevel } from "./schema";
import type { StreakTier } from "./streak-tiers";
import type { TargetLocale } from "./target-language";

/** The scope covering every level. Not a track id: track ids are words, never "all". */
export const ALL_SCOPE = "all";

/**
 * @param locale The host's deck locale
 * @returns Every scope progress is counted over, "all" first, and words per level
 */
export function progressScopes(locale: TargetLocale): {
  scopes: ProgressScope[];
  levelCounts: Partial<Record<VocabularyLevel, number>>;
} {
  const ladder = levelLadderFor(locale);
  const scopes: ProgressScope[] = [{ id: ALL_SCOPE, levels: ladder.levels }];
  for (const track of tracksFor(locale)) {
    if (!isTrackAvailable(track, ladder.levels)) continue;
    const levels = difficultyLevels(track.id, ladder.levels);
    if (levels?.length) scopes.push({ id: track.id, levels });
  }
  return { scopes, levelCounts: ladder.levelCounts };
}

/** @returns "Tổng cộng", or the track's emoji and name; the id itself if unknown. */
export function scopeLabel(scope: string, locale: TargetLocale): string {
  if (scope === ALL_SCOPE) return "Tổng cộng";
  const track = tracksFor(locale).find((entry) => entry.id === scope);
  return track ? `${track.emoji} ${track.label}` : scope;
}

/** @returns The metal a word badge is struck in: finishing a scope is always diamond. */
export function wordTier(milestone: Pick<WordMilestone, "words" | "complete">): StreakTier {
  if (milestone.complete) return "diamond";
  if (milestone.words >= 500) return "gold";
  if (milestone.words >= 200) return "silver";
  return "bronze";
}

/** @returns The celebration headline. */
export function wordBadgeTitle(milestone: WordMilestone, locale: TargetLocale): string {
  if (milestone.scope === ALL_SCOPE) {
    return milestone.complete ? "Trọn bộ từ vựng!" : `${milestone.words} từ đã học!`;
  }
  const name = scopeLabel(milestone.scope, locale);
  return milestone.complete ? `Trọn bộ ${name}!` : `${milestone.words} từ ${name}!`;
}

/** @returns The line under the headline. */
export function wordBadgeBlurb(milestone: WordMilestone, locale: TargetLocale): string {
  if (milestone.scope === ALL_SCOPE) {
    if (milestone.complete) return "Bạn đã xem hết mọi từ trong bộ — thật đáng nể!";
    if (milestone.words === 100) return "Trăm từ đầu tiên — hành trình đã thật sự bắt đầu.";
    return `Đã vượt mốc ${milestone.words} từ. Cứ đà này nhé!`;
  }
  const name = scopeLabel(milestone.scope, locale);
  if (milestone.complete) return `Bạn đã xem hết mọi từ của ${name}.`;
  return `Mốc ${milestone.words} từ của ${name} — tiến lên mốc tiếp theo nhé.`;
}
