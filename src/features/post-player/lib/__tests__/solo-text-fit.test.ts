import { describe, expect, it } from "vitest";
import {
  SOLO_REVEAL_MAX_STRETCH,
  SOLO_REVEAL_TARGET_WIDTH_FRACTION,
  SOLO_REVEAL_VISUAL_GUARD,
  clampNumber,
  estimateSoloRevealFit,
  estimateWordWidth,
  getSoloRevealFit,
} from "../solo-text-fit";

const FONT = "sans";
const WEIGHT = 700;

describe("solo reveal constants", () => {
  it("guards the visual scale at 1.14", () => expect(SOLO_REVEAL_VISUAL_GUARD).toBe(1.14));
  it("targets 85% of the canvas width", () =>
    expect(SOLO_REVEAL_TARGET_WIDTH_FRACTION).toBe(0.85));
  it("caps the stretch at 1.7", () => expect(SOLO_REVEAL_MAX_STRETCH).toBe(1.7));
});

describe("clampNumber", () => {
  it("passes a value inside the range through", () => expect(clampNumber(5, 0, 10)).toBe(5));
  it("raises a value below the minimum", () => expect(clampNumber(-5, 0, 10)).toBe(0));
  it("lowers a value above the maximum", () => expect(clampNumber(15, 0, 10)).toBe(10));
  it("returns the min when it equals the value", () => expect(clampNumber(0, 0, 10)).toBe(0));
  it("returns the max when it equals the value", () => expect(clampNumber(10, 0, 10)).toBe(10));
  it("collapses to a single point when min equals max", () =>
    expect(clampNumber(99, 5, 5)).toBe(5));
  it("handles negative ranges", () => expect(clampNumber(-3, -10, -1)).toBe(-3));
});

describe("estimateWordWidth", () => {
  it("returns zero for an empty word", () => expect(estimateWordWidth("", 100, FONT, WEIGHT)).toBe(0));
  it("returns zero for a whitespace-only word", () =>
    expect(estimateWordWidth("   ", 100, FONT, WEIGHT)).toBe(0));
  it("estimates from the average glyph advance without a DOM", () =>
    expect(estimateWordWidth("Dawn", 100, FONT, WEIGHT)).toBeCloseTo(4 * 100 * 0.62, 5));
  it("trims surrounding whitespace before measuring", () =>
    expect(estimateWordWidth("  ab  ", 100, FONT, WEIGHT)).toBeCloseTo(2 * 100 * 0.62, 5));
  it("scales linearly with the font size", () =>
    expect(estimateWordWidth("abc", 100, FONT, WEIGHT)).toBeCloseTo(
      2 * estimateWordWidth("abc", 50, FONT, WEIGHT),
      5,
    ));
  it("grows with the character count", () =>
    expect(estimateWordWidth("abcdef", 40, FONT, WEIGHT)).toBeGreaterThan(
      estimateWordWidth("abc", 40, FONT, WEIGHT),
    ));
  it("is deterministic", () =>
    expect(estimateWordWidth("word", 64, FONT, WEIGHT)).toBe(
      estimateWordWidth("word", 64, FONT, WEIGHT),
    ));
});

describe("estimateSoloRevealFit", () => {
  it("returns 1 when the estimated width collapses to zero", () =>
    expect(estimateSoloRevealFit("", 0, 400, 1.14, FONT, WEIGHT, 1)).toBe(1));
  it("returns 1 for a non-positive canvas width", () =>
    expect(estimateSoloRevealFit("Dawn", 100, 0, 1.14, FONT, WEIGHT, 1)).toBe(1));
  it("solves a hero word to roughly the target fraction", () =>
    expect(estimateSoloRevealFit("Dawn", 100, 400, 1.14, FONT, WEIGHT, 1)).toBeCloseTo(0.9093, 3));
  it("never exceeds the maximum stretch", () =>
    expect(estimateSoloRevealFit("A", 10, 100000, 1.14, FONT, WEIGHT, 1)).toBe(SOLO_REVEAL_MAX_STRETCH));
  it("floors a visual guard below the built-in guard", () =>
    expect(estimateSoloRevealFit("Dawn", 100, 400, 1.0, FONT, WEIGHT, 1)).toBeCloseTo(
      estimateSoloRevealFit("Dawn", 100, 400, SOLO_REVEAL_VISUAL_GUARD, FONT, WEIGHT, 1),
      6,
    ));
  it("shrinks the fit for a larger visual guard", () =>
    expect(estimateSoloRevealFit("Dawn", 100, 400, 2, FONT, WEIGHT, 1)).toBeLessThan(
      estimateSoloRevealFit("Dawn", 100, 400, 1.14, FONT, WEIGHT, 1),
    ));
  it("shrinks the fit when the word is emphasised", () =>
    expect(estimateSoloRevealFit("Dawn", 100, 400, 1.14, FONT, WEIGHT, 2)).toBeLessThan(
      estimateSoloRevealFit("Dawn", 100, 400, 1.14, FONT, WEIGHT, 1),
    ));
  it("gives a longer word a smaller fit on the same canvas", () =>
    expect(estimateSoloRevealFit("Persistence", 100, 400, 1.14, FONT, WEIGHT, 1)).toBeLessThan(
      estimateSoloRevealFit("Dawn", 100, 400, 1.14, FONT, WEIGHT, 1),
    ));
  it("returns a positive number", () =>
    expect(estimateSoloRevealFit("Hello", 80, 360, 1.14, FONT, WEIGHT, 1)).toBeGreaterThan(0));
});

describe("getSoloRevealFit", () => {
  it("shrinks a word that overflows its box", () =>
    expect(getSoloRevealFit(1, 100, 100, 100, 100)).toBeCloseTo(100 / 114, 4));
  it("clamps to the maximum stretch on a huge box", () =>
    expect(getSoloRevealFit(1, 100, 100, 1000, 1000)).toBe(SOLO_REVEAL_MAX_STRETCH));
  it("treats a zero measured width as one", () =>
    expect(getSoloRevealFit(1, 0, 0, 100, 100)).toBe(SOLO_REVEAL_MAX_STRETCH));
  it("lets the tighter axis win when width and height differ", () =>
    expect(getSoloRevealFit(1, 100, 200, 200, 200)).toBeCloseTo(200 / 228, 4));
  it("scales with the current fit", () =>
    expect(getSoloRevealFit(0.5, 100, 100, 100, 100)).toBeCloseTo(0.5 * (100 / 114), 4));
  it("never exceeds the maximum stretch", () => {
    for (let index = 0; index < 20; index += 1)
      expect(getSoloRevealFit(index, 50, 50, 5000, 5000)).toBeLessThanOrEqual(
        SOLO_REVEAL_MAX_STRETCH,
      );
  });
  it("honours a larger explicit guard", () =>
    expect(getSoloRevealFit(1, 400, 400, 400, 400, 2)).toBeLessThan(
      getSoloRevealFit(1, 400, 400, 400, 400, 1.14),
    ));
  it("returns a positive number", () =>
    expect(getSoloRevealFit(1, 120, 90, 300, 240)).toBeGreaterThan(0));
});
