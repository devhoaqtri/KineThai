/**
 * Feed-player tempo, page duration, and text sizing helpers (not KineticText preview tempo).
 *
 * Exports: tempoConfig, TEXT_SAFE_*, fit constants, getPageDuration, getWordDelay, getMoraDelay, getUniformPageTextSize, isSoloTextPage
 * Depends on: features/canvas Tempo/Rhythm, features/kinetic-text getWords/getHanTokens/getJapaneseMoraTokens/script detection
 */

import type { Rhythm, Tempo } from "@/features/canvas";
import {
  getHanTokens,
  getJapaneseMoraTokens,
  getWords,
  isLikelyChineseText,
  isLikelyJapaneseText,
  isLikelyVietnameseText,
  JAPANESE_LONG_PAGE_MORAE,
} from "@/features/kinetic-text";

/** Keep kinetic text clear of the canvas edge without stealing its scale. */
export const TEXT_SAFE_MAX_WIDTH = "min(92%, calc(100% - 2rem))";
// Hard minimum leading/trailing gap the fit solver reserves on a wrapping page, so a
// long unbreakable word shrinks to sit inside this gutter instead of spilling off both
// screen edges. Applied on top of the safe-width cap above.
export const TEXT_SAFE_MIN_EDGE_GAP_PX = 16;
export const TEXT_SAFE_TOP_PX = 72;
export const TEXT_SAFE_BOTTOM_PX = 132;
export const MIN_TEXT_FIT_SCALE = 0.46;
export const MIN_ENGLISH_TEXT_FIT_SCALE = 0.72;
export const EMPHASIS_SCALE_FIT_GUARD = 1.14;
// Defined in the shared text layer beside the rest of the emphasis vocabulary, and
// re-exported here so this module stays the one place the player reads its numbers from.
export { EMPHASIS_FONT_SCALE } from "@/features/kinetic-text";
export const VIETNAMESE_SCALE_FIT_GUARD = 1.24;
export const MIN_FONT_SIZE = 64;

// Feed player tempo — shape and wordDelay/wordDuration diverge from KineticText's
// preview tempoConfig ({ duration, wordDelay, loopSeconds }). loopSeconds stay
// aligned with shared TEMPO_LOOP_SECONDS / getLoopAnimation; do not unify the rest.
export const tempoConfig: Record<
  Tempo,
  { pageMultiplier: number; wordDelay: number; wordDuration: number; loopSeconds: number }
> = {
  slow: { pageMultiplier: 1.22, wordDelay: 0.25, wordDuration: 0.72, loopSeconds: 3.4 },
  steady: { pageMultiplier: 1, wordDelay: 0.18, wordDuration: 0.5, loopSeconds: 2.4 },
  snappy: { pageMultiplier: 0.78, wordDelay: 0.1, wordDuration: 0.36, loopSeconds: 1.45 },
};

/**
 * Rhythm units on a page. A Han page counts per-character tokens: whitespace splitting
 * collapses a whole Chinese sentence into one "word", which would read as a solo page,
 * while the packed-line renderer animates one entrance per glyph.
 * @param text - page text
 * @returns Token count in the unit that page's renderer actually staggers over
 */
function getPageWordCount(text: string): number {
  return isLikelyChineseText(text) ? getHanTokens(text).length : getWords(text).length;
}

/**
 * Check isSoloTextPage.
 * @param text - text argument
 * @returns Boolean result
 */
export function isSoloTextPage(text: string): boolean {
  return getPageWordCount(text) <= 1;
}

/**
 * Compute uniformpagetextsize.
 * @param baseSize - baseSize argument
 * @param pages - pages argument
 * @param fullText - fullText argument
 * @returns Computed value
 */
