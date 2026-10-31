/**
 * CJK (Han) spelling-coda helpers: script detection and stroke-draw timing.
 *
 * This module is deliberately PURE and imports no stroke data, so the card can branch
 * on it without pulling Hanzi Writer or the vendored stroke JSON into the English feed
 * chunk (see the vocabulary bundle-boundary rule). The heavy data lives beside the
 * lazily-imported HanziStrokeSpelling component instead.
 *
 * Timing model: the coda occupies a FIXED draw budget derived from the character count
 * alone (pure), then settle + hold. The component turns that budget into a per-stroke
 * speed using the real stroke count it reads from the bundled data, so a dense character
 * draws its many strokes faster and a simple one slower, while the card's playback timer
 * only ever needs the character count. This keeps timing owned by the playback hook.
 *
 * Exports: isHanAnswer, isJapaneseWord, isKoreanWord, getHanCharCount, getStrokeDrawBudgetSeconds, getStrokeSpellingDurationMs,
 *   solveStrokeTiming,
 *   STROKE_DRAW_BASE_SECONDS, STROKE_DRAW_PER_CHAR_SECONDS, STROKE_DRAW_MAX_SECONDS,
 *   STROKE_SETTLE_SECONDS, STROKE_MIN_MS, STROKE_MAX_MS
 * Depends on: ./spelling (hold + reduced-motion constants only)
 */

import { SPELLING_HOLD_SECONDS, SPELLING_REDUCED_MOTION_MS } from "./spelling";

/** A character of the Han script (Chinese; also covers Japanese kanji). */
const HAN = /\p{Script=Han}/u;

/**
 * Whether the revealed answer is written in Han characters, which is what routes the
 * coda to the stroke-by-stroke renderer instead of the Latin letter pop.
 * @param word Revealed answer. @returns True when it contains any Han character.
 * @pure true
 */
export function isHanAnswer(word: string): boolean {
  return HAN.test(word);
}

const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;

/**
 * Whether a word is Japanese: kana in the headword, or in its reading (a Japanese deck
 * writes a kanji word's reading in hiragana where a Chinese one writes pinyin). Japanese
 * answers keep the letter coda: the bundled stroke data is Chinese, and kana have none.
 * @param word Headword. @param reading The card's `ipa`. @returns True for Japanese.
 * @pure true
 */
export function isJapaneseWord(word: string, reading?: string): boolean {
  return KANA.test(word) || KANA.test(reading ?? "");
}

const HANGUL = /\p{Script=Hangul}/u;

/**
 * Whether a word is Korean (written in Hangul). Korean answers keep the letter coda and
 * get a syllable clue instead of a letter count.
 * @param word Headword. @returns True when it contains Hangul.
 * @pure true
 */
export function isKoreanWord(word: string): boolean {
  return HANGUL.test(word);
}

/**
 * Count the Han characters in an answer, the only input the draw budget needs.
 * @param word Revealed answer. @returns Number of Han characters (0 for a Latin word).
 * @pure true
 */
export function getHanCharCount(word: string): number {
  let count = 0;
  for (const ch of Array.from(word)) if (HAN.test(ch)) count += 1;
  return count;
}

// Draw budgets are the prior pacing divided by 1.5 — a 50% speed-up of the stroke
// progress, so a whole character finishes drawing well inside its coda page.
/** Base seconds spent drawing a single-character answer. */
export const STROKE_DRAW_BASE_SECONDS = 2.13;
/** Extra draw seconds per additional character (a two-character word draws both). */
export const STROKE_DRAW_PER_CHAR_SECONDS = 1.07;
/** Draw-budget ceiling so a long idiom cannot stall the stream. */
export const STROKE_DRAW_MAX_SECONDS = 4.67;
/** Seconds the finished character rests before the shared hold. */
export const STROKE_SETTLE_SECONDS = 1;
/** Fastest a single stroke slot may be, in ms (keeps simple characters legible). */
export const STROKE_MIN_MS = 90;
/** Slowest a single stroke slot may be, in ms (keeps dense characters in budget). */
export const STROKE_MAX_MS = 420;
/**
 * Hanzi Writer draws one stroke in `500 / strokeAnimationSpeed` milliseconds, so this
 * numerator converts a desired per-stroke duration into the library's speed multiplier.
 */
export const HANZI_STROKE_DURATION_NUMERATOR = 500;

/**
 * The seconds allotted to drawing every stroke, from the character count alone. Shared
 * by the duration the card feeds the playback timer and the per-stroke speed the
 * component solves, so the animation always finishes inside the coda page.
 * @param word Revealed answer. @returns Draw budget in seconds.
 * @pure true
 */
export function getStrokeDrawBudgetSeconds(word: string): number {
  const chars = Math.max(1, getHanCharCount(word));
  return Math.min(
    STROKE_DRAW_MAX_SECONDS,
    STROKE_DRAW_BASE_SECONDS + STROKE_DRAW_PER_CHAR_SECONDS * (chars - 1),
  );
}

/**
 * How long the Han stroke coda occupies, in milliseconds. Derived from the character
 * count alone so the card can compute it without any stroke data.
 * @param word Revealed answer. @param reducedMotion Preference. @returns Phase length in ms.
 * @pure true
 */
export function getStrokeSpellingDurationMs(word: string, reducedMotion: boolean): number {
  if (reducedMotion) return SPELLING_REDUCED_MOTION_MS;
  return Math.round(
    (getStrokeDrawBudgetSeconds(word) + STROKE_SETTLE_SECONDS + SPELLING_HOLD_SECONDS) * 1000,
  );
}

/** Per-stroke pacing handed to Hanzi Writer, solved from the real stroke count. */
export type StrokeTiming = {
  /**
   * Hanzi Writer's `strokeAnimationSpeed`: a speed MULTIPLIER, not a duration. The library
   * draws one stroke in `500 / strokeAnimationSpeed` milliseconds (higher = faster).
   */
  strokeAnimationSpeed: number;
  /** Hanzi Writer's `delayBetweenStrokes`, in milliseconds. */
  delayBetweenStrokes: number;
};

/**
 * Split the card's fixed draw budget across the character's actual strokes, clamped so
 * neither a two-stroke nor a thirty-stroke character looks wrong. About 70% of each slot
 * is the stroke draw and 30% the beat after it, giving the eye a pause per stroke.
 *
 * The returned `strokeAnimationSpeed` is Hanzi Writer's multiplier (a stroke draws in
 * `500 / speed` ms), NOT seconds-per-stroke — feeding it a seconds value makes the draw
 * roughly 10x too slow, so the coda page would advance before the writing finishes.
 * @param totalStrokes Sum of strokes across every character in the answer.
 * @param drawBudgetMs The budget `getStrokeDrawBudgetSeconds` allotted to drawing.
 * @returns Hanzi Writer pacing values.
 * @pure true
 */
export function solveStrokeTiming(totalStrokes: number, drawBudgetMs: number): StrokeTiming {
  if (!(totalStrokes > 0) || !(drawBudgetMs > 0)) {
    return { strokeAnimationSpeed: 3, delayBetweenStrokes: 90 };
  }
  const perStroke = Math.min(STROKE_MAX_MS, Math.max(STROKE_MIN_MS, drawBudgetMs / totalStrokes));
  const drawMs = Math.max(50, perStroke * 0.7);
  return {
    strokeAnimationSpeed: Math.round((HANZI_STROKE_DURATION_NUMERATOR / drawMs) * 100) / 100,
    delayBetweenStrokes: Math.round(perStroke * 0.3),
  };
}
