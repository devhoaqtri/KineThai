/**
 * Vietnamese + Han kinetic line packing and page fit metrics.
 *
 * Exports: WordLine, WordSegment, VIETNAMESE_MAX_LINE_SYLLABLES, countSegmentSyllables, getVietnameseWordLines, getVietnameseLayoutMetrics, getHanCharBudgetForLine, getHanLayoutMetrics, getVietnameseLineIndentEm, char budget helpers
 * Depends on: text-language/vietnamese-phrases getBoundPhraseLength
 */

import { getBoundPhraseLength } from "./vietnamese-phrases";
import { isHanToken } from "./han-lines";
import type {
  VietnameseLayoutMetrics,
  VietnameseLineLayoutOptions,
  WordLine,
  WordSegment,
} from "./types";

export type {
  VietnameseLayoutMetrics,
  VietnameseLineLayoutOptions,
  WordLine,
  WordSegment,
} from "./types";

// Vietnamese kinetic text reads as a left-aligned staggered block. Each deeper
// line steps in by a fraction of an em, so the stagger scales with the font and
// never collapses narrow pages.
const VIETNAMESE_LINE_INDENT_EM = [0, 0.22, 0.38, 0.5] as const;
const VIETNAMESE_MAX_LINE_CHARS = 9;
const VIETNAMESE_AVG_CHAR_WIDTH_EM = 0.58;
const VIETNAMESE_LINE_SIDE_PAD_EM = 0.12;
const VIETNAMESE_MIN_FIT_SCALE = 0.52;
// A thin column of single-word lines reads as unbalanced. Vietnamese meaningful
// words are usually two syllables, so a line should prefer to carry a pair. We
// never allow more than this many single-segment lines in a row.
const VIETNAMESE_MAX_CONSECUTIVE_SOLO_LINES = 3;
// How far the soft line capacity may stretch to pull a second segment up so the
// line isn't left as a single word. The gentle value applies everywhere (to
// discourage solo lines); the hard value is used once the consecutive-solo cap
// is reached and a pair must be forced.
const VIETNAMESE_PAIR_RELAX_CHARS = 3;
const VIETNAMESE_PAIR_FORCE_CHARS = 6;
/**
 * No Vietnamese line holds more than this many syllables. A longer line is set small
 * because its width binds, and that page then reads far smaller than its neighbours. A
 * bonded word longer than this still stands whole on a line of its own: bonds never split.
 */
export const VIETNAMESE_MAX_LINE_SYLLABLES = 4;

const HAS_GLYPH = /\p{L}|\p{N}/u;

/**
 * Syllables in a segment: one per token that draws a letter or digit. A Vietnamese token
 * is one syllable (a `_` bond is a no-break space, and tokens split on it); a mark standing
 * alone, such as "—", counts nothing.
 * @pure true
 */
export function countSegmentSyllables(segment: WordSegment): number {
  return segment.words.filter((word) => HAS_GLYPH.test(word.text)).length;
}
// Han pages pack through the SAME staggered line machinery as Vietnamese, one
// character per token. A token costs the budget one visible char plus one joining
// gap; a Han glyph is ~1em wide and the gap ~0.24em, so the average unit lands
// near 0.62em — the block fills the canvas at the physical width the eye already
// associates with the Vietnamese layout, just in fewer, squarer glyphs.
const HAN_AVG_CHAR_WIDTH_EM = 0.62;
/**
 * Hard ceiling on Han glyphs per line. Without it, a short Chinese sentence on a wide
 * canvas fits on one shrunken line and leaves the rest of the screen empty. Four glyphs
 * per line keeps the block tall, the font readable, and the vertical fill balanced.
 */
const HAN_MAX_CHARS_PER_LINE = 4;
/**
 * Inner content width for Vietnamese staggered layout.
 * @param canvasWidthPx - canvasWidthPx argument
 * @returns Usable inner width (≥ 200)
 */
export function getVietnameseCanvasInnerWidth(canvasWidthPx: number): number {
  return Math.max(200, canvasWidthPx * 0.92 - 32);
}

/**
 * Visible-character budget for one Vietnamese line at a given canvas width.
 * @param lineIndex - lineIndex argument
 * @param canvasInnerWidthPx - canvasInnerWidthPx argument
 * @param fontSizePx - fontSizePx argument
 * @returns Soft character capacity for that line
 */
