/**
 * Shared types for Vietnamese kinetic line layout.
 *
 * Exports: WordLine, WordSegment, VietnameseLayoutMetrics, VietnameseLineLayoutOptions
 * Depends on: none
 */

/**
 * @responsibility One laid-out Vietnamese line (indent + unbreakable segments).
 * @pure true
 */
export type WordLine = {
  // Indent is expressed in em (relative to the font size) rather than fixed px so
  // it scales down together with the text. Fixed-px indents caused a collapse
  // feedback loop: a wide line shrank the font, but the px indent stayed put and
  // ate the narrowed line, forcing an even smaller font on deeper-wrapping pages.
  indentEm: number;
  segments: WordSegment[];
};
/**
 * @responsibility Unbreakable word group (bound phrase or single token) on a line.
 * @pure true
 */
export type WordSegment = {
  key: string;
  words: Array<{ text: string; index: number }>;
};
/**
 * @responsibility Optional capacity override for Vietnamese line packing.
 * @pure true
 */
export type VietnameseLineLayoutOptions = {
  getLineCapacity?: (lineIndex: number) => number;
  // Data-annotated phrase keys (diacritic-preserving) that must stay unbreakable
  // on a line, exactly like the curated bound phrases.
  phraseKeys?: readonly (readonly string[])[];
  /**
   * Most syllables one line may hold. Defaults to VIETNAMESE_MAX_LINE_SYLLABLES; a page of
   * Latin-script words set on the same waterfall lines (the vocabulary usage sentence)
   * passes Infinity, because the cap is a Vietnamese reading rule, not a layout one.
   */
  maxLineSyllables?: number;
};
/**
 * @responsibility Packed lines plus a pre-shrink fit scale suggestion.
 * @pure true
 */
export type VietnameseLayoutMetrics = {
  lines: WordLine[];
  suggestedFitScale: number;
};
