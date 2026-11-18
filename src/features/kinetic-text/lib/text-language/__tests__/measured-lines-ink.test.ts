/**
 * Rows are spaced on their baselines, all at one pitch: the largest any pair of neighbours
 * needs, so a highlighted row's accent clears the row above, and every row sits at that same
 * pitch. Ink is measured per segment; without it the rows are stacked as boxes, as before.
 */
import { describe, expect, it } from "vitest";
import {
  INK_CLEARANCE_EM,
  solveMeasuredLines,
  type MeasuredLineBounds,
  type MeasuredSegment,
} from "../measured-lines";

/** A segment's box: 0.95em above its baseline, 0.30em below, 1.25em tall. */
const BOX_ABOVE = 0.95;
const BOX_BELOW = 0.3;
const BOUNDS: MeasuredLineBounds = {
  // Two segments of 1.2em share a line at 96px, so four segments make two rows.
  lineWidthPx: 330,
  hardHeightPx: 600,
  budgetHeightPx: 600,
  budgetLineEm: 1.6,
  maxFontPx: 96,
  floorFontPx: 64,
  gapEm: 0.24,
  lineGapEm: 0.06,
};

const WORDS = ["sang", "chế", "bật", "tối"];

/** Four segments as the feed measures them, with no ink: only their boxes. */
function plain(): MeasuredSegment[] {
  return WORDS.map((text, index) => ({
    segment: { key: `${index}-${text}`, words: [{ text, index }] },
    widthEm: 1.2,
    heightEm: BOX_ABOVE + BOX_BELOW,
  }));
}

/** Four segments as the feed measures them: boxes, plus `ink[i]` above and below each baseline. */
function measured(...ink: { above?: number; below?: number }[]): MeasuredSegment[] {
  return WORDS.map((text, index) => ({
    segment: { key: `${index}-${text}`, words: [{ text, index }] },
    widthEm: 1.2,
    heightEm: BOX_ABOVE + BOX_BELOW,
    boxAboveEm: BOX_ABOVE,
    boxBelowEm: BOX_BELOW,
    inkAboveEm: ink[index]?.above ?? 0,
    inkBelowEm: ink[index]?.below ?? 0,
  }));
}

function maxInk(items: MeasuredSegment[], key: string, side: "above" | "below"): number {
  const item = items.find((segment) => segment.segment.key === key)!;
  return (side === "above" ? item.inkAboveEm : item.inkBelowEm) ?? 0;
}

describe("rows spaced on their baselines", () => {
  it("keeps the plain minimum between boxes when no ink is measured", () => {
    const solved = solveMeasuredLines(plain(), BOUNDS)!;
    expect(solved.lines).toHaveLength(2);
    expect(solved.rowMarginsEm).toEqual([0, BOUNDS.lineGapEm]);
    expect(solved.pitchEm).toBe(0);
  });

  it("opens the pitch so a highlighted row's accent clears the row above", () => {
    // Row 0 ("sang chế") has a dot 0.4em below its baseline; row 1 ("bật tối") has the
    // highlighted "bật" with an accent 1.0em above. Their ink needs a pitch of 1.46em.
    const items = measured({ below: 0.4 }, {}, { above: 1.0 }, {});
    const solved = solveMeasuredLines(items, BOUNDS)!;
    expect(solved.lines).toHaveLength(2);
    expect(solved.pitchEm).toBeCloseTo(0.4 + 1.0 + INK_CLEARANCE_EM, 6);
    // The margin is what the pitch leaves once both boxes are taken off.
    expect(solved.rowMarginsEm[1]).toBeCloseTo(solved.pitchEm - BOX_BELOW - BOX_ABOVE, 6);
    // The two rows' ink is then at least the clearance apart.
    expect(solved.pitchEm - 0.4 - 1.0).toBeGreaterThanOrEqual(INK_CLEARANCE_EM - 1e-9);
  });

  it("never sets a margin under the plain minimum between boxes", () => {
    const items = measured({ above: 0.2 }, { above: 0.2 }, { below: 0.1 }, { below: 0.1 });
    const solved = solveMeasuredLines(items, BOUNDS)!;
    expect(solved.rowMarginsEm[1]!).toBeGreaterThanOrEqual(BOUNDS.lineGapEm - 1e-9);
  });

  it("sets the font so the ink-based block fits the height it is given", () => {
    const tall = measured({ above: 1.1 }, { above: 1.1 }, { below: 0.5 }, { below: 0.5 });
    // Tight enough that the height, not the width, sets the size of this page.
    const bounds = { ...BOUNDS, hardHeightPx: 90 };
    const solved = solveMeasuredLines(tall, bounds)!;
    expect(solved.bound).toBe("height");
    expect(solved.fontPx).toBeLessThan(BOUNDS.maxFontPx);
    // Ink from the top of the first row to the bottom of the last, in px at the chosen size.
    const rows = solved.lines.length;
    const above = Math.max(
      ...solved.lines[0]!.segments.map((segment) => maxInk(tall, segment.key, "above")),
    );
    const below = Math.max(
      ...solved.lines.at(-1)!.segments.map((segment) => maxInk(tall, segment.key, "below")),
    );
    const block = (above + below + (rows - 1) * solved.pitchEm) * solved.fontPx;
    expect(block).toBeLessThanOrEqual(bounds.hardHeightPx + 1e-6);
    // Being em-based, the same page solved again lands on the same size and rows.
    const again = solveMeasuredLines(tall, bounds)!;
    expect(again.fontPx).toBe(solved.fontPx);
    expect(again.rowMarginsEm).toEqual(solved.rowMarginsEm);
  });
});
