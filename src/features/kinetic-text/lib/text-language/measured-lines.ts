/**
 * Line layout for a packed page, Vietnamese or Han, solved from MEASURED widths.
 *
 * The character-count packer in ./page-metrics decides breaks from an estimate (every
 * character 0.58em wide, at the size the page starts at) and never revisits them. A
 * page set in a narrow face, or shrunk afterwards to fit its widest unbreakable phrase,
 * is then left with half-empty lines and a syllable alone on a row it did not need.
 *
 * Here nothing is placed on a line until its real width is known to fit. The caller
 * measures every unbreakable segment as it is actually drawn — typeface, emphasis size,
 * frame padding and all — and this module tries every way of breaking them into lines,
 * works out the largest font each arrangement can be set in without leaving its bounds,
 * and keeps the one that reads best: large type first, then no syllable stranded on a
 * line of its own, then even lines.
 *
 * Phrase edges. A page may also say where its phrases meet: the generator's `|` mark, or
 * the reader's own equivalents — a word that ends in a comma, a full stop or a semicolon.
 * A break is welcome right after an edge, and never one word away from it: a line must not
 * end one word after the mark, nor begin with the one word that carries it. That word
 * would read as cut off from its phrase.
 *
 * Relaxing the rules. Holding a phrase together, or refusing to leave a short word alone on
 * a line, can cost a page most of its size: one long first line is as wide as the box, so
 * the whole page is set at half the size of the page before it, and that jump from page to
 * page is what the reader notices. So every page is also solved with the rules loosened —
 * phrase edges only a preference, a lone short word a mild cost instead of a heavy one, and
 * the block allowed the band's whole height instead of the line budget. When the strict
 * layout would be set under the caller's threshold (`relaxBelow`, a share of the page's
 * full size; the feed keeps one per site) and the loosened one is clearly larger, the
 * loosened one is used. Bonds (`_`, `=`) are never loosened: a
 * page whose widest line is one bonded word is as large as it can be (`widestUnbreakable`).
 *
 * Syllable cap. A Vietnamese page passes `maxLineSyllables` (VIETNAMESE_MAX_LINE_SYLLABLES):
 * no line of either pass holds more syllables than that, unless it is one bonded segment,
 * which cannot be split. The estimate packer in ./page-metrics keeps the same cap.
 *
 * Exports: MeasuredSegment, MeasuredLineBounds, MeasuredLines, MeasuredLineOptions,
 *          MeasuredFontBound, MAX_MEASURED_SEGMENTS, getPunctuationPhraseEdges, isBreakOneWordFromEdge, solveMeasuredLines
 * Depends on: ./page-metrics getVietnameseLineIndentEm, ./types
 */

import { countSegmentSyllables, getVietnameseLineIndentEm } from "./page-metrics";
import type { WordLine, WordSegment } from "./types";
import { endsWithPunctuation } from "./closing-punctuation";

/** One unbreakable segment and the size it is drawn at, in em of the page font. */
export type MeasuredSegment = {
  segment: WordSegment;
  widthEm: number;
  heightEm: number;
};

/** The box the lines have to stay inside, and the sizes the page may be set in. */
export type MeasuredLineBounds = {
  /** Room one line has, its indent included, in px. */
  lineWidthPx: number;
  /** Tallest the whole block may physically be, in px. */
  hardHeightPx: number;
  /** Vertical room the caller budgets for the block, in px… */
  budgetHeightPx: number;
  /** …counted at this many em per line. */
  budgetLineEm: number;
  /** Largest font the page may be set in, px. */
  maxFontPx: number;
  /**
   * Legibility floor, px. The height BUDGET gives way to it (a page is not shrunk under
   * this size just to stay inside the budget); the hard width and height never do.
   */
  floorFontPx: number;
  /** Gap between two segments on a line, em. */
  gapEm: number;
  /** Extra space above every line but the first, em. */
  lineGapEm: number;
};

/** What set a page's font size: the line width, the band's height, the line budget, or a cap. */
export type MeasuredFontBound = "max" | "width" | "height" | "budget" | "floor";

