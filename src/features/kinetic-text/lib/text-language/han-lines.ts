/**
 * Han (Chinese) kinetic line helpers: script detection and per-glyph tokenization.
 *
 * Chinese writes words without spaces, so whitespace tokenizing leaves a whole sample
 * sentence as ONE unbreakable "word" — it renders on a single shrunken line. These
 * helpers split Han text into per-character tokens (punctuation glued to its neighbour
 * so no line ever opens with it), which the Vietnamese line packer then staggers across
 * many short indented lines with the same font size and block fill.
 *
 * Exports: isLikelyChineseText, getHanTokens, isHanToken
 * Depends on: none (leaf module)
 */

const HAN = /\p{Script=Han}/u;

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