export function getVietnameseCharBudgetForLine(
  lineIndex: number,
  canvasInnerWidthPx: number,
  fontSizePx: number,
): number {
  const indentEm = getVietnameseLineIndentEm(lineIndex);
  const availablePx =
    canvasInnerWidthPx - indentEm * fontSizePx - fontSizePx * VIETNAMESE_LINE_SIDE_PAD_EM;
  const charWidthPx = Math.max(fontSizePx * VIETNAMESE_AVG_CHAR_WIDTH_EM, 1);
  return Math.max(4, Math.floor(availablePx / charWidthPx));
}

/**
 * Pack lines using canvas width, then pre-shrink if any line still overflows.
 * @param words - words argument
 * @param canvasWidthPx - canvasWidthPx argument
 * @param fontSizePx - fontSizePx argument
 * @param visualScaleGuard - visualScaleGuard argument
 * @param phraseKeys - data-annotated phrase keys kept unbreakable on a line
 * @returns Lines + suggestedFitScale (≥ VIETNAMESE_MIN_FIT_SCALE)
 */
export function getVietnameseLayoutMetrics(
  words: string[],
  canvasWidthPx: number,
  fontSizePx: number,
  visualScaleGuard = 1,
  phraseKeys?: readonly (readonly string[])[],
): VietnameseLayoutMetrics {
  const innerWidth = getVietnameseCanvasInnerWidth(canvasWidthPx);
  const getLineCapacity = (lineIndex: number) =>
    getVietnameseCharBudgetForLine(lineIndex, innerWidth, fontSizePx);
  const lines = getVietnameseWordLines(words, { getLineCapacity, phraseKeys });
  return {
    lines,
    suggestedFitScale: suggestPackedFitScale(lines, getLineCapacity, visualScaleGuard),
  };
}

/**
 * Visible-character budget for one Han line at a given canvas width.
 * @param lineIndex - lineIndex argument
 * @param canvasInnerWidthPx - canvasInnerWidthPx argument
 * @param fontSizePx - fontSizePx argument
 * @returns Soft character-capacity for that line, clamped to HAN_MAX_CHARS_PER_LINE
 */
export function getHanCharBudgetForLine(
  lineIndex: number,
  canvasInnerWidthPx: number,
  fontSizePx: number,
): number {
  const indentEm = getVietnameseLineIndentEm(lineIndex);
  const availablePx =
    canvasInnerWidthPx - indentEm * fontSizePx - fontSizePx * VIETNAMESE_LINE_SIDE_PAD_EM;
  const charWidthPx = Math.max(fontSizePx * HAN_AVG_CHAR_WIDTH_EM, 1);
  return Math.min(HAN_MAX_CHARS_PER_LINE, Math.max(3, Math.floor(availablePx / charWidthPx)));
}

/**
 * Pack Han tokens into the Vietnamese staggered lines and pre-shrink to fit.
 * @param words - getHanTokens output for the page
 * @param canvasWidthPx - canvasWidthPx argument
 * @param fontSizePx - fontSizePx argument
 * @param visualScaleGuard - visualScaleGuard argument
 * @param phraseKeys - data-annotated phrase keys (per-character) kept unbreakable
 * @returns Lines + suggestedFitScale (≥ VIETNAMESE_MIN_FIT_SCALE)
 */
export function getHanLayoutMetrics(
  words: string[],
  canvasWidthPx: number,
  fontSizePx: number,
  visualScaleGuard = 1,
  phraseKeys?: readonly (readonly string[])[],
): VietnameseLayoutMetrics {
  const innerWidth = getVietnameseCanvasInnerWidth(canvasWidthPx);
  const getLineCapacity = (lineIndex: number) =>
    getHanCharBudgetForLine(lineIndex, innerWidth, fontSizePx);
  const lines = getVietnameseWordLines(words, { getLineCapacity, phraseKeys });
  return {
    lines,
    suggestedFitScale: suggestPackedFitScale(lines, getLineCapacity, visualScaleGuard),
  };
}

/**
 * Shrink a packed page until its widest line fits the canvas. Shared by both
 * languages: the packing model — units against a per-line capacity — is identical.
 * @param lines - packed lines
 * @param getLineCapacity - capacity curve the lines were packed with
 * @param visualScaleGuard - allowance for enlarged emphasised words
 * @returns Fit scale the page should start its measurement loop at
 */