export type MeasuredLines = {
  lines: WordLine[];
  fontPx: number;
  /** What set `fontPx`. */
  bound: MeasuredFontBound;
  /** The size the page gets with the phrase rule and line budget held. */
  strictFontPx: number;
  /** The size it gets with the rules loosened (see `relaxBelow`). */
  relaxedFontPx: number;
  /** Whether the loosened layout was used. */
  relaxed: boolean;
  /**
   * The widest line is a single unbreakable segment (a bonded or highlighted word): no
   * line rule is what holds the page small.
   */
  widestUnbreakable: boolean;
};

/** Loosening has to buy at least this much size to be worth its stranded word or split phrase. */
const MIN_RELAX_GAIN = 1.05;
/** A lone scrap of a word, when the rules are loosened: a mild cost instead of a third. */
const LOOSE_LONE_SCRAP_FACTOR = 0.9;

/** What the page says about its own structure, beyond its measured segments. */
export type MeasuredLineOptions = {
  /**
   * Word indices (into the page's tokens) at which a phrase begins. Omitted or empty, the
   * page is not phrased and lays out exactly as it would without this option.
   */
  phraseEdges?: readonly number[];
  /**
   * Treat a break one word from an edge as a preference, not a rule. For Han text, which
   * breaks anywhere in print: its one wide token, a masked blank beside a comma, would
   * otherwise have to share a line with the words before it and size the whole page.
   */
  softPhraseEdges?: boolean;
  /**
   * Loosen the line rules when holding them would set the page under this share of its
   * full size. The caller chooses it (the feed keeps one per site). Omitted or 0: never
   * loosened.
   */
  relaxBelow?: number;
  /**
   * Most syllables one line may hold (VIETNAMESE_MAX_LINE_SYLLABLES for a Vietnamese
   * page). A hard rule in both passes, never loosened; a single bonded segment longer than
   * this still stands whole on its own line. Omitted: no cap.
   */
  maxLineSyllables?: number;
};

/** Solver internals that only the loosened pass changes. */
type SolveTuning = { loneScrapFactor: number };

/**
 * Every arrangement is tried, so the work doubles with each segment. A Vietnamese page
 * is paginated to about ten words; past this many segments the caller keeps the
 * estimate-packed lines instead.
 */
export const MAX_MEASURED_SEGMENTS = 15;

/**
 * What a line holding one lone word costs, as the share of the font size the layout
 * keeps when it accepts one. The cost follows how the line LOOKS, not how the word is
 * spelt: a word that spans most of the widest line is a short line like any other and
 * costs almost nothing, while a scrap under a third of that width is the stranded
 * syllable this layout exists to avoid — worth setting the whole page about a third
 * smaller to be rid of. Measured, so it holds for any script.
 */
const LONE_FULL_SHARE = 0.62;
const LONE_SCRAP_SHARE = 0.3;
const LONE_FULL_FACTOR = 0.96;
const LONE_SCRAP_FACTOR = 0.68;
/** How much uneven lines count against an arrangement — a tie-breaker, not a driver. */
const RAGGED_WEIGHT = 0.1;
/**
 * A page with more than this many syllables, crammed onto too few lines, is set small enough
 * to strain the eye. It is then spread wider — but only when the wider break reads at strictly
 * larger type, which is the case the score alone can get wrong: a clean 3-line cram with no
 * stranded word can outscore a 4-line one that is genuinely bigger to read.
 */
const LONG_PAGE_SYLLABLES = 9;
/** The fewest lines such a long page is spread to, whenever spreading costs nothing in size. */
const LONG_PAGE_MIN_LINES = 4;
/**
 * Past this many syllables a page may NOT be set on two lines.
 *
 * Unlike the spread above, this is a floor rather than a preference. Two lines holding
 * eight syllables are two long lines, and a long line is set small because its WIDTH is
 * what binds — so that page arrives noticeably smaller than its neighbours, and the type
 * size jumps from scene to scene. Keeping the page on three lines keeps the lines short
 * enough to be set at a size the rest of the deck is also set at.
 *
 * "Chương reo inh ỏi, vươn vai ngồi dậy" is the case this was written for: eight
 * syllables that the score was happy to cram onto two.
 */
