/**
 * Text-language public API — page limits, Vietnamese/Han detection, layout, bound phrases.
 *
 * Exports: getTextPageWordLimit, isLikelyVietnameseText, isLikelyChineseText, layout + phrase helpers
 * Depends on: text-language/page-metrics, text-language/vietnamese-phrases, text-language/han-lines
 */

import { isLikelyVietnameseText } from "./vietnamese-phrases";

/** Default max words per English kinetic page — a soft preference for page rhythm, not a split boundary. */
export const DEFAULT_TEXT_PAGE_WORD_LIMIT = 7;
/** Default max words per Vietnamese kinetic page — a soft preference for page rhythm, not a split boundary. */
export const VIETNAMESE_TEXT_PAGE_WORD_LIMIT = 10;

export type {
  WordLine,
  WordSegment,
  VietnameseLineLayoutOptions,
  VietnameseLayoutMetrics,
} from "./types";

export {
  getHanCharBudgetForLine,
  getHanLayoutMetrics,
  getVietnameseCanvasInnerWidth,
  getVietnameseCharBudgetForLine,
  getVietnameseLayoutMetrics,
  getVietnameseWordLines,
} from "./page-metrics";

export { CLOSING_PUNCTUATION_CLASS, endsWithPunctuation } from "./closing-punctuation";

export {
  MAX_MEASURED_SEGMENTS,
  getPunctuationPhraseEdges,
  isBreakOneWordFromEdge,
  solveMeasuredLines,
} from "./measured-lines";
export type {
  MeasuredLineBounds,
  MeasuredLineOptions,
  MeasuredLines,
  MeasuredSegment,
} from "./measured-lines";

export { getHanTokens, isLikelyChineseText } from "./han-lines";

export {
  getJapaneseCharBudgetForLine,
  getJapaneseLayoutMetrics,
  getJapaneseMoraTokens,
  isLikelyJapaneseText,
} from "./japanese-text";

export {
  expandEmphasisToBoundPhrases,
  getBoundPhraseEmphasisSeed,
  getBoundPhraseStartIndex,
  getCompoundTokenKey,
  getSpecialPoeticWordIndexes,
  isLikelyVietnameseText,
  repairSplitCompoundEmphasis,
} from "./vietnamese-phrases";
export {
  SHORT_SENTENCE_MAX_WORDS,
  countSentenceWords,
  limitShortSentenceEmphasis,
} from "./short-sentence-emphasis";
export {
  getDataEmphasisWordIndexes,
  getDataEmphasisWordSpans,
  getEmphasisPhraseKeysForLayout,
  getEmphasizedRunLayoutPhraseKeys,
  getEmphasizedRunPhraseKeys,
} from "./data-emphasis";

/**
 * Choose the page word budget based on detected language.
 * Sentence-safe pagination keeps sentences whole, so the limit acts as a soft
 * preference for page rhythm — it also anchors the long-sentence threshold
 * (2× the limit) below which a sentence never breaks.
 * @param text - text argument
 * @returns VIETNAMESE_TEXT_PAGE_WORD_LIMIT or DEFAULT_TEXT_PAGE_WORD_LIMIT
 */
export function getTextPageWordLimit(text: string): number {
  return isLikelyVietnameseText(text)
    ? VIETNAMESE_TEXT_PAGE_WORD_LIMIT
    : DEFAULT_TEXT_PAGE_WORD_LIMIT;
}
