/**
 * Han (Chinese) kinetic line helpers: script detection and per-glyph tokenization.
 *
 * Chinese writes words without spaces, so whitespace tokenizing leaves a whole sample
 * sentence as ONE unbreakable "word" — it renders on a single shrunken line. These
 * helpers split Han text into per-character tokens (punctuation glued to its neighbour
 * so no line ever opens with it), which the Vietnamese line packer then staggers across
 * many short indented lines with the same font size and block fill.
 *
 * A glyph is the unit of animation but not of reading, so getHanWordSpans finds the words
 * the glyphs make, for the layout to keep whole.
 *
 * Exports: isLikelyChineseText, getHanTokens, isHanToken, getHanWordSpans
 * Depends on: none (leaf module)
 */

const HAN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー]/u;
const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
/** The join a deck's `_` becomes between glyphs (see vocabulary word-joiner); not part of a word. */
const WORD_JOINER = /\u2060/gu;

/**
 * Tokenizer alternation, in priority order: one Han character (every glyph is its own
 * token), a run of letters/digits/underscores (a Latin word or a masked "_____" blank
 * stays whole), or a run of punctuation (attached to a neighbour by getHanTokens).
 */
const HAN_TOKEN_RUNS = /_{2,}|[\p{Script=Han}]|[\p{L}\p{N}_]+|[^\p{L}\p{N}_\s]+/gu;

/** Opening quotes/brackets introduce what follows, so they glue to the NEXT token. */
const OPENING_PUNCTUATION = /^[‘“〝（［｛〈《「『【〔]/u;

/**
 * True when the text is written mostly in Han characters. Counted per glyph, not per
 * whitespace token: a Chinese sentence arrives as a single token. Latin letters are the
 * counterweight, so Vietnamese (zero Han) and English never trigger, while a Han sentence
 * with a sprinkling of Latin or a masked blank still does.
 * @param text - text argument
 * @returns true when Han glyphs dominate the letters
 * @pure true
 */
export function isLikelyChineseText(text: string): boolean {
  let han = 0;
  let otherLetters = 0;
  for (const char of Array.from(text)) {
    if (HAN.test(char)) han += 1;
    else if (/\p{L}/u.test(char)) otherLetters += 1;
  }
  // Two glyphs minimum: a lone "水" inside an otherwise Latin page (a gloss, a label)
  // must not flip the whole page onto the packed-line renderer.
  return han >= 2 && han > otherLetters;
}

/**
 * Split Han text into animation/layout tokens: one token per character, with Latin
 * runs and blanks kept whole. Punctuation never stands alone and never opens a line —
 * a closing mark ("，" "。") joins the token before it, an opening mark the token after.
 * The Vietnamese packer then measures these tokens exactly like syllables.
 * @param text - Han-dominant page text
 * @returns Ordered token strings whose visible characters reconstruct the text
 * @pure true
 */
export function getHanTokens(text: string): string[] {
  const tokens: string[] = [];
  let pendingPrefix = "";

  for (const run of text.match(HAN_TOKEN_RUNS) ?? []) {
    if (HAN.test(run) || /[\p{L}\p{N}_]/u.test(run)) {
      tokens.push(pendingPrefix + run);
      pendingPrefix = "";
      continue;
    }
    if (OPENING_PUNCTUATION.test(run)) {
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
 * True when the token begins with a Han character. Used by the line packer to detect
 * adjacent Han tokens that may form a 2-character word and should be kept on the same
 * line when possible. Punctuation-only tokens return false (they glue to a neighbour).
 * @param token - one token from getHanTokens
 * @returns true when the first codepoint is a Han glyph
 * @pure true
 */
export function isHanToken(token: string): boolean {
  const first = token.charAt(0);
  return first ? HAN.test(first) : false;
}

/**
 * The runs of tokens that make one word, found by the platform's dictionary segmenter.
 * Without them every glyph is its own unbreakable piece, which lets a line end inside a
 * word and makes a sentence too many pieces for the measured layout to arrange.
 * @param tokens - getHanTokens output for the page
 * @returns Each word of two or more glyphs, as its tokens; empty where the platform has
 *   no segmenter, which leaves the page breaking between any two glyphs
 * @pure true
 */
export function getHanWordSpans(tokens: readonly string[]): string[][] {
  if (typeof Intl.Segmenter === "undefined") return [];
  const clean = tokens.map((token) => token.replace(WORD_JOINER, ""));
  const text = clean.join("");
  const language = KANA.test(text) ? "ja" : "zh";
  const segmenter = new Intl.Segmenter(language, { granularity: "word" });
  // Where each token starts in the joined text, so a word can be mapped back onto tokens.
  const starts: number[] = [];
  let offset = 0;
  for (const token of clean) {
    starts.push(offset);
    offset += token.length;
  }
  const spans: string[][] = [];
  for (const { segment, index, isWordLike } of segmenter.segment(text)) {
    if (!isWordLike) continue;
    const end = index + segment.length;
    const first = starts.indexOf(index);
    // The word has to begin on a token and cover at least two; a token runs past the
    // end of a word only by the punctuation riding on it.
    const inside = starts.filter((start) => start >= index && start < end).length;
    if (first < 0 || inside < 2) continue;
    const span = tokens.slice(first, first + inside);
    if (span.every(isHanToken)) spans.push(span);
  }
  return spans;
}
