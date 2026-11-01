/**
 * The Japanese deck format: `_`, `=` and `|` as authored for a script with no spaces.
 *
 * Japanese is written without word spaces, so the deck's ASCII spaces separate 文節
 * (bunsetsu) for tokenising only. `_` joins a lexical unit, `=` binds a dependent
 * grammatical 文節 to its host, and `|` ends a chunk (the pause / reveal unit). The
 * reader draws 文節 flush: spaces, `_` and `=` are display-only marks and never reach a
 * line, while `|` becomes the phrase edge the layout prefers to break on.
 *
 * Exports: JapanesePage, stripJapaneseMarks, parseJapaneseMarkup, paginateJapaneseChunks
 * Depends on: kinetic-text getJapaneseMoraTokens, JAPANESE_LONG_PAGE_MORAE
 */
import { getJapaneseMoraTokens, JAPANESE_LONG_PAGE_MORAE } from "@/features/kinetic-text";

/** One page's display tokens plus the phrase edges (token indexes where a chunk begins). */
export type JapanesePage = {
  text: string;
  phraseEdges: number[];
};

/**
 * Marks that never reach a reader: ASCII/full-width space, the two separators that
 * still sit inside a token in the data, the alignment characters the word-joiner
 * encoder may have substituted, and the chunk pipe itself.
 */
const DISPLAY_MARKS = /[\s\u00A0\u2060_=|]+/gu;
/** `_` / `=` inside one 文節: the mark is invisible, the units are drawn flush. The
 *  no-break space and word joiner are what the catalog encoder makes of them when a
 *  deck stored its Japanese in a base field, so they are joins here too. */
const INNER_MARKS = /[_=\u00A0\u2060]/gu;
/** Token separators are authored spaces only. A no-break space is a join, not a gap. */
const TOKEN_BREAK = /[\u0020\u3000\t\n\r\f]+/u;

/**
 * The prose form of a Japanese field: no spaces, no `_`, `=`, `|`.
 * @param text - deck text carrying Japanese marks
 * @returns The string a reader should see
 * @pure true
 */
export function stripJapaneseMarks(text: string): string {
  return text.replace(DISPLAY_MARKS, "");
}

/**
 * Read a Japanese clue into display tokens and chunk edges.
 *
 * Each ASCII-space-separated unit is one 文節. Removing `_`/`=` joins the anchored
 * 文節 into the same token, so the packer can never split them. A `|` closes a chunk;
 * the token that starts the next chunk is an edge for the measured line solver.
 *
 * @param text - Japanese clue text, marks included
 * @returns Space-joined display tokens (the tokeniser input), the chunks, and edges
 * @pure true
 */
export function parseJapaneseMarkup(text: string): {
  text: string;
  chunks: string[][];
  phraseEdges: number[];
} {
  const chunks: string[][] = [];
  for (const part of text.split("|")) {
    const tokens = part
      .trim()
      .split(TOKEN_BREAK)
      .map((token) => token.replace(INNER_MARKS, ""))
      .filter((token) => token.length > 0);
    if (tokens.length > 0) chunks.push(tokens);
  }

  const phraseEdges: number[] = [];
  let total = 0;
  for (const chunk of chunks) {
    if (total > 0) phraseEdges.push(total);
    total += chunk.length;
  }

  return {
    text: chunks.flat().join(" "),
    chunks,
    phraseEdges,
  };
}

/** A side shorter than this reads as an orphan, so such a split is not worth making. */
const MIN_SPLIT_MORAE = 6;
/** A 文節 ending here closes a clause, so a chunk may be split after it as a last resort. */
const CLAUSE_END = /[、。！？!?…」』）]$/u;

type Cut = [head: string[][], tail: string[][]];

function countMorae(chunks: readonly (readonly string[])[]): number {
  return getJapaneseMoraTokens(chunks.flat().join(" ")).length;
}

/** Every break between two authored chunks. */
function chunkCuts(page: readonly string[][]): Cut[] {
  return page.slice(1).map((_, index) => [page.slice(0, index + 1), page.slice(index + 1)]);
}

