/**
 * The word joiner: how deck text says "these syllables are ONE word".
 *
 * Vietnamese is written syllable by syllable with a space between each, so "ba lô"
 * (a backpack) looks the same as two unrelated words and a line may break in the middle
 * of it. Deck text therefore joins the syllables of a single word with an underscore —
 * `ba_lô`, `quan_trọng` — the convention Vietnamese word segmenters already use, visible
 * to a reviewer and easy for a generator to write. Words stay separated by spaces.
 *
 * The underscore never reaches a reader. When a catalog is loaded it is turned into the
 * two characters Unicode provides for exactly this: a NO-BREAK SPACE between spaced
 * syllables and a WORD JOINER between glyphs of an unspaced script. Prose then keeps the
 * word on one line with no code at all — a browser will not break at either — and the
 * kinetic stages read the same characters back as phrases that must stay whole.
 *
 * Exports: WORD_JOINER_MARK, CLITIC_BIND_MARK, PHRASE_BREAK_MARK, encodeWordJoiners,
 *          stripWordJoiners, splitWordJoiners, splitPhrases, countJoinedUnits,
 *          withWordJoiners
 * Depends on: ./schema (types only)
 */
import type { Catalog, VocabularyWord } from "./schema";

/** What an author or a generator writes between two syllables of one word. */
export const WORD_JOINER_MARK = "_";
/**
 * What binds a clitic to its host: two words that must share a line but are NOT
 * one word. A classifier and its noun ("con=mèo"), a function word and what it
 * leans on ("đã=đi"). It breaks like a word joiner and differs only in what a
 * highlight may cover, which is decided upstream where emphasis is chosen.
 */
export const CLITIC_BIND_MARK = "=";
/**
 * What marks a phrase edge: the place a line or page SHOULD break, and by
 * implication the places beside it that it should not. Stripped for now, so it
 * never reaches a reader; `splitPhrases` exposes the edges for a packer that
 * can honour them.
 */
export const PHRASE_BREAK_MARK = "|";
const NO_BREAK_SPACE = "\u00A0";
const WORD_JOINER = "\u2060";

const HAN = /\p{Script=Han}/u;
// One underscore with a letter or digit on both sides. A run of underscores is the
// answer blank ("____") and never matches: its neighbours are underscores, not letters.
const AUTHORED_JOIN = /([\p{L}\p{N}\p{M}])[_=](?=([\p{L}\p{N}]))/gu;
// A phrase edge, with whatever space the author left around it.
const AUTHORED_PHRASE = /\s*\|\s*/gu;
// Spaced scripts: whitespace-delimited tokens chained by no-break spaces.
const SPACED_RUN = /[^\s\u2060]+(?:\u00A0[^\s\u2060]+)+/gu;
// Unspaced scripts: single glyphs chained by word joiners.
const GLYPH_RUN = /\p{Script=Han}(?:\u2060\p{Script=Han})+/gu;

/**
 * Turn authored joins into the characters a reader's text carries.
 * @param text - deck text, possibly with `_` between the syllables of a word
 * @returns The same text with each join as a no-break space (or a word joiner between
 *   two Han glyphs). Text without joins, or already encoded, comes back unchanged.
 * @pure true
 */
export function encodeWordJoiners(text: string): string {
  if (!/[_=|]/.test(text)) return text;
  // The phrase mark leaves the text here: it says where a break is welcome, not
  // that one is forbidden, so there is no character to stand in for it. A
  // packer that honours phrase edges reads them from `splitPhrases` instead.
  const bonded = text.replace(AUTHORED_JOIN, (_match, before: string, after: string) =>
    HAN.test(before) && HAN.test(after) ? `${before}${WORD_JOINER}` : `${before}${NO_BREAK_SPACE}`,
  );
  return bonded.replace(AUTHORED_PHRASE, " ").trim();
}

/**
 * The phrases of a text, in order, as plain readable strings.
 *
 * A break is welcome at a phrase edge and unwelcome beside one: a line or page
 * must not carry only a single syllable across an edge in either direction. The
 * edges are exposed here so a packer can apply that rule; nothing consumes them
 * yet, and until something does the mark is simply stripped.
 *
 * @param text - deck text in either form
 * @returns one entry per phrase, joins removed; a text with no phrase mark is one phrase
 * @pure true
 */
export function splitPhrases(text: string): string[] {
  return text
    .split(PHRASE_BREAK_MARK)
    .map((part) => stripWordJoiners(part).trim())
    .filter((part) => part.length > 0);
}

/**
 * Drop every join, authored or encoded, leaving ordinary text.
 * @param text - deck text in either form
 * @returns Text with plain spaces between syllables and nothing between glyphs
 * @pure true
 */
export function stripWordJoiners(text: string): string {
  return encodeWordJoiners(text).replaceAll(NO_BREAK_SPACE, " ").replaceAll(WORD_JOINER, "");
}