const TWO_LINE_MAX_SYLLABLES = 6;
/** What such a page is set on instead. */
const CROWDED_PAGE_MIN_LINES = 3;
/**
 * A break one word away from a phrase edge. The rule says "never"; the layout keeps one
 * escape for a page that cannot be set any other way, so such a break is only taken when
 * every arrangement without one would have to be set at less than about half the size.
 */
const PHRASE_SPLIT_FACTOR = 0.45;
/** The same break on a page whose edges are only a preference (softPhraseEdges). */
const SOFT_PHRASE_SPLIT_FACTOR = 0.92;
/** Any other break inside a phrase, against one on an edge: an edge wins close calls. */
const INSIDE_PHRASE_FACTOR = 0.98;
/**
 * A word that ends a phrase: it carries a comma, full stop, semicolon, question mark,
 * exclamation mark or ellipsis — perhaps inside closing quotes.
 *
 * The three sentence-final marks were missing for a long time, and `?` was even asserted
 * not to count. That is backwards: a question mark closes a phrase more definitely than a
 * comma does. Without them a line could end one word past a sentence — "Bạn có nghe /
 * không? Tôi / ngồi đây" drags the next sentence's first word back onto this one — which
 * is the poaching failure this rule exists to forbid.
 *
 * A colon is deliberately NOT here. A Vietnamese colon introduces what follows and stays
 * glued to it ("Nhỏ thôi: …"); paginate.ts excludes it from page breaks for the same reason.
 * The full-width marks are the same marks in a Han sentence, and its enumeration comma.
 */
const PHRASE_END = endsWithPunctuation("[,.;?!\u2026，。；？！、]");
const HAS_GLYPH = /\p{L}|\p{N}/u;

/**
 * The phrase edges a page's own punctuation makes — the reader's equivalents of `|`. A
 * word that ends in a comma, full stop, semicolon, question mark, exclamation mark or
 * ellipsis closes its phrase; the next one starts after it. A mark inside a word or number
 * ("1.000") is not at its end and makes no edge, and the end of the page is not an edge.
 * @param words - the page's tokens
 * @returns Word indices at which a phrase begins, ascending
 * @pure true
 */
export function getPunctuationPhraseEdges(words: readonly string[]): number[] {
  const edges: number[] = [];
  for (let index = 0; index < words.length - 1; index += 1) {
    if (PHRASE_END.test(words[index]!)) edges.push(index + 1);
  }
  return edges;
}

/**
 * Whether a break before token `at` is one word away from a phrase edge, counting each
 * token that draws a letter or digit as a word — for callers that break between single
 * tokens, such as pages. The measured layout counts unbreakable segments instead.
 * @param words - the tokens being broken
 * @param edges - word indices at which a phrase begins
 * @param at - the token the break would come before
 * @returns True when the break would leave one word between it and an edge
 * @pure true
 */
export function isBreakOneWordFromEdge(
  words: readonly string[],
  edges: readonly number[],
  at: number,
): boolean {
  if (edges.includes(at)) return false;
  const between = (from: number, to: number) => {
    let total = 0;
    for (let index = from; index < to; index += 1)
      if (HAS_GLYPH.test(words[index] ?? "")) total += 1;
    return total;
  };
  return edges.some((edge) => (at < edge ? between(at, edge) <= 1 : between(edge, at) === 1));
}

/**
 * What each possible break costs under the phrase rule: one factor per gap between two
 * segments, 1 for an unphrased page.
 *
 * A word, here, is a segment that draws something: a joined word, a bonded pair or a
 * single syllable each count once, and a mark standing on its own counts not at all. A
 * break is one word away from an edge when exactly one word lies between them — or, before
 * the edge, none, which would open the next line with the mark itself.
 */
