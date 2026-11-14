/**
 * The word that fills an example's answer blank, cased for where it stands. Decks store
 * the answer in its dictionary form ("wash"), so an example that opens on the blank
 * ("_____ your hands before lunch.") read "wash your hands" in the meaning panel. When
 * the blank starts the sentence, the filled word takes a capital, and the answer chip,
 * an inline mark, grows with it.
 *
 * Exports: opensSentence, caseFill
 * Depends on: nothing
 */

/** Opening quotes and brackets that may stand between a sentence's start and its first word. */
const OPENERS = /[\s"“‘'«([¿¡]+$/u;
/** Punctuation that ends the sentence before it. */
const SENTENCE_END = /[.!?…]$/u;
/** A double quote that opens a quotation, which starts a sentence of its own. */
const QUOTE_OPEN = /["“«]/u;
/** What introduces a quotation: `He said, "…` or `She asked: "…`. */
const QUOTE_LEAD = /[,:]$/u;

/**
 * Whether a word placed right after `before` is the first word of its sentence: nothing
 * but whitespace and opening quotes before it, or those after a full stop, question or
 * exclamation mark, or a double quote opened after a comma or colon.
 * @param before - The example's text up to the blank, already free of /markers/
 * @pure true
 */
export function opensSentence(before: string): boolean {
  const rest = before.replace(OPENERS, "");
  if (rest === "" || SENTENCE_END.test(rest)) return true;
  // A quotation opened after a comma or colon starts its own sentence.
  return QUOTE_LEAD.test(rest) && QUOTE_OPEN.test(before.slice(rest.length));
}

/**
 * The fill as it should read after `before`: first letter capitalized when it opens the
 * sentence, untouched otherwise (an already capitalized noun or name stays as it is, a
 * word with a capital inside like "iPhone" keeps its casing, and a script without case,
 * like Chinese, is unchanged).
 * @param before - The example's text up to the blank
 * @param word - The answer that fills the blank
 * @pure true
 */
export function caseFill(before: string, word: string): string {
  if (!word || !opensSentence(before)) return word;
  const [first, ...rest] = Array.from(word);
  const tail = rest.join("");
  // A word cased on purpose inside ("iPhone", "eBay") keeps its own casing.
  if (tail !== tail.toLowerCase()) return word;
  return first!.toUpperCase() + tail;
}
