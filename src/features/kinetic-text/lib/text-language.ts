/**
 * Compatibility shim — prefer `@/features/kinetic-text` text-language exports.
 *
 * Exports: re-exports text-language/index public API
 * Depends on: features/kinetic-text/lib/text-language
 */

export {
  CLOSING_PUNCTUATION_CLASS,
  DEFAULT_TEXT_PAGE_WORD_LIMIT,
  VIETNAMESE_TEXT_PAGE_WORD_LIMIT,
  endsWithPunctuation,
  expandEmphasisToBoundPhrases,
  getBoundPhraseEmphasisSeed,
  getBoundPhraseStartIndex,
  getCompoundTokenKey,
  getDataEmphasisWordIndexes,
  getDataEmphasisWordSpans,
  getEmphasisPhraseKeysForLayout,
  getEmphasizedRunLayoutPhraseKeys,
  getEmphasizedRunPhraseKeys,
  getHanCharBudgetForLine,
  getHanLayoutMetrics,
  getHanTokens,
  getJapaneseCharBudgetForLine,
  getJapaneseLayoutMetrics,
  getJapaneseMoraTokens,
  getSpecialPoeticWordIndexes,
  getTextPageWordLimit,
  getVietnameseCanvasInnerWidth,
  getVietnameseCharBudgetForLine,
  getVietnameseLayoutMetrics,
  getVietnameseWordLines,
  isLikelyChineseText,
  isLikelyJapaneseText,
  isLikelyVietnameseText,
  repairSplitCompoundEmphasis,
  SHORT_SENTENCE_MAX_WORDS,
  countSentenceWords,
  limitShortSentenceEmphasis,
  MAX_MEASURED_SEGMENTS,
  getPunctuationPhraseEdges,
  isBreakOneWordFromEdge,
  solveMeasuredLines,
} from "./text-language/index";
export type {
  MeasuredLineBounds,
  MeasuredLineOptions,
  MeasuredLines,
  MeasuredSegment,
  VietnameseLayoutMetrics,
  VietnameseLineLayoutOptions,
  WordLine,
  WordSegment,
} from "./text-language/index";