/**
 * Read the joins out of a text: the plain text a kinetic page tokenizes, and the
 * phrases whose words must never be separated.
 * @param text - deck text in either form
 * @returns `text` with joins removed, and each joined word once, written with plain
 *   spaces ("ba lô") or as adjacent glyphs ("诚实")
 * @pure true
 */
export function splitWordJoiners(text: string): { text: string; bound: string[] } {
  const encoded = encodeWordJoiners(text);
  if (!encoded.includes(NO_BREAK_SPACE) && !encoded.includes(WORD_JOINER)) {
    return { text: encoded, bound: [] };
  }
  const bound = new Set<string>();
  for (const match of encoded.matchAll(SPACED_RUN)) {
    bound.add(match[0].replaceAll(NO_BREAK_SPACE, " ").replaceAll(WORD_JOINER, ""));
  }
  for (const match of encoded.matchAll(GLYPH_RUN)) {
    bound.add(match[0].replaceAll(WORD_JOINER, ""));
  }
  return { text: stripWordJoiners(encoded), bound: [...bound] };
}

/**
 * Count the syllables (or space-separated units) in a text, joined or not — the unit
 * every "N words" length rule for a card field is written in.
 * @param text - deck text in either form
 * @returns Number of units
 * @pure true
 */
export function countJoinedUnits(text: string): number {
  return stripWordJoiners(text).split(/\s+/).filter(Boolean).length;
}

/** The grammar notes written in Vietnamese; every other grammar value is target-language. */
function encodeGrammar(grammar: VocabularyWord["grammar"]): VocabularyWord["grammar"] {
  if (!grammar) return grammar;
  const tipVi = grammar.tipVi && encodeWordJoiners(grammar.tipVi);
  const serEstar = grammar.serEstar && encodeWordJoiners(grammar.serEstar);
  const collocations = grammar.collocations?.map((item) =>
    item.vi && encodeWordJoiners(item.vi) !== item.vi
      ? { ...item, vi: encodeWordJoiners(item.vi) }
      : item,
  );
  const changed =
    tipVi !== grammar.tipVi ||
    serEstar !== grammar.serEstar ||
    !!collocations?.some((item, index) => item !== grammar.collocations![index]);
  return changed ? { ...grammar, tipVi, serEstar, collocations } : grammar;
}

function encodeWord(word: VocabularyWord): VocabularyWord {
  const usage = word.usage.map((example) => {
    const en = encodeWordJoiners(example.en);
    const vi = encodeWordJoiners(example.vi);
    return en === example.en && vi === example.vi ? example : { ...example, en, vi };
  });
  const usageChanged = usage.some((example, index) => example !== word.usage[index]);
  // Highlight phrases are matched token by token against joined-out text, so they are
  // stored plain.
  const emphasis = word.emphasis?.map(stripWordJoiners);
  const emphasisChanged = !!emphasis?.some((phrase, index) => phrase !== word.emphasis![index]);
  // A gloss is usually one compound word and so is where a join matters most: "tò_mò"
  // must reach a reader as one unbreakable token, never wrapped across two lines.
  //
  // Guarded rather than passed straight in: this runs on decks CAST to Catalog, not
  // parsed through the schema (catalog-source.ts), so a deck authored without the field
  // really does arrive undefined here. Left undefined rather than coerced to "", so the
  // word keeps the shape it was written with.
  const meaningVi = word.meaningVi ? encodeWordJoiners(word.meaningVi) : word.meaningVi;
  const defVi = encodeWordJoiners(word.defVi);
  const leadVi = encodeWordJoiners(word.leadVi);
  const anticipateVi = encodeWordJoiners(word.anticipateVi);
  const grammar = encodeGrammar(word.grammar);
  if (
    meaningVi === word.meaningVi &&
    defVi === word.defVi &&
    leadVi === word.leadVi &&
    anticipateVi === word.anticipateVi &&
    !usageChanged &&
    !emphasisChanged &&
    grammar === word.grammar
  ) {
    return word;
  }
  return {
    ...word,
    meaningVi,
    defVi,
    leadVi,
    anticipateVi,
    usage: usageChanged ? usage : word.usage,
    emphasis: emphasisChanged ? emphasis : word.emphasis,
    grammar,
  };
}

/**
 * Prepare a compiled catalog for readers: every authored join becomes the character a
 * browser already refuses to break at. Stored decks keep the visible underscore; this
 * runs once, where a catalog enters the app.
 * @param catalog - a compiled catalog
 * @returns The catalog with reader-ready text (the same object when it has no joins)
 * @pure true
 */
export function withWordJoiners(catalog: Catalog): Catalog {
  const words = catalog.words.map(encodeWord);
  return words.some((word, index) => word !== catalog.words[index])
    ? { ...catalog, words }
    : catalog;
}
