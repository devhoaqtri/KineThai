/**
 * Measured line layout for a packed page: measure what was drawn, then break.
 *
 * In development every settled page also announces its size as a bubbling
 * `kinetic:page-font` DOM event (PAGE_FONT_EVENT), which the feed log records; production
 * builds send nothing. `npx tsx scripts/report-page-fonts.ts` reads those records.
 *
 * Exports: MeasuredLayoutBudget, PAGE_FONT_EVENT, PageFontDetail, useMeasuredLines
 * Depends on: kinetic-text solveMeasuredLines / getWidestLineWidth, playback-timing safe insets
 */

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import {
  MAX_MEASURED_SEGMENTS,
  getWidestLineWidth,
  solveMeasuredLines,
  type MeasuredFontBound,
  type MeasuredSegment,
  type WordLine,
} from "@/features/kinetic-text";
import { MIN_FONT_SIZE, getTextSafeInsets } from "../lib/playback-timing";

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Share of the text box a line may fill: the line element keeps 2% clear on its right. */
const LINE_BOX_SHARE = 0.98;
/**
 * Slack left in every line. Widths are read as whole pixels at one font size and
 * scaled to another, so a line solved to the last pixel could land a pixel over.
 */
const LINE_FIT_MARGIN = 0.985;
/** Gap between segments on a line and extra space above each later line (see WordSequenceLines). */
const SEGMENT_GAP_EM = 0.24;
const LINE_GAP_EM = 0.06;