function getBreakFactors(
  segments: readonly MeasuredSegment[],
  phraseEdges: readonly number[] | undefined,
  softPhraseEdges: boolean | undefined,
): number[] {
  const count = segments.length;
  const factors = new Array<number>(Math.max(0, count - 1)).fill(1);
  if (!phraseEdges?.length || count < 2) return factors;
  const starts = segments.map(({ segment }) => segment.words[0]!.index);
  const drawn = segments.map(({ segment }) =>
    segment.words.some((word) => HAS_GLYPH.test(word.text)) ? 1 : 0,
  );
  const first = starts[0]!;
  const end = segments[count - 1]!.segment.words.at(-1)!.index + 1;
  const edges = [...new Set(phraseEdges)].filter((edge) => edge > first && edge < end);
  if (!edges.length) return factors;
  // Words drawn between two word indices, whichever way round they come.
  const wordsBetween = (from: number, to: number) =>
    starts.reduce(
      (total, start, index) => (start >= from && start < to ? total + drawn[index]! : total),
      0,
    );
  for (let gap = 0; gap < count - 1; gap += 1) {
    const at = starts[gap + 1]!;
    if (edges.includes(at)) continue;
    const tooClose = edges.some((edge) =>
      at < edge ? wordsBetween(at, edge) <= 1 : wordsBetween(edge, at) === 1,
    );
    const splitFactor = softPhraseEdges ? SOFT_PHRASE_SPLIT_FACTOR : PHRASE_SPLIT_FACTOR;
    factors[gap] = tooClose ? splitFactor : INSIDE_PHRASE_FACTOR;
  }
  return factors;
}

function loneWordFactor(share: number, scrapFactor: number): number {
  const scrap = Math.min(
    1,
    Math.max(0, (LONE_FULL_SHARE - share) / (LONE_FULL_SHARE - LONE_SCRAP_SHARE)),
  );
  const full = Math.max(LONE_FULL_FACTOR, scrapFactor);
  return full - (full - scrapFactor) * scrap;
}

/**
 * Choose line breaks and a font size for measured segments.
 *
 * The page is solved twice: once holding the line rules and the line budget, once with
 * them loosened. The strict layout stands unless it would be set under `relaxBelow` of the
 * page's full size and the loosened one is clearly larger.
 * @param segments - the page's unbreakable segments in reading order, with measured sizes
 * @param bounds - the box and the font sizes allowed
 * @param options - the page's phrase edges, when it has any, and the relax threshold
 * @returns The best arrangement and the font it fits at, both sizes, and which was used;
 *   null when there is nothing to solve (no segments, too many to try, or no room
 *   measured yet)
 * @pure true
 */
export function solveMeasuredLines(
  segments: readonly MeasuredSegment[],
  bounds: MeasuredLineBounds,
  options: MeasuredLineOptions = {},
): MeasuredLines | null {
  const strict = solveArrangement(segments, bounds, options, {
    loneScrapFactor: LONE_SCRAP_FACTOR,
  });
  if (!strict) return null;
  // Loosened: an edge is only a preference, a lone short word a mild cost, and the block
  // may take the band's whole height (the hard bound still holds) rather than the budget.
  const relaxed = solveArrangement(
    segments,
    bounds.hardHeightPx > 0 ? { ...bounds, budgetHeightPx: Number.POSITIVE_INFINITY } : bounds,
    { ...options, softPhraseEdges: true },
    { loneScrapFactor: LOOSE_LONE_SCRAP_FACTOR },
  );
  const relaxBelow = options.relaxBelow ?? 0;
  const useRelaxed =
    !!relaxed &&
    relaxBelow > 0 &&
    strict.fontPx < relaxBelow * bounds.maxFontPx &&
    relaxed.fontPx >= strict.fontPx * MIN_RELAX_GAIN;
  const chosen = useRelaxed ? relaxed : strict;
  return {
    ...chosen,
    strictFontPx: strict.fontPx,
    relaxedFontPx: relaxed?.fontPx ?? strict.fontPx,
    relaxed: useRelaxed,
  };
}

