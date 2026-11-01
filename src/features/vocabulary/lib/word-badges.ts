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
 * Exports: ALL_SCOPE, progressScopes, scopeKind, scopeLabel, wordTier, wordBadgeTitle,
 *   wordBadgeBlurb
 * Depends on: ./difficulty, ./level-ladder, ./level-progress, ./streak-tiers,
 *   ./target-language, ./locale, ./ui-copy
 */

import { difficultyLevels, isTrackAvailable, tracksFor } from "./difficulty";
import { levelLadderFor } from "./level-ladder";
import type { ProgressScope, WordMilestone } from "./level-progress";
import type { Locale } from "./locale";
import type { VocabularyLevel } from "./schema";
import type { StreakTier } from "./streak-tiers";
import type { TargetLocale } from "./target-language";
import { difficultyCopy } from "./ui-copy";

/** The scope covering every level. Not a track id: track ids are words, never "all". */
export const ALL_SCOPE = "all";

/**
 * @param locale The host's deck locale
 * @returns Every scope progress is counted over — "all" first, then each difficulty track,
 *   then each single level ("A1", "HSK3") under its own id — and words per level
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
  for (const level of ladder.levels) {
    if ((ladder.levelCounts[level] ?? 0) > 0) scopes.push({ id: level, levels: [level] });
  }
  return { scopes, levelCounts: ladder.levelCounts };
}

/** @returns What a scope id names: the whole set, one level, or a difficulty track. */
export function scopeKind(scope: string, locale: TargetLocale): "all" | "level" | "track" {
  if (scope === ALL_SCOPE) return "all";
  return (levelLadderFor(locale).levels as readonly string[]).includes(scope) ? "level" : "track";
}

/** @returns "Tổng cộng", "Cấp B1" (or localized equivalents), or the track's emoji and name; the id itself if unknown. */
export function scopeLabel(scope: string, locale: TargetLocale, uiLocale: Locale = "vi"): string {
  const kind = scopeKind(scope, locale);
  if (kind === "all") {
    return uiLocale === "ja" ? "合計" : uiLocale === "th" ? "ทั้งหมด" : "Tổng cộng";
  }
  if (kind === "level") {
    return uiLocale === "ja"
      ? `${scope} レベル`
      : uiLocale === "th"
        ? `ระดับ ${scope}`
        : `Cấp ${scope}`;
  }
  const track = tracksFor(locale).find((entry) => entry.id === scope);
  if (!track) return scope;
  const label = uiLocale === "vi" ? track.label : difficultyCopy(uiLocale, track.id).label;
  return track.emoji ? `${track.emoji} ${label}` : label;
}

/** @returns The metal a word badge is struck in: finishing a scope is always diamond. */
export function wordTier(milestone: Pick<WordMilestone, "words" | "complete">): StreakTier {
  if (milestone.complete) return "diamond";
  if (milestone.words >= 500) return "gold";
  if (milestone.words >= 200) return "silver";
  return "bronze";
}

/** @returns The celebration headline. */
export function wordBadgeTitle(
  milestone: WordMilestone,
  locale: TargetLocale,
  uiLocale: Locale = "vi",
): string {
  if (uiLocale === "ja") {
    if (milestone.scope === ALL_SCOPE) {
      return milestone.complete ? "全単語コンプリート！" : `${milestone.words} 語達成！`;
    }
    const name = scopeLabel(milestone.scope, locale, uiLocale);
    return milestone.complete ? `${name} コンプリート！` : `${name} ${milestone.words} 語達成！`;
  }
  if (uiLocale === "th") {
    if (milestone.scope === ALL_SCOPE) {
      return milestone.complete ? "ครบทุกคำในชุดคำศัพท์!" : `เรียนครบ ${milestone.words} คำแล้ว!`;
    }
    const name = scopeLabel(milestone.scope, locale, uiLocale);
    return milestone.complete ? `ครบชุด ${name}!` : `${milestone.words} คำ ${name}!`;
  }
  if (milestone.scope === ALL_SCOPE) {
    return milestone.complete ? "Trọn bộ từ vựng!" : `${milestone.words} từ đã học!`;
  }
  const name = scopeLabel(milestone.scope, locale, "vi");
  return milestone.complete ? `Trọn bộ ${name}!` : `${milestone.words} từ ${name}!`;
}

/** @returns The line under the headline. */
export function wordBadgeBlurb(
  milestone: WordMilestone,
  locale: TargetLocale,
  uiLocale: Locale = "vi",
): string {
  if (uiLocale === "ja") {
    if (milestone.scope === ALL_SCOPE) {
      if (milestone.complete) return "デッキ内のすべての単語を学習しました ― 見事な達成です！";
      if (milestone.words === 100) return "最初の100語を達成 ― 旅が本格的に始まりました。";
      return `${milestone.words}語の節目を突破しました。この調子で進みましょう！`;
    }
    const name = scopeLabel(milestone.scope, locale, uiLocale);
    if (milestone.complete) return `${name} のすべての単語を学習しました。`;
    return `${name} で ${milestone.words} 語達成 ― 次の節目を目指しましょう。`;
  }
  if (uiLocale === "th") {
    if (milestone.scope === ALL_SCOPE) {
      if (milestone.complete) return "คุณดูคำศัพท์ครบทุกคำในชุดแล้ว — ยอดเยี่ยมมาก!";
      if (milestone.words === 100) return "100 คำแรก — การเดินทางเริ่มต้นขึ้นอย่างแท้จริงแล้ว";
      return `ผ่านหมุดหมาย ${milestone.words} คำแล้ว ลุยกันต่อเลย!`;
    }
    const name = scopeLabel(milestone.scope, locale, uiLocale);
    if (milestone.complete) return `คุณดูคำศัพท์ครบทุกคำของ ${name} แล้ว`;
    return `หมุดหมาย ${milestone.words} คำของ ${name} — ก้าวสู่เป้าหมายต่อไปกันเถอะ`;
  }
  if (milestone.scope === ALL_SCOPE) {
    if (milestone.complete) return "Bạn đã xem hết mọi từ trong bộ — thật đáng nể!";
    if (milestone.words === 100) return "Trăm từ đầu tiên — hành trình đã thật sự bắt đầu.";
    return `Đã vượt mốc ${milestone.words} từ. Cứ đà này nhé!`;
  }
  const name = scopeLabel(milestone.scope, locale, "vi");
  if (milestone.complete) return `Bạn đã xem hết mọi từ của ${name}.`;
  return `Mốc ${milestone.words} từ của ${name} — tiến lên mốc tiếp theo nhé.`;
}