export function suggestPackedFitScale(
  lines: WordLine[],
  getLineCapacity: (lineIndex: number) => number,
  visualScaleGuard: number,
  gapUnits = 1,
): number {
  let suggestedFitScale = 1;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const visibleChars =
      line.segments.reduce((total, segment) => total + getSegmentVisibleLength(segment), 0) +
      Math.max(0, line.segments.length - 1) * gapUnits;
    const capacity = getLineCapacity(lineIndex);
    const neededChars = visibleChars * Math.max(visualScaleGuard, 1);
    if (neededChars > capacity) {
      suggestedFitScale = Math.min(suggestedFitScale, (capacity / neededChars) * 0.96);
    }
  }

  return Math.max(VIETNAMESE_MIN_FIT_SCALE, suggestedFitScale);
}

/**
 * Pack Vietnamese words into indented staggered lines.
 * @param words - words argument
 * @param options? - options? argument
 * @returns WordLine array (empty when no words)
 */
export function getVietnameseWordLines(
  words: string[],
  options?: VietnameseLineLayoutOptions,
): WordLine[] {
  if (words.length === 0) return [];

  const segments = getVietnameseWordSegments(words, options?.phraseKeys);
  const gapUnits = options?.gapUnits ?? 1;
  const pairReach = options?.pairReach !== false;
  const lines: WordLine[] = [];
  let index = 0;
  let consecutiveSolo = 0;

  while (index < segments.length) {
    const capacity =
      options?.getLineCapacity?.(lines.length) ?? getVietnameseLineCapacity(lines.length);
    // Once we've stacked the max run of single-word lines, the next line must
    // carry a pair so the column can't grow any thinner.
    const forcePair = pairReach && consecutiveSolo >= VIETNAMESE_MAX_CONSECUTIVE_SOLO_LINES;
    // Han pages pack one glyph per token, so a "solo line" (one segment = one Han
    // character) is the natural short-line shape. The Vietnamese pair-reach exists to
    // keep two-syllable compounds together; applying it to Han would balloon a 4-glyph
    // line to 10, defeating HAN_MAX_CHARS_PER_LINE. Detect the Han line once from its
    // first segment and skip the pair-reach for the rest of the pack.
    const lineIsHan = segments[index]!.words.every((word) => isHanToken(word.text));

    const lineSegments: WordSegment[] = [];
    let lineLength = 0;
    // Visual word count for the line. A bound phrase ("hình ảnh") is one segment
    // but two words, so a line holding it alone is already balanced — thinness is
    // measured in words, not segments.
    let lineWords = 0;
    // Han word-integrity pull is allowed exactly once per line: two adjacent lone
    // Han characters form a plausible 2-character word, but a third lone Han glued
    // onto the pair is a separate word and should start a new line. Without this
    // flag the look-ahead chains indefinitely and the 4-glyph cap becomes
    // decorative.
    let hanRescueUsed = false;
    let lineSyllables = 0;

    while (index < segments.length) {
      const segment = segments[index];
      const segmentLength = getSegmentVisibleLength(segment);
      const segmentWords = segment.words.length;
      const segmentSyllables = countSegmentSyllables(segment);
      const projected = lineLength + (lineSegments.length > 0 ? gapUnits : 0) + segmentLength;

      // The first segment always lands on the line, however wide it is.
      if (lineSegments.length === 0) {
        lineSegments.push(segment);
        lineLength = segmentLength;
        lineWords = segmentWords;
        lineSyllables = segmentSyllables;
        index += 1;
        continue;
      }

      // A Vietnamese line never grows past the syllable cap, whatever room is left.
      if (
        !lineIsHan &&
        options?.gapUnits !== 0 &&
        lineSyllables + segmentSyllables > VIETNAMESE_MAX_LINE_SYLLABLES
      )
        break;

      // Within the soft capacity — keep filling.
      if (projected <= capacity) {
        lineSegments.push(segment);
        lineLength = projected;
        lineWords += segmentWords;
        lineSyllables += segmentSyllables;
        index += 1;
        continue;
      }

      // Han word integrity: when the line ends with a single Han character and the
      // next segment is also a single Han character, they likely form a 2-character
      // word. Pull the next segment onto this line even if it exceeds capacity, so
      // the word stays together rather than being split across two lines.
      // Bounded to one rescue per line so a run of lone-Han tokens cannot chain
      // past HAN_MAX_CHARS_PER_LINE.
      const lastSeg = lineSegments[lineSegments.length - 1];
      const lastIsSoloHan =
        lastSeg.words.length === 1 &&
        getVisibleWordLength(lastSeg.words[0].text) === 1 &&
        isHanToken(lastSeg.words[0].text);
      const nextIsSoloHan =
        segment.words.length === 1 &&
        getVisibleWordLength(segment.words[0].text) === 1 &&
        isHanToken(segment.words[0].text);
      if (!hanRescueUsed && lastIsSoloHan && nextIsSoloHan) {
        lineSegments.push(segment);
        lineLength = projected;
        lineWords += segmentWords;
        lineSyllables += segmentSyllables;
        hanRescueUsed = true;
        index += 1;
        continue;
      }

      // Over capacity, but the line is still a single word. Reach a little further
      // to pull a partner up rather than leave a one-word line. The reach is wider
      // when a pair is being forced by the consecutive-solo cap. Han lines skip
      // this rescue — a lone Han glyph is already a whole word, so a short Han line
      // is intentional and the pair-reach would only balloon the 4-glyph cap.
      if (!lineIsHan && pairReach && lineWords === 1) {
        const reach =
          capacity + (forcePair ? VIETNAMESE_PAIR_FORCE_CHARS : VIETNAMESE_PAIR_RELAX_CHARS);
        if (forcePair || projected <= reach) {
          lineSegments.push(segment);
          lineLength = projected;
          lineWords += segmentWords;
          lineSyllables += segmentSyllables;
          index += 1;
        }
      }
      break;
    }

    lines.push({
      indentEm: getVietnameseLineIndentEm(lines.length),
      segments: lineSegments,
    });
    consecutiveSolo = lineWords === 1 ? consecutiveSolo + 1 : 0;
  }

  return lines;
}

