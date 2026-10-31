/**
 * The gate every clue page's highlight passes before it may glow.
 *
 * A clue page glows exactly one word, and that word must be two syllables the deck itself
 * connected with `_` or `=`. Everything else is refused: a lone syllable, a pair the deck
 * left apart, and three syllables even when joined. A page holding no such word stays
 * dark rather than glowing a guess, so the fix for a dark page is in the deck.
 *
 * Both connectors reach this file as one no-break space (see ./word-joiner), so a
 * "connected group" is a whole chain: `đã=bắt_chuyện` arrives as three connected
 * syllables with nothing to say where the word sits, and only an author's mark can pick
 * the word out of it.
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
 * First syllables that lean on what follows: `của=mình`, `con=mèo`, `rất=đẹp`. They pass
 * the gate, because a `=` pair may glow, but any other word on the page glows first.
 */
const LEANING_HEADS = new Set([
  "bị",
  "cái",
  "các",
  "cho",
  "chiếc",
  "con",
  "có",
  "cũng",
  "của",
  "cuốn",
  "đã",
  "đang",
  "để",
  "được",
  "là",
  "mà",
  "một",
  "những",
  "rất",
  "sẽ",
  "thì",
  "trong",
  "với",
  "không",
]);

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
 * @returns The chosen word in a one-item list, or an empty list when the page has no
 *   word that passes. An empty list is an answer: nothing on this page glows.
 * @pure true
 */
export function gateHighlight(
  text: string,
  marks: readonly string[] | undefined,
  joinedWords: readonly string[] | undefined,
): string[] {
  const page = getWords(text).map(getCompoundTokenKey);
  const chains = getEmphasisPhraseKeysForLayout([...(joinedWords ?? [])]).filter(
    (chain) =>
      indexOfKeys(page, chain) >= 0 && !chain.some((syllable) => CONJUNCTIONS.has(syllable)),
  );
  const candidates = chains.filter((chain) => chain.length === HIGHLIGHT_SYLLABLES);

  for (const mark of getEmphasisPhraseKeysForLayout([...(marks ?? [])])) {
    if (indexOfKeys(page, mark) < 0) continue;
    if (mark.length === 1) {
      // A mark on half a connected word means the whole word.
      const whole = candidates.find((chain) => chain.includes(mark[0]!));
      if (whole) return [whole.join(" ")];
    } else if (
      mark.length === HIGHLIGHT_SYLLABLES &&
      chains.some((chain) => indexOfKeys(chain, mark) >= 0)
    ) {
      // Connected on the page, possibly inside a longer chain: `đã=/bắt_chuyện/`.
      return [mark.join(" ")];
    }
  }

  const leans = (chain: readonly string[]) => LEANING_HEADS.has(chain[0]!);
  const letters = (chain: readonly string[]) => chain.join("").length;
  const [best] = [...candidates].sort(
    (left, right) =>
      Number(leans(left)) - Number(leans(right)) ||
      letters(right) - letters(left) ||
      indexOfKeys(page, left) - indexOfKeys(page, right),
  );
  return best ? [best.join(" ")] : [];
}
