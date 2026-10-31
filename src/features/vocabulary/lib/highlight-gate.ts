/**
 * The gate every clue page's highlight passes before it may glow.
 *
 * Only an author's `/…/` mark can glow, because a mark is the one place a deck says "this
 * is a word". A join alone does not: `_` also just forbids a line break between syllables,
 * so nothing here ever picks a highlight from the joins. A mark passes when it is exactly
 * two syllables connected with `_` or `=` on this page. Everything else is refused: a lone
 * syllable, a pair the deck left apart, and three syllables even when joined. A page with
 * no passing mark stays dark rather than glowing a guess, so the fix is a mark in the deck.
 *
 * Both connectors reach this file as one no-break space (see ./word-joiner), so a
 * "connected group" is a whole chain: `đã=/bắt_chuyện/` arrives as three connected
 * syllables, and the mark is what picks the word out of it.
 *
 * Exports: gateHighlight
 * Depends on: features/kinetic-text (tokenizing and phrase keys)
 */
import {
  getCompoundTokenKey,
  getEmphasisPhraseKeysForLayout,
  getWords,
} from "@/features/kinetic-text";

/** A highlight is exactly this many syllables. */
const HIGHLIGHT_SYLLABLES = 2;

/** Never inside a highlight, even connected: it would read as two things chained. */
const CONJUNCTIONS = new Set(["và", "hoặc", "nhưng"]);

/**
 * Where a key sequence starts inside a longer one.
 * @pure true
 */
function indexOfKeys(haystack: readonly string[], needle: readonly string[]): number {
  for (let start = 0; start + needle.length <= haystack.length; start += 1) {
    if (needle.every((key, offset) => haystack[start + offset] === key)) return start;
  }
  return -1;
}

/**
 * Pick the one word a clue page may glow.
 * @param text - the page's plain text
 * @param marks - the field's author marks, in priority order
 * @param joinedWords - the field's connected groups, written with plain spaces
 * @returns The first passing mark in a one-item list, or an empty list when none passes.
 *   An empty list is an answer: nothing on this page glows.
 * @pure true
 */
export function gateHighlight(
  text: string,
  marks: readonly string[] | undefined,
  joinedWords: readonly string[] | undefined,
): string[] {
  const page = getWords(text).map(getCompoundTokenKey);
  const chains = getEmphasisPhraseKeysForLayout([...(joinedWords ?? [])]);
  const passing = getEmphasisPhraseKeysForLayout([...(marks ?? [])]).find(
    (mark) =>
      mark.length === HIGHLIGHT_SYLLABLES &&
      !mark.some((syllable) => CONJUNCTIONS.has(syllable)) &&
      indexOfKeys(page, mark) >= 0 &&
      chains.some((chain) => indexOfKeys(chain, mark) >= 0),
  );
  return passing ? [passing.join(" ")] : [];
}