function getVietnameseWordSegments(
  words: string[],
  phraseKeys?: readonly (readonly string[])[],
): WordSegment[] {
  const segments: WordSegment[] = [];

  for (let index = 0; index < words.length;) {
    // A bound phrase is one meaningful Vietnamese word (two syllables). It is
    // kept whole as a single, unbreakable segment — the line packer never
    // splits a segment, so a compound word can never straddle two lines. A phrase
    // wider than a line simply lands alone and the page font shrinks to fit it;
    // we never break the word to save space. Data-annotated phrases join the
    // curated list. Words matching neither (e.g. "khoảng" and "thở") are
    // separate segments and can land on different lines.
    const phraseLength = getBoundPhraseLength(words, index, phraseKeys);
    const segmentWords = words.slice(index, index + phraseLength).map((text, offset) => ({
      text,
      index: index + offset,
    }));

    segments.push({
      key: segmentWords.map((word) => `${word.index}-${word.text}`).join("|"),
      words: segmentWords,
    });
    index += phraseLength;
  }

  return segments;
}

/**
 * Indent of a staggered line, in em of the page font.
 * @param lineIndex - zero-based line
 * @returns The step for that depth; lines past the last step share it
 * @pure true
 */
export function getVietnameseLineIndentEm(lineIndex: number): number {
  return VIETNAMESE_LINE_INDENT_EM[Math.min(lineIndex, VIETNAMESE_LINE_INDENT_EM.length - 1)];
}

function getVietnameseLineCapacity(lineIndex: number) {
  const step = Math.min(lineIndex, VIETNAMESE_LINE_INDENT_EM.length - 1);
  const indentEm = getVietnameseLineIndentEm(lineIndex);
  const indentCharCost = Math.round(indentEm * 4.8);
  return Math.max(4, VIETNAMESE_MAX_LINE_CHARS - step - indentCharCost);
}

function getVisibleWordLength(word: string) {
  return Array.from(word.normalize("NFC")).length;
}

function getSegmentVisibleLength(segment: WordSegment) {
  return segment.words.reduce(
    (total, word, index) => total + getVisibleWordLength(word.text) + (index > 0 ? 1 : 0),
    0,
  );
}