/** Development builds only: Vite replaces this at build time. */
const ANNOUNCE =
  typeof window !== "undefined" && (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true;

/** The DOM event a settled measured page dispatches from its text element, in development. */
export const PAGE_FONT_EVENT = "kinetic:page-font";

/** What a settled page reports about its size. */
export type PageFontDetail = {
  /** The page's lines, words joined by spaces, lines by " / ". */
  text: string;
  /** The size it was drawn at, px (after the drawn-width check). */
  fontPx: number;
  maxFontPx: number;
  /** Holding the phrase rule and line budget, and loosening them (see measured-lines). */
  strictFontPx: number;
  relaxedFontPx: number;
  relaxed: boolean;
  /** The threshold the page was solved with. */
  relaxBelow: number;
  bound: MeasuredFontBound;
  /** The widest line is one unbreakable word: no line rule holds this page small. */
  widestUnbreakable: boolean;
  lines: number;
  boxWidthPx: number;
  boxHeightPx: number;
};

/** What the caller allows a measured page: its largest font and its vertical budget. */
export type MeasuredLayoutBudget = {
  /** Largest font the page may be set in, px. */
  maxSize: number;
  /** Vertical room budgeted for the text block, px… */
  budgetHeight: number;
  /** …counted at this many em per line. */
  budgetLineEm: number;
  /**
   * Loosen the line rules when the strict layout would be set under this share of
   * `maxSize` (the feed keeps one per site). Omitted or 0: never loosened.
   */
  relaxBelow?: number;
  /**
   * The band's own margins, replacing getTextSafeInsets' 72px / 132px. Those leave room for
   * the feed's chrome inside the band; a band that already stops short of every piece of
   * chrome (the TikTok lab's 4:5 frame) passes smaller ones so its text can fill it.
   * Omitted everywhere else, so the feed is unchanged.
   */
  safeInsets?: { top: number; bottom: number };
};

type Solution = {
  signature: string;
  lines: WordLine[];
  fontSize: number;
  /** Diagnostics for the development announcement. */
  report: Omit<PageFontDetail, "text" | "fontPx" | "lines">;
  /** Set once the drawn result has been checked against the box. */
  checked: boolean;
};

/**
 * A segment's own box, to a fraction of a pixel. Layout sizes are whole pixels, which at
 * display sizes is a one-percent error — enough to tip two near-equal arrangements either
 * way from one measurement to the next. The fractional box is used unless an ancestor's
 * transform has scaled it, in which case the layout size is the honest one.
 */
function measureBox(node: HTMLElement): { width: number; height: number } {
  const rect = node.getBoundingClientRect();
  const scaled =
    Math.abs(rect.width - node.offsetWidth) > 1 || Math.abs(rect.height - node.offsetHeight) > 1;
  return scaled
    ? { width: node.offsetWidth, height: node.offsetHeight }
    : { width: rect.width, height: rect.height };
}

/** Font sizes are held to a tenth of a pixel so two passes over the same page agree. */
function settle(fontPx: number): number {
  return Math.floor(fontPx * 10) / 10;
}

/**
 * Lay a packed page out from the real width of everything on it.
 *
 * The page is first drawn with the estimate-packed lines it was given. Before that
 * reaches the screen, every unbreakable segment is measured as drawn, the breaks and the
 * font size are solved from those measurements, and the page is drawn again with the
 * result — so no word is ever placed on a line it was not shown to fit. The drawn result
 * is then checked once more against its box and, if anything is over, stepped down.
 *
 * Segment sizes are kept in em and are remeasured only when the words, their styling or
 * the loaded fonts change; a resize re-solves from the sizes already known. Nothing the
 * solver decides is fed back into what it measures, so it cannot chase its own result.
 *
 * @param args.budget - the caller's limits; undefined leaves the page to the estimate
 * @param args.enabled - false for pages this layout does not apply to
 * @param args.lines - the estimate-packed lines; their segments are what gets arranged
 * @param args.signature - changes whenever a segment's drawn size could change
 * @param args.phraseEdges - word indices at which a phrase begins; they change the solve,
 *   not the measurements, so they are not part of the signature
 * @param args.softPhraseEdges - a break one word from an edge is a preference, not a rule
 * @param args.maxLineSyllables - most syllables a line may hold (a Vietnamese page's cap)
 * @param args.lineSpacingScale - the caller's multiplier on the inter-line gap
 * @returns The solved lines and font size, or null while the estimate still stands
 */
export function useMeasuredLines({
  budget,
  enabled,
  lines,
  signature,
  phraseEdges,
  softPhraseEdges,
  maxLineSyllables,
  lineSpacingScale,
  wrapperRef,
  textRef,
}: {
  budget: MeasuredLayoutBudget | undefined;
  enabled: boolean;
  lines: WordLine[];
  signature: string;
  phraseEdges?: readonly number[];
  softPhraseEdges?: boolean;
  maxLineSyllables?: number;
  lineSpacingScale: number;
  wrapperRef: RefObject<HTMLDivElement | null>;
  textRef: RefObject<HTMLDivElement | null>;
}): { lines: WordLine[]; fontSize: number } | null {
  const [solution, setSolution] = useState<Solution | null>(null);
  // Bumped when the box changes size or a typeface finishes loading.
  const [boxRevision, setBoxRevision] = useState(0);
  const [fontRevision, setFontRevision] = useState(0);
  const measured = useRef<{
    signature: string;
    fontRevision: number;
    sizes: Map<string, { widthEm: number; heightEm: number }>;
  } | null>(null);
  const active = enabled && !!budget;
  const maxSize = budget?.maxSize ?? 0;
  const budgetHeight = budget?.budgetHeight ?? 0;
  const budgetLineEm = budget?.budgetLineEm ?? 1;
  const relaxBelow = budget?.relaxBelow ?? 0;
  const insetTop = budget?.safeInsets?.top;
  const insetBottom = budget?.safeInsets?.bottom;
  const insetsFor = (bandHeight: number) =>
    insetTop !== undefined && insetBottom !== undefined
      ? { top: insetTop, bottom: insetBottom }
      : getTextSafeInsets(bandHeight);

  useIsomorphicLayoutEffect(() => {
    if (!active) return;
    const wrapper = wrapperRef.current;
    const band = wrapper?.parentElement?.parentElement;
    if (!wrapper || !band) return;
    const resized = () => setBoxRevision((revision) => revision + 1);
    const observer = new ResizeObserver(resized);
    observer.observe(wrapper);
    observer.observe(band);
    let disposed = false;
    const fontsChanged = () => {
      if (!disposed) setFontRevision((revision) => revision + 1);
    };
    const fonts = wrapper.ownerDocument.fonts;
    void fonts.ready.then(fontsChanged);
    fonts.addEventListener("loadingdone", fontsChanged);
    return () => {
      disposed = true;
      observer.disconnect();
      fonts.removeEventListener("loadingdone", fontsChanged);
    };
  }, [active, wrapperRef]);

  useIsomorphicLayoutEffect(() => {
    if (!active) {
      setSolution((current) => (current ? null : current));
      return;
    }
    const wrapper = wrapperRef.current;
    const text = textRef.current;
    const band = wrapper?.parentElement?.parentElement;
    if (!wrapper || !text || !band) return;
    const segments = lines.flatMap((line) => line.segments);
    if (segments.length === 0 || segments.length > MAX_MEASURED_SEGMENTS) {
      setSolution((current) => (current ? null : current));
      return;
    }

    // Measure — only when what is drawn could have changed size.
    let sizes = measured.current;
    if (!sizes || sizes.signature !== signature || sizes.fontRevision !== fontRevision) {
      const fontPx = Number.parseFloat(getComputedStyle(text).fontSize);
      if (!(fontPx > 0)) return;
      const next = new Map<string, { widthEm: number; heightEm: number }>();
      for (const node of text.querySelectorAll<HTMLElement>("[data-kinetic-segment]")) {
        const key = node.dataset.kineticSegment;
        if (!key || !(node.offsetWidth > 0)) continue;
        const drawn = measureBox(node);
        next.set(key, { widthEm: drawn.width / fontPx, heightEm: drawn.height / fontPx });
      }
      // Every segment has to be on the page to be weighed; otherwise wait for the pass
      // that draws them all.
      if (segments.some((segment) => !next.has(segment.key))) return;
      sizes = { signature, fontRevision, sizes: next };
      measured.current = sizes;
    }

    // Layout height, like every other length here: a scaled preview (the export studio)
    // must not shrink the band the font is being solved for.
    const bandHeight = band.offsetHeight || band.getBoundingClientRect().height;
    const insets = insetsFor(bandHeight);
    const items: MeasuredSegment[] = segments.map((segment) => ({
      segment,
      ...sizes.sizes.get(segment.key)!,
    }));
    const solved = solveMeasuredLines(
      items,
      {
        lineWidthPx: wrapper.clientWidth * LINE_BOX_SHARE * LINE_FIT_MARGIN,
        // The same band the fit solver keeps a page inside.
        hardHeightPx: Math.max(160, bandHeight - insets.top - insets.bottom) * 0.92,
        budgetHeightPx: budgetHeight,
        budgetLineEm,
        maxFontPx: maxSize,
        floorFontPx: MIN_FONT_SIZE,
        gapEm: SEGMENT_GAP_EM,
        lineGapEm: LINE_GAP_EM * lineSpacingScale,
      },
      { phraseEdges, softPhraseEdges, relaxBelow, maxLineSyllables },
    );
    if (!solved) {
      setSolution((current) => (current ? null : current));
      return;
    }
    const fontSize = settle(solved.fontPx);
    const breaks = solved.lines.map((line) => line.segments.length).join(",");
    setSolution((current) => {
      if (
        current &&
        current.signature === signature &&
        current.lines.map((line) => line.segments.length).join(",") === breaks &&
        // A size already stepped down by the check below stands until the page changes.
        (current.fontSize === fontSize || (current.checked && current.fontSize < fontSize))
      ) {
        return current;
      }
      return {
        signature,
        lines: solved.lines,
        fontSize,
        checked: false,
        report: {
          maxFontPx: maxSize,
          strictFontPx: settle(solved.strictFontPx),
          relaxedFontPx: settle(solved.relaxedFontPx),
          relaxed: solved.relaxed,
          relaxBelow,
          bound: solved.bound,
          widestUnbreakable: solved.widestUnbreakable,
          boxWidthPx: Math.round(wrapper.clientWidth),
          boxHeightPx: Math.round(bandHeight),
        },
      };
    });
  }, [
    active,
    lines,
    signature,
    phraseEdges,
    softPhraseEdges,
    fontRevision,
    boxRevision,
    maxSize,
    budgetHeight,
    budgetLineEm,
    relaxBelow,
    insetTop,
    insetBottom,
    maxLineSyllables,
    lineSpacingScale,
    wrapperRef,
    textRef,
  ]);

  // The proof: read the lines back as drawn. Scaling em sizes is exact on paper and a
  // pixel loose in a browser, so a line found over its box, or a block found taller than
  // the band's safe height, steps the page down — once, and only ever down, so this cannot
  // loop. Height used to go unchecked: the solver's height model ran ~10% short on some
  // pages (213px drawn against a 192px bound on a 540×365 card), and since a measured
  // page skips the fit pass, nothing caught it and the last line sat on the progress bars.
  useIsomorphicLayoutEffect(() => {
    if (!solution || solution.checked || solution.signature !== signature) return;
    const wrapper = wrapperRef.current;
    const text = textRef.current;
    if (!wrapper || !text) return;
    const room = wrapper.clientWidth * LINE_BOX_SHARE;
    const widest = getWidestLineWidth(text);
    // The same safe height the solver was handed, without its 0.92 head start: the layout
    // box of the drawn block (scrollHeight ignores the entrance's transforms).
    const band = wrapper.parentElement?.parentElement;
    const bandHeight = band ? band.offsetHeight || band.getBoundingClientRect().height : 0;
    const insets = insetsFor(bandHeight);
    const roomHeight = Math.max(160, bandHeight - insets.top - insets.bottom);
    const drawnHeight = text.scrollHeight;
    const factor = Math.min(
      widest > room + 0.5 ? room / widest : 1,
      bandHeight > 0 && drawnHeight > roomHeight + 0.5 ? roomHeight / drawnHeight : 1,
    );
    let fontSize = solution.fontSize;
    if (factor < 1) {
      fontSize = settle(solution.fontSize * factor * 0.995);
      setSolution({ ...solution, fontSize, checked: true });
    } else {
      solution.checked = true;
    }
    if (ANNOUNCE) {
      const detail: PageFontDetail = {
        ...solution.report,
        text: solution.lines
          .map((line) =>
            line.segments
              .map((segment) => segment.words.map((word) => word.text).join(" "))
              .join(" "),
          )
          .join(" / "),
        fontPx: fontSize,
        lines: solution.lines.length,
      };
      text.dispatchEvent(new CustomEvent(PAGE_FONT_EVENT, { bubbles: true, detail }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- insetsFor reads only these two
  }, [solution, signature, wrapperRef, textRef, insetTop, insetBottom]);

  if (!active || !solution || solution.signature !== signature) return null;
  return solution;
}
