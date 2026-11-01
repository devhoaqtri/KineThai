/**
 * Japanese (kana-bearing) page support: detection and zero-gap packed lines.
 *
 * Japanese is written without spaces. The deck's ASCII spaces only separate 文節 for
 * tokenising; the reader draws them flush, so the line packer joins segments with no
 * gap at all and a line may break between any two 文節. Glyphs themselves cost a full
 * em, unlike the ~0.58em average of Vietnamese letters.
 *
 * Exports: JAPANESE_LONG_PAGE_MORAE, isLikelyJapaneseText, getJapaneseMoraTokens,
 *   getJapaneseCharBudgetForLine, getJapaneseLayoutMetrics
 * Depends on: ./page-metrics
 */

import {
  getVietnameseCanvasInnerWidth,
  getVietnameseLineIndentEm,
  getVietnameseWordLines,
  suggestPackedFitScale,
} from "./page-metrics";
import type { VietnameseLayoutMetrics } from "./types";

/**
 * A Japanese page this long is too much for one screen: the pager splits it at a phrase
 * break, and one that cannot be split gets more time on screen. About one page in five.
 */
export const JAPANESE_LONG_PAGE_MORAE = 20;

/** Hiragana or katakana. Kanji alone is ambiguous (Chinese has no kana), so it never triggers. */
const KANA = /[\u3040-\u30ff\uff66-\uff9f]/u;
/** One CJK glyph — kanji, hiragana or katakana — is one mora unit for the entrance split. */
const JP_GLYPH = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
/**
 * Mora tokenizer alternation, in priority order: one kana/kanji glyph (every glyph is
 * its own unit), a run of letters/digits/underscores (a Latin word or a masked
 * "_____" blank stays whole), or a run of punctuation (glued to a neighbour below).
 */
const JP_TOKEN_RUNS =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]|[\p{L}\p{N}_]+|[^\p{L}\p{N}_\s]+/gu;
/** Opening quotes/brackets introduce what follows, so they glue to the NEXT unit. */
const JP_OPENING_PUNCTUATION = /^[‘“〝（［｛〈《「『【〔]/u;
/** A CJK glyph is about one em wide; the Latin average is 0.58em. */
const JAPANESE_AVG_CHAR_WIDTH_EM = 1;
const JAPANESE_LINE_SIDE_PAD_EM = 0.12;
/**
 * Soft ceiling on glyphs per line. Japanese has no spaces, so a wide page would
 * otherwise pack a whole clue onto one long line; ten glyphs keeps the block tall and
 * the line comfortably readable. The measured layout re-breaks from real widths.
 */
const JAPANESE_MAX_CHARS_PER_LINE = 10;

/**
 * True when the text contains kana. The reader uses this to refuse Japanese pages to
 * the Chinese per-glyph packer (kanji-heavy clue text can look Chinese) and to draw
 * the words flush instead of with Vietnamese inter-word gaps.
 * @param text - page text in either form
 * @returns true when at least one hiragana or katakana character is present
 * @pure true
 */
export function isLikelyJapaneseText(text: string): boolean {
  return KANA.test(text);
}

/**
 * Split Japanese text into per-mora animation units: one kana or kanji glyph each, with
 * a Latin/digit/underscore run (a masked "_____" blank) kept whole. Punctuation never
 * stands alone and never opens a unit — a closing mark ("、" "。") joins the glyph before
 * it, an opening mark ("「" "『") the glyph after. Line layout still packs whole 文節; this
 * finer split only drives the feed player's mora-by-mora entrance (WordSequenceWord).
 * @param text - a whole Japanese page (文節 separated by spaces) or a single 文節
 * @returns Ordered mora units whose visible characters reconstruct the text
 * @pure true
 */
export function getJapaneseMoraTokens(text: string): string[] {
  const tokens: string[] = [];
  let pendingPrefix = "";

  for (const run of text.match(JP_TOKEN_RUNS) ?? []) {
    if (JP_GLYPH.test(run) || /[\p{L}\p{N}_]/u.test(run)) {
      tokens.push(pendingPrefix + run);
      pendingPrefix = "";
      continue;
    }
    if (JP_OPENING_PUNCTUATION.test(run)) {
      pendingPrefix += run;
      continue;
    }
    if (tokens.length > 0) tokens[tokens.length - 1] += run;
    else pendingPrefix += run;
  }

  if (pendingPrefix) tokens.push(pendingPrefix);
  return tokens;
}

/**
 * Visible-character budget for one Japanese line at a given canvas width.
 * @param lineIndex - zero-based line
 * @param canvasInnerWidthPx - usable inner width, px
 * @param fontSizePx - font size the budget is counted at, px
 * @returns Soft glyph capacity for that line
 * @pure true
 */
export function getJapaneseCharBudgetForLine(
  lineIndex: number,
  canvasInnerWidthPx: number,
  fontSizePx: number,
): number {
  const indentEm = getVietnameseLineIndentEm(lineIndex);
  const availablePx =
    canvasInnerWidthPx - indentEm * fontSizePx - fontSizePx * JAPANESE_LINE_SIDE_PAD_EM;
  const charWidthPx = Math.max(fontSizePx * JAPANESE_AVG_CHAR_WIDTH_EM, 1);
  return Math.min(JAPANESE_MAX_CHARS_PER_LINE, Math.max(3, Math.floor(availablePx / charWidthPx)));
}

/**
 * Pack Japanese tokens (文節) into the shared staggered lines, drawn flush.
 * @param words - display tokens, one per 文節
 * @param canvasWidthPx - canvas width, px
 * @param fontSizePx - starting font size, px
 * @param visualScaleGuard - allowance for enlarged emphasised words
 * @param phraseKeys - data-annotated phrases kept unbreakable on a line
 * @returns Lines + suggestedFitScale
 * @pure true
 */
export function getJapaneseLayoutMetrics(
  words: string[],
  canvasWidthPx: number,
  fontSizePx: number,
  visualScaleGuard = 1,
  phraseKeys?: readonly (readonly string[])[],
): VietnameseLayoutMetrics {
  const innerWidth = getVietnameseCanvasInnerWidth(canvasWidthPx);
  const getLineCapacity = (lineIndex: number) =>
    getJapaneseCharBudgetForLine(lineIndex, innerWidth, fontSizePx);
  const lines = getVietnameseWordLines(words, {
    getLineCapacity,
    phraseKeys,
    gapUnits: 0,
    pairReach: false,
  });
  return {
    lines,
    suggestedFitScale: suggestPackedFitScale(lines, getLineCapacity, visualScaleGuard, 0),
  };
}