export function getUniformPageTextSize(
  baseSize: number,
  pages: string[],
  fullText: string,
): number {
  // Single page: use its optimal size
  if (pages.length <= 1) {
    return Math.max(
      MIN_FONT_SIZE,
      getPageTextSize(baseSize, pages[0] ?? "", isLikelyVietnameseText(fullText)),
    );
  }

  // Multi-page: find the SMALLEST page (fewest words) to determine a uniform
  // size that works for all. This makes all pages display large and consistent.
  // Never shrinks below MIN_FONT_SIZE.
  const isVietnamese = isLikelyVietnameseText(fullText);
  const minWordCount = Math.min(...pages.map(getPageWordCount));

  let size: number;
  if (isVietnamese) {
    if (minWordCount >= 9) size = Math.min(baseSize, 78);
    else if (minWordCount >= 7) size = Math.min(baseSize, 84);
    else if (minWordCount >= 5) size = Math.min(baseSize, 92);
    else if (minWordCount >= 3) size = Math.min(baseSize, 104);
    else size = baseSize;
  } else if (isLikelyChineseText(fullText)) {
    // Han pages wear the Vietnamese size band; a glyph is roughly half a Vietnamese
    // syllable's budget units, so the tier thresholds stretch by ~1.4×.
    if (minWordCount >= 13) size = Math.min(baseSize, 78);
    else if (minWordCount >= 10) size = Math.min(baseSize, 84);
    else if (minWordCount >= 7) size = Math.min(baseSize, 92);
    else if (minWordCount >= 4) size = Math.min(baseSize, 104);
    else size = baseSize;
  } else {
    // English: bump size based on min word count (smaller pages get larger fonts)
    if (minWordCount >= 14) size = Math.max(baseSize, 80);
    else if (minWordCount >= 10) size = Math.max(baseSize, 86);
    else if (minWordCount >= 6) size = Math.max(baseSize, 92);
    else size = Math.max(baseSize, 96);
  }

  return Math.max(MIN_FONT_SIZE, size);
}

/**
 * Compute pagetextsize.
 * @param baseSize - baseSize argument
 * @param text - text argument
 * @param isVietnamese - isVietnamese argument
 * @returns Computed value
 */
export function getPageTextSize(baseSize: number, text: string, isVietnamese: boolean): number {
  const wordCount = getPageWordCount(text);
  if (isVietnamese) {
    if (wordCount >= 9) return Math.min(baseSize, 78);
    if (wordCount >= 7) return Math.min(baseSize, 84);
    if (wordCount >= 5) return Math.min(baseSize, 92);
    if (wordCount >= 3) return Math.min(baseSize, 104);
    return baseSize;
  }
  // Han text: the Vietnamese band with thresholds stretched for per-glyph counting.
  if (isLikelyChineseText(text)) {
    if (wordCount >= 13) return Math.min(baseSize, 78);
    if (wordCount >= 10) return Math.min(baseSize, 84);
    if (wordCount >= 7) return Math.min(baseSize, 92);
    if (wordCount >= 4) return Math.min(baseSize, 104);
    return baseSize;
  }
  // English text: bump base size so it fills the canvas like Vietnamese posts.
  if (wordCount >= 14) return Math.max(baseSize, 80);
  if (wordCount >= 10) return Math.max(baseSize, 86);
  if (wordCount >= 6) return Math.max(baseSize, 92);
  return Math.max(baseSize, 96);
}

/** The shortest a page may stay up before tempo and pace, in every language. */
const MIN_PAGE_MS = 3200;

/**
 * Morae that take as long to read as one Vietnamese syllable: the same clue runs about 14
 * morae in the Japanese decks and 9 syllables in the Vietnamese ones. A 文節 is no measure
 * of this, since a whole clue is only about five of them.
 */
const MORAE_PER_SYLLABLE = 1.5;

/**
 * A long Japanese page is normally split in two; one with no phrase break to split at gets
 * this much more time, since the word count stops adding any at 12 morae.
 */
const LONG_PAGE_SCALE = 1.5;

/**
 * Compute pageduration.
 * @param text - text argument
 * @param tempo - tempo argument
 * @param rhythm - rhythm argument
 * @returns Computed value
 */