/** One solve under one set of rules. @pure true */
function solveArrangement(
  segments: readonly MeasuredSegment[],
  bounds: MeasuredLineBounds,
  options: MeasuredLineOptions,
  tuning: SolveTuning,
): {
  lines: WordLine[];
  fontPx: number;
  bound: MeasuredFontBound;
  widestUnbreakable: boolean;
} | null {
  const count = segments.length;
  if (count === 0 || count > MAX_MEASURED_SEGMENTS) return null;
  if (!(bounds.lineWidthPx > 0) || !(bounds.maxFontPx > 0)) return null;
  if (segments.some((item) => !(item.widthEm > 0))) return null;

  const floorPx = Math.min(bounds.maxFontPx, bounds.floorFontPx);
  const maxSyllables = options.maxLineSyllables ?? Number.POSITIVE_INFINITY;
  const syllableCounts = segments.map(({ segment }) => countSegmentSyllables(segment));
  // Widths of the lines that hold one lone word, refilled for every arrangement.
  const loneWidths: number[] = [];
  const breakFactors = getBreakFactors(segments, options.phraseEdges, options.softPhraseEdges);
  // A long page may be worth spreading even where the score would rather cram it. Count the
  // syllables across every segment — a bound phrase is two, a lone token is one.
  const syllables = segments.reduce((total, { segment }) => total + segment.words.length, 0);
  const minLines = syllables > LONG_PAGE_SYLLABLES ? LONG_PAGE_MIN_LINES : 0;
  // The floor is a bar, not a weight: an arrangement below it does not compete. A page
  // with too few segments to reach it is exempt, because no arrangement of three segments
  // makes four lines and refusing them all would leave the page unset.
  const floorLines =
    syllables > TWO_LINE_MAX_SYLLABLES && count >= CROWDED_PAGE_MIN_LINES
      ? CROWDED_PAGE_MIN_LINES
      : 0;

  type Candidate = {
    mask: number;
    fontPx: number;
    score: number;
    lines: number;
    edgeSplit: boolean;
    bound: MeasuredFontBound;
  };
  let best: Candidate | null = null;
  /** The best arrangement ignoring the floor, for a page that cannot satisfy it. */
  let fallback: Candidate | null = null;
  // Every arrangement that reaches the minimum line count. The pick among them waits
  // until the winner's size is known: the top-scoring spread can itself be smaller than
  // a clean cram it lost to, and choosing only among the spreads that read LARGER keeps
  // a bigger 4-line layout from being vetoed by a smaller one.
  const spreads: Candidate[] = [];
  // Bit i set = the line breaks after segment i.
  const arrangements = 1 << (count - 1);
  for (let mask = 0; mask < arrangements; mask += 1) {
    let lineIndex = 0;
    let lineWidth = 0;
    let lineHeight = 0;
    let lineSegments = 0;
    let widest = 0;
    let widthSum = 0;
    let blockHeight = 0;
    let phrasing = 1;
    let edgeSplit = false;
    let lineSyllables = 0;
    let overSyllableCap = false;
    loneWidths.length = 0;
    for (let index = 0; index < count; index += 1) {
      const item = segments[index]!;
      lineWidth += (lineSegments > 0 ? bounds.gapEm : 0) + item.widthEm;
      lineHeight = Math.max(lineHeight, item.heightEm);
      lineSegments += 1;
      lineSyllables += syllableCounts[index]!;
      const last = index === count - 1;
      if (!last && !(mask & (1 << index))) continue;
      // The line is closed. Its reach includes the stagger, which is what has to fit.
      if (lineSegments > 1 && lineSyllables > maxSyllables) overSyllableCap = true;
      const reach = lineWidth + getVietnameseLineIndentEm(lineIndex);
      widest = Math.max(widest, reach);
      widthSum += reach;
      blockHeight += lineHeight + (lineIndex > 0 ? bounds.lineGapEm : 0);
      // A segment of several words is a whole phrase on its line, not a stranded word.
      if (lineSegments === 1 && item.segment.words.length === 1) loneWidths.push(lineWidth);
      if (!last) {
        const factor = breakFactors[index]!;
        phrasing *= factor;
        // A break one word from a phrase edge — the rule the phrase policy guards, as
        // distinct from the 0.98 tie-breaker for any other break inside a phrase.
        if (factor === PHRASE_SPLIT_FACTOR) edgeSplit = true;
      }
      lineIndex += 1;
      lineWidth = 0;
      lineHeight = 0;
      lineSegments = 0;
      lineSyllables = 0;
    }
    // A line over the syllable cap is not an arrangement at all — unless it is one bonded
    // segment, which cannot be split and so stands on its own line.
    if (overSyllableCap) continue;
    const lines = lineIndex;
    let penalty = phrasing;
    // A page that is one word on one line is not a stranded word; it is the page.
    if (lines > 1)
      for (const width of loneWidths)
        penalty *= loneWordFactor(width / widest, tuning.loneScrapFactor);

    // Verified bounds: no line wider than its room, the block no taller than the band.
    const widthFont = bounds.lineWidthPx / widest;
    const hardHeightFont = bounds.hardHeightPx > 0 ? bounds.hardHeightPx / blockHeight : Infinity;
    const budgetFont = bounds.budgetHeightPx / (lines * bounds.budgetLineEm);
    const budgetOrFloor = Math.max(budgetFont, floorPx);
    const fontPx = Math.min(bounds.maxFontPx, widthFont, hardHeightFont, budgetOrFloor);
    const bound: MeasuredFontBound =
      fontPx === widthFont
        ? "width"
        : fontPx === hardHeightFont
          ? "height"
          : fontPx === bounds.maxFontPx
            ? "max"
            : budgetFont >= floorPx
              ? "budget"
              : "floor";
    const ragged = 1 - widthSum / lines / widest;
    const score = fontPx * penalty * (1 - RAGGED_WEIGHT * ragged);
    const candidate = { mask, fontPx, score, lines, edgeSplit, bound };
    // Kept whatever the floor says, so a page that cannot reach the floor still has a
    // layout to fall back to rather than none at all.
    if (
      !fallback ||
      score > fallback.score + 1e-9 ||
      (Math.abs(score - fallback.score) <= 1e-9 && lines < fallback.lines)
    ) {
      fallback = candidate;
    }
    // Below the floor the arrangement is not considered at all — that is what makes this
    // a cap rather than one more thing the score can outvote.
    if (lines < floorLines) continue;
    // On an exact tie the arrangement with fewer lines stands, then the earlier one, so
    // the same page always breaks the same way.
    if (
      !best ||
      score > best.score + 1e-9 ||
      (Math.abs(score - best.score) <= 1e-9 && lines < best.lines)
    ) {
      best = candidate;
    }
    // Gather every layout that spreads the long page to `minLines`; the winner is picked
    // after the loop, once it is known which of them read larger than the score winner.
    if (minLines > 0 && lines >= minLines) spreads.push(candidate);
  }
  // Only when nothing at or above the floor could be set does the floor give way, so a
  // page is never left unrendered by it.
  if (!best) best = fallback;
  if (!best) return null;
  // Spread the long page only when a layout at `minLines` or more reads at strictly larger
  // type than the score winner; among those, the score — phrase edges and stranded
  // syllables included — still decides. If the winner already meets the minimum line
  // count, or no spread keeps the size, the winner stands.
  let chosen = best;
  for (const candidate of spreads) {
    // A spread that splits a phrase one word from its edge pays the same admission the
    // score contest charges it: it only displaces the winner by a margin the phrase
    // factor gives back, not by any size at all. Soft preferences cost nothing here.
    const size = candidate.fontPx * (candidate.edgeSplit ? PHRASE_SPLIT_FACTOR : 1);
    if (size <= best.fontPx + 1e-9) continue;
    if (
      chosen === best ||
      candidate.score > chosen.score + 1e-9 ||
      (Math.abs(candidate.score - chosen.score) <= 1e-9 && candidate.lines < chosen.lines)
    ) {
      chosen = candidate;
    }
  }

  const lines: WordLine[] = [];
  let current: WordSegment[] = [];
  let lineReach = 0;
  let widestReach = 0;
  let widestUnbreakable = false;
  segments.forEach(({ segment, widthEm }, index) => {
    lineReach += (current.length ? bounds.gapEm : 0) + widthEm;
    current.push(segment);
    if (index === count - 1 || chosen.mask & (1 << index)) {
      const reach = lineReach + getVietnameseLineIndentEm(lines.length);
      if (reach > widestReach) {
        widestReach = reach;
        widestUnbreakable = current.length === 1;
      }
      lines.push({ indentEm: getVietnameseLineIndentEm(lines.length), segments: current });
      current = [];
      lineReach = 0;
    }
  });
  return { lines, fontPx: chosen.fontPx, bound: chosen.bound, widestUnbreakable };
}
