import { describe, expect, it } from "vitest";
import {
  SPELLING_FIT_GUARD,
  SPELLING_HOLD_SECONDS,
  SPELLING_NOMINAL_FONT_SIZE,
  SPELLING_REDUCED_MOTION_MS,
  SPELLING_SETTLE_SECONDS,
  SPELLING_STAGGER,
  SPELLING_VARIANTS,
  getSpellingDurationMs,
  getSpellingFitFontSize,
  pickSpellingVariant,
  type SpellingVariant,
} from "../spelling";

describe("variant catalogue", () => {
  it("ships exactly eight letter animations", () => expect(SPELLING_VARIANTS).toHaveLength(8));
  it("lists the designed variants in order", () =>
    expect(SPELLING_VARIANTS).toEqual([
      "bounce",
      "drop",
      "spin",
      "scatter",
      "wave",
      "flip",
      "elastic",
      "slide",
    ]));
  it("has no duplicate variants", () =>
    expect(new Set(SPELLING_VARIANTS).size).toBe(SPELLING_VARIANTS.length));
  it("gives every variant a positive stagger", () => {
    for (const variant of SPELLING_VARIANTS) expect(SPELLING_STAGGER[variant]).toBeGreaterThan(0);
  });
  it("keeps every stagger under a second", () => {
    for (const variant of SPELLING_VARIANTS) expect(SPELLING_STAGGER[variant]).toBeLessThan(1);
  });
  it("wave is the fastest variant", () => {
    const fastest = Math.min(...Object.values(SPELLING_STAGGER));
    expect(SPELLING_STAGGER.wave).toBe(fastest);
  });
  it("spin is the slowest variant", () => {
    const slowest = Math.max(...Object.values(SPELLING_STAGGER));
    expect(SPELLING_STAGGER.spin).toBe(slowest);
  });
  it("holds the spelled word for three seconds", () => expect(SPELLING_HOLD_SECONDS).toBe(3));
  it("lets the last letter settle for one second", () => expect(SPELLING_SETTLE_SECONDS).toBe(1));
});

describe("pickSpellingVariant", () => {
  it("returns one of the eight variants", () =>
    expect(SPELLING_VARIANTS).toContain(pickSpellingVariant("agree")));
  it("is deterministic for the same seed", () =>
    expect(pickSpellingVariant("backpack")).toBe(pickSpellingVariant("backpack")));
  it("handles the empty seed", () => expect(SPELLING_VARIANTS).toContain(pickSpellingVariant("")));
  it("spreads different seeds across several variants", () => {
    const picked = new Set(
      Array.from({ length: 40 }, (_, index) => pickSpellingVariant(`seed-${index}`)),
    );
    expect(picked.size).toBeGreaterThan(2);
  });
  it("handles non-ASCII seeds", () =>
    expect(SPELLING_VARIANTS).toContain(pickSpellingVariant("诚实")));
});

describe("getSpellingDurationMs", () => {
  it("gives reduced motion a flat three seconds regardless of the word", () => {
    expect(getSpellingDurationMs("a", "spin", true)).toBe(SPELLING_REDUCED_MOTION_MS);
    expect(getSpellingDurationMs("antidisestablishment", "spin", true)).toBe(
      SPELLING_REDUCED_MOTION_MS,
    );
  });
  it("counts letters, stagger, settle and hold", () => {
    // "balo" = 4 letters, wave stagger 0.3 → (4*0.3 + 1 + 3) s
    expect(getSpellingDurationMs("balo", "wave", false)).toBe(
      Math.round(
        (4 * SPELLING_STAGGER.wave + SPELLING_SETTLE_SECONDS + SPELLING_HOLD_SECONDS) * 1000,
      ),
    );
  });
  it("always lands above the hold plus settle floor", () => {
    for (const variant of SPELLING_VARIANTS) {
      expect(getSpellingDurationMs("x", variant, false)).toBeGreaterThan(4000);
    }
  });
  it("keeps surrogate pairs as one letter", () => {
    // "𠀋𠀋" is two code points but four UTF-16 units; Array.from counts two.
    const duration = getSpellingDurationMs("𠀋𠀋", "wave", false);
    expect(duration).toBe(
      Math.round(
        (2 * SPELLING_STAGGER.wave + SPELLING_SETTLE_SECONDS + SPELLING_HOLD_SECONDS) * 1000,
      ),
    );
  });
  it("grows monotonically with word length", () => {
    const short = getSpellingDurationMs("cat", "bounce", false);
    const long = getSpellingDurationMs("elephant", "bounce", false);
    expect(long).toBeGreaterThan(short);
  });
  it("is slowest on the slowest variant", () => {
    const spin = getSpellingDurationMs("agree", "spin", false);
    const wave = getSpellingDurationMs("agree", "wave", false);
    expect(spin).toBeGreaterThan(wave);
  });
  it("returns an integer", () =>
    expect(Number.isInteger(getSpellingDurationMs("word", "drop", false))).toBe(true));
});

describe("getSpellingFitFontSize", () => {
  it("never scales above the nominal size", () =>
    expect(getSpellingFitFontSize(100, 10_000)).toBe(SPELLING_NOMINAL_FONT_SIZE));
  it("keeps the nominal size when the row already fits", () =>
    expect(getSpellingFitFontSize(300, 300)).toBe(SPELLING_NOMINAL_FONT_SIZE));
  it("scales down proportionally for a long answer", () =>
    expect(getSpellingFitFontSize(1920, 960)).toBe(SPELLING_NOMINAL_FONT_SIZE / 2));
  it("falls back to nominal for a zero natural width", () =>
    expect(getSpellingFitFontSize(0, 500)).toBe(SPELLING_NOMINAL_FONT_SIZE));
  it("falls back to nominal for a zero available width", () =>
    expect(getSpellingFitFontSize(500, 0)).toBe(SPELLING_NOMINAL_FONT_SIZE));
  it("falls back to nominal for negative inputs", () => {
    expect(getSpellingFitFontSize(-10, 500)).toBe(SPELLING_NOMINAL_FONT_SIZE);
    expect(getSpellingFitFontSize(500, -10)).toBe(SPELLING_NOMINAL_FONT_SIZE);
  });
  it("falls back to nominal for NaN", () =>
    expect(getSpellingFitFontSize(Number.NaN, 500)).toBe(SPELLING_NOMINAL_FONT_SIZE));
  it("has no lower clamp: a very long word shrinks very small", () =>
    expect(getSpellingFitFontSize(96_000, 96)).toBeLessThan(1));
  it("the fit guard keeps overshoot inside the safe area", () =>
    expect(SPELLING_FIT_GUARD).toBeLessThan(1));
  it("a row sized with the guard still fits after peak overshoot", () => {
    const available = 400 * SPELLING_FIT_GUARD;
    const size = getSpellingFitFontSize(800, available);
    // Scaling the measured width by size/nominal lands exactly on the guarded width.
    expect((800 * size) / SPELLING_NOMINAL_FONT_SIZE).toBeCloseTo(available);
  });
});

describe("variant type coverage", () => {
  it("every stagger key is a declared variant", () => {
    const keys = Object.keys(SPELLING_STAGGER) as SpellingVariant[];
    expect(keys.sort()).toEqual([...SPELLING_VARIANTS].sort());
  });
});