export function getPageDuration(text: string, tempo: Tempo, rhythm: Rhythm): number {
  // A Japanese page is timed by how much there is to read, in the same units as every
  // other language, so a clue stays up as long as its Vietnamese equivalent. It reveals
  // mora by mora, so a page with more cascade than that keeps the time to finish it.
  const japanese = isLikelyJapaneseText(text);
  const moraCount = japanese ? getJapaneseMoraTokens(text).length : 0;
  const wordCount = japanese ? moraCount / MORAE_PER_SYLLABLE : getPageWordCount(text);
  const base = Math.max(MIN_PAGE_MS, Math.min(5200, 1900 + wordCount * 430));
  const rhythmMultiplier = rhythm === "poetic" ? 1.18 : 1;
  const scale = tempoConfig[tempo].pageMultiplier * rhythmMultiplier;
  if (japanese) {
    const cascade =
      (getMoraDelay(moraCount, tempo, rhythm) + tempoConfig[tempo].wordDuration) *
        tempoConfig[tempo].pageMultiplier *
        1000 +
      800;
    const length = moraCount >= JAPANESE_LONG_PAGE_MORAE ? LONG_PAGE_SCALE : 1;
    return Math.max(base * scale * length, cascade);
  }
  return base * scale;
}

/**
 * Compute postexportduration.
 * @param pages - pages argument
 * @param tempo - tempo argument
 * @param rhythm - rhythm argument
 * @returns Computed value
 */
export function getPostExportDuration(pages: string[], tempo: Tempo, rhythm: Rhythm): number {
  const onePass = pages.reduce(
    (duration, page) => duration + getPageDuration(page, tempo, rhythm),
    0,
  );
  return Math.max(3600, onePass + 650);
}

// Feed rhythm delays — smooth/burst multipliers differ from KineticText getRhythmDelay.
/**
 * Compute worddelay.
 * @param index - index argument
 * @param tempo - tempo argument
 * @param rhythm - rhythm argument
 * @returns Computed value
 */
export function getWordDelay(index: number, tempo: Tempo, rhythm: Rhythm): number {
  const base = tempoConfig[tempo].wordDelay;
  if (rhythm === "poetic") return index * base * 1.45;
  if (rhythm === "smooth") return index * base * 0.58;
  if (rhythm === "burst") return Math.min(index * base * 0.42, 0.38);
  return index * base;
}

// Per-mora entrance stagger for Japanese pages (see getMoraDelay). About half the
// matching wordDelay above: a mora is a shorter beat than a Vietnamese syllable, and a
// Japanese page carries far more of them, so the cascade still fits inside the page dwell.
const MORA_STAGGER: Record<Tempo, number> = {
  slow: 0.13,
  steady: 0.09,
  snappy: 0.05,
};

// Feed mora delays — one continuous cascade across a Japanese page, indexed by the mora's
// position over the WHOLE page (not its 文節), so the sentence streams in syllable by syllable.
/**
 * Compute moradelay.
 * @param moraIndex - zero-based mora position across the whole page
 * @param tempo - tempo argument
 * @param rhythm - rhythm argument
 * @returns Seconds before this mora starts its entrance
 */
export function getMoraDelay(moraIndex: number, tempo: Tempo, rhythm: Rhythm): number {
  const base = MORA_STAGGER[tempo];
  if (rhythm === "poetic") return moraIndex * base * 1.45;
  if (rhythm === "smooth") return moraIndex * base * 0.58;
  if (rhythm === "burst") return Math.min(moraIndex * base * 0.42, 0.38);
  return moraIndex * base;
}

/**
 * Compute textsafeinsets.
 * @param canvasHeight - canvasHeight argument
 * @returns Computed value
 */
export function getTextSafeInsets(canvasHeight: number): { top: number; bottom: number } {
  return {
    top: Math.max(TEXT_SAFE_TOP_PX, canvasHeight * 0.09),
    bottom: Math.max(TEXT_SAFE_BOTTOM_PX, canvasHeight * 0.17),
  };
}
