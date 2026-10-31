/**
 * Feed-player word emphasis selection (diverges from KineticText preview emphasis).
 *
 * Exports: getEmphasizedWordIndexes, getWordImportance
 * Depends on: features/kinetic-text emphasis + Vietnamese compound-repair helpers
 */

import {
  expandEmphasisToBoundPhrases,
  getCompoundTokenKey,
  getDataEmphasisWordSpans,
  getEmphasisPhraseKeysForLayout,
  getSpecialPoeticWordIndexes,
  getWords,
  isLikelyVietnameseText,
  limitShortSentenceEmphasis,
  repairSplitCompoundEmphasis,
} from "@/features/kinetic-text";

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "for",
  "from",
  "in",
  "is",
  "it",
  "its",
  "of",
  "on",
  "or",
  "so",
  "the",
  "to",
  "you",
  "your",
]);

const EMPHASIS_WORDS = new Set([
  "archive",
  "breathe",
  "count",
  "draft",
  "drafts",
  "fade",
  "feeling",
  "first",
  "frame",
  "glowing",
  "honest",
  "idea",
  "important",
  "landing",
  "louder",
  "memory",
  "motion",
  "pause",
  "proof",
  "protect",
  "replay",
  "rhythm",
  "sentence",
  "spark",
  "surprise",
  "timing",
  "work",
]);

// Feed emphasis selection — selection fallback and getWordImportance scoring diverge
// from KineticText getPreviewEmphasizedWordIndexes / getPreviewWordImportance.
/**
 * Keep at most N highlighted runs on a page. A highlighted run is one
 * contiguous sequence of emphasized tokens (a Vietnamese compound counts as
 * one run); runs are kept in text order, and a non-empty input never shrinks
 * below one run.
 * @param indexes - emphasized token indexes
 * @param maxRuns - maximum number of runs to keep
 * @returns The indexes of the first N runs
 */
function keepFirstRuns(indexes: Iterable<number>, maxRuns: number): Set<number> {
  const runs: number[][] = [];
  for (const index of [...indexes].sort((left, right) => left - right)) {
    const last = runs[runs.length - 1];
    if (last && index === last[last.length - 1] + 1) last.push(index);
    else runs.push([index]);
  }
  return new Set(runs.slice(0, maxRuns).flat());
}

/**
 * Compute emphasizedwordindexes. A page of four words or fewer always ends with a
 * single highlighted word (limitShortSentenceEmphasis), whichever path chose it.
 * @param words - words argument
 * @param dataEmphasis - optional upstream annotation phrases; exact matches win over scoring
 * @param boundPhrases - optional phrases the source text marked as ONE word. They pick
 *   nothing by themselves; a highlight that lands on one syllable of such a word grows to
 *   cover all of it, exactly as it does for the curated compounds.
 * @returns Computed value
 */
export function getEmphasizedWordIndexes(
  words: string[],
  dataEmphasis?: string[],
  boundPhrases?: string[],
): Set<number> {
  const boundKeys = getEmphasisPhraseKeysForLayout(boundPhrases);
  const marked = getExactVietnameseMark(words, dataEmphasis, boundKeys);
  if (marked) return marked;
  const selected = selectEmphasizedWordIndexes(words, dataEmphasis);
  const phraseKeys = [...getEmphasisPhraseKeysForLayout(dataEmphasis), ...boundKeys];
  return limitShortSentenceEmphasis(
    words,
    boundKeys.length ? expandEmphasisToBoundPhrases(words, selected, phraseKeys) : selected,
    phraseKeys,
  );
}

/**
 * A Vietnamese page's author mark, exactly as written. The compound repair is skipped
 * because it grew marks the author did not choose: it reaches both neighbours of a lone
 * syllable ("gần /hết/ giờ" glowed three syllables), and a join chain spans `=` clitics
 * ("đã=bắt_chuyện"). One growth is still owed: a one-syllable mark that sits INSIDE a
 * word the deck joined with `_` is half a word — the reader sees "ba_lô" as one unit, so
 * the glow covers the whole joined word and never chains past it. A mark of two or more
 * syllables is a whole word as written and never grows.
 * @param words - page tokens
 * @param dataEmphasis - optional upstream annotation phrases
 * @param boundKeys - token keys of the phrases the source text marked as ONE word
 * @returns The first matched mark's indexes, or null when the page is not Vietnamese or
 *   carries no matching mark
 * @pure true
 */