/** Every break after a clause-ending 文節 inside a chunk. */
function clauseCuts(page: readonly string[][]): Cut[] {
  return page.flatMap((chunk, at) =>
    chunk.slice(0, -1).flatMap((token, index): Cut[] =>
      CLAUSE_END.test(token)
        ? [
            [
              [...page.slice(0, at), chunk.slice(0, index + 1)],
              [chunk.slice(index + 1), ...page.slice(at + 1)],
            ],
          ]
        : [],
    ),
  );
}

/** @returns The cut leaving the two sides most even, or null when every cut orphans one. */
function balancedCut(cuts: readonly Cut[]): Cut | null {
  let best: Cut | null = null;
  let bestGap = Number.POSITIVE_INFINITY;
  for (const cut of cuts) {
    const [head, tail] = [countMorae(cut[0]), countMorae(cut[1])];
    if (Math.min(head, tail) < MIN_SPLIT_MORAE || Math.abs(head - tail) >= bestGap) continue;
    best = cut;
    bestGap = Math.abs(head - tail);
  }
  return best;
}

/**
 * Split a page too long for one screen, at the phrase break that leaves the two sides most
 * even by what there is to read, then the same again for a side still too long. Authored
 * chunks are tried first, then clause ends. A page with neither stays whole.
 */
function splitLongPage(page: readonly string[][]): string[][][] {
  if (countMorae(page) < JAPANESE_LONG_PAGE_MORAE) return [[...page]];
  const cut = balancedCut(chunkCuts(page)) ?? balancedCut(clauseCuts(page));
  return cut ? cut.flatMap(splitLongPage) : [[...page]];
}

/**
 * Turn chunks into pages without ever cutting a chunk at a place the deck did not mark.
 *
 * A field shorter than twice the page budget keeps one page, matching the rest of the
 * reader; past that, chunks are grouped greedily. Either way a page with too much to read
 * is then split in two (see splitLongPage), because the budget counts 文節, and a line of
 * eight 文節 can hold thirty characters.
 *
 * @param chunks - display tokens grouped by authored chunk
 * @param tokenLimit - soft tokens per page
 * @returns Pages with their own token-indexed phrase edges
 * @pure true
 */
export function paginateJapaneseChunks(
  chunks: readonly (readonly string[])[],
  tokenLimit: number,
): JapanesePage[] {
  const totalTokens = chunks.reduce((total, chunk) => total + chunk.length, 0);
  if (chunks.length <= 1 || totalTokens <= tokenLimit * 2) {
    return splitLongPage(chunks.map((chunk) => [...chunk])).map(toPage);
  }

  const pages: string[][][] = [];
  let current: string[][] = [];
  let currentTokens = 0;
  for (const chunk of chunks) {
    if (current.length > 0 && currentTokens + chunk.length > tokenLimit) {
      pages.push(current);
      current = [];
      currentTokens = 0;
    }
    current.push([...chunk]);
    currentTokens += chunk.length;
  }
  if (current.length > 0) pages.push(current);

  // Anti-orphan: a short overflow page is pulled back into its predecessor, exactly as
  // the reader's other paginators do. The chunk budget is soft; a whole phrase is not.
  while (pages.length > 1 && countTokens(pages[pages.length - 1]!) < 3) {
    const tail = pages.pop()!;
    pages[pages.length - 1]!.push(...tail);
  }

  return pages.flatMap(splitLongPage).map(toPage);
}

function countTokens(chunks: readonly (readonly string[])[]): number {
  return chunks.reduce((total, chunk) => total + chunk.length, 0);
}

function toPage(chunks: readonly (readonly string[])[]): JapanesePage {
  const phraseEdges: number[] = [];
  let total = 0;
  for (const chunk of chunks) {
    if (total > 0) phraseEdges.push(total);
    total += chunk.length;
  }
  return { text: chunks.flat().join(" "), phraseEdges };
}