function getExactVietnameseMark(
  words: string[],
  dataEmphasis?: string[],
  boundKeys: readonly (readonly string[])[] = [],
): Set<number> | null {
  if (!isLikelyVietnameseText(words.join(" "))) return null;
  const span = getDataEmphasisWordSpans(words, dataEmphasis)[0];
  if (!span) return null;
  const mark = new Set(Array.from({ length: span.length }, (_, offset) => span.start + offset));
  if (span.length === 1 && boundKeys.length > 0) {
    let container: readonly string[] | null = null;
    let containerStart = 0;
    for (const phrase of boundKeys) {
      if (phrase.length < 2) continue;
      for (let start = 0; start + phrase.length <= words.length; start += 1) {
        if (start > span.start || span.start >= start + phrase.length) continue;
        const keyed = words.slice(start, start + phrase.length).map(getCompoundTokenKey);
        if (phrase.every((key, index) => key === keyed[index])) {
          if (!container || phrase.length > container.length) {
            container = phrase;
            containerStart = start;
          }
          break;
        }
      }
    }
    if (container) {
      for (let offset = 0; offset < container.length; offset += 1)
        mark.add(containerStart + offset);
    }
  }
  return mark;
}

function selectEmphasizedWordIndexes(words: string[], dataEmphasis?: string[]): Set<number> {
  const isVietnameseText = isLikelyVietnameseText(words.join(" "));
  // Upstream annotations are author intent and outrank every heuristic. At most
  // two highlighted words per page: spans come back in annotation priority, so
  // the first two matched phrases win. Vietnamese marks never reach here; they are
  // taken verbatim by getExactVietnameseMark.
  const spans = getDataEmphasisWordSpans(words, dataEmphasis);
  if (spans.length > 0) {
    const chosen = new Set<number>();
    for (const span of spans.slice(0, 2)) {
      for (let offset = 0; offset < span.length; offset += 1) chosen.add(span.start + offset);
    }
    return expandEmphasisToBoundPhrases(
      words,
      chosen,
      getEmphasisPhraseKeysForLayout(dataEmphasis),
    );
  }

  const poeticIndexes = getSpecialPoeticWordIndexes(words);
  if (poeticIndexes.size > 0) return poeticIndexes;

  const candidates = words
    .map((word, index) => ({
      index,
      score: getWordImportance(word, index, words.length),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);

  // Vietnamese spotlights a single word only; English spotlights a single word.
  const desiredCount = 1;
  const selected = candidates.slice(0, desiredCount).map((item) => item.index);
  // Fallback when nothing scores above zero: still give the page its one highlight,
  // but only on a token that renders a real glyph. Never the trailing punctuation or
  // a masked "_____" blank — framing those is exactly the empty-box defect. If the
  // whole page is punctuation/blank, leave it unemphasised.
  if (selected.length === 0) {
    for (let i = words.length - 1; i >= 0; i -= 1) {
      if (/\p{L}|\p{N}/u.test(words[i])) {
        selected.push(i);
        break;
      }
    }
  }
  const expanded = expandEmphasisToBoundPhrases(words, selected);

  if (!isVietnameseText) return keepFirstRuns(expanded, 2);
  // Compound guard: a page with no mark is picked by score, and KineThai's Vietnamese clues
  // rarely join their words with `_`, so without this "công an" would glow only "an". The
  // repair may only finish a pair: past two syllables it is welding unrelated words into a
  // chain ("đầy thương mến"), which readers must never see, so the pick stays as it was.
  const repaired = keepFirstRuns(repairSplitCompoundEmphasis(words, [...expanded]), 1);
  return repaired.size > 2 ? keepFirstRuns(expanded, 1) : repaired;
}

// Feed scoring — includes digit punchline + ALLCAPS bonuses and a wider EMPHASIS_WORDS
// set than KineticText getPreviewWordImportance. Do not unify.
/**
 * Compute wordimportance.
 * @param word - word argument
 * @param index - index argument
 * @param total - total argument
 * @returns Computed value
 */
export function getWordImportance(word: string, index: number, total: number): number {
  const cleaned = word.toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");
  if (!cleaned || STOP_WORDS.has(cleaned)) return 0;

  let score = 0;
  // A standalone number is the punchline of a clue sentence — a count, a
  // quantity, the fact the reader is meant to register. Always let the digits
  // win the emphasis (e.g. "Cả từ gồm 9 chữ cái." highlights the 9, never the
  // trailing noun), so it outscores every other bonus combined.
  if (/^\d+$/.test(cleaned)) score += 12;
  if (EMPHASIS_WORDS.has(cleaned)) score += 4;
  if (cleaned.length >= 8) score += 3;
  else if (cleaned.length >= 6) score += 2;
  if (index === total - 1 && cleaned.length > 3) score += 2;
  if (word === word.toUpperCase() && /[A-Z]/.test(word)) score += 2;
  return score;
}
