import { describe, expect, it } from "vitest";
import {
  EMPHASIS_FONT_SCALE,
  EMPHASIS_SCALE_FIT_GUARD,
  MIN_ENGLISH_TEXT_FIT_SCALE,
  MIN_FONT_SIZE,
  MIN_TEXT_FIT_SCALE,
  TEXT_SAFE_BOTTOM_PX,
  TEXT_SAFE_MAX_WIDTH,
  TEXT_SAFE_MIN_EDGE_GAP_PX,
  TEXT_SAFE_TOP_PX,
  VIETNAMESE_SCALE_FIT_GUARD,
  getPageDuration,
  getPageTextSize,
  getPostExportDuration,
  getUniformPageTextSize,
  getWordDelay,
  isSoloTextPage,
  tempoConfig,
  getTextSafeInsets,
} from "../playback-timing";

describe("playback-timing constants", () => {
  it("reuses the shared emphasis font scale", () => expect(EMPHASIS_FONT_SCALE).toBe(1.12));
  it("keeps the edge gap at 16px", () => expect(TEXT_SAFE_MIN_EDGE_GAP_PX).toBe(16));
  it("keeps the top safe inset at 72px", () => expect(TEXT_SAFE_TOP_PX).toBe(72));
  it("keeps the bottom safe inset at 132px", () => expect(TEXT_SAFE_BOTTOM_PX).toBe(132));
  it("floors the general fit at 0.46", () => expect(MIN_TEXT_FIT_SCALE).toBe(0.46));
  it("floors the English fit at 0.72", () => expect(MIN_ENGLISH_TEXT_FIT_SCALE).toBe(0.72));
  it("guards emphasis scale at 1.14", () => expect(EMPHASIS_SCALE_FIT_GUARD).toBe(1.14));
  it("guards Vietnamese scale at 1.24", () => expect(VIETNAMESE_SCALE_FIT_GUARD).toBe(1.24));
  it("never fonts below 64px", () => expect(MIN_FONT_SIZE).toBe(64));
  it("caps the safe width with a css clamp", () => expect(TEXT_SAFE_MAX_WIDTH).toContain("calc"));
});

describe("tempoConfig", () => {
  it("defines every tempo", () => {
    expect(Object.keys(tempoConfig).sort()).toEqual(["slow", "snappy", "steady"]);
  });
  it("runs the slow loop longest", () => {
    expect(tempoConfig.slow.loopSeconds).toBeGreaterThan(tempoConfig.steady.loopSeconds);
    expect(tempoConfig.steady.loopSeconds).toBeGreaterThan(tempoConfig.snappy.loopSeconds);
  });
  it("delays words longer when slow", () =>
    expect(tempoConfig.slow.wordDelay).toBeGreaterThan(tempoConfig.snappy.wordDelay));
  it("holds steady as the 1x page multiplier", () =>
    expect(tempoConfig.steady.pageMultiplier).toBe(1));
  it("shrinks pages when snappy", () =>
    expect(tempoConfig.snappy.pageMultiplier).toBeLessThan(1));
  it("lengthens pages when slow", () =>
    expect(tempoConfig.slow.pageMultiplier).toBeGreaterThan(1));
});

describe("isSoloTextPage", () => {
  it("treats a single word as solo", () => expect(isSoloTextPage("Dawn")).toBe(true));
  it("treats an empty page as solo", () => expect(isSoloTextPage("")).toBe(true));
  it("treats two words as not solo", () => expect(isSoloTextPage("two words")).toBe(false));
  it("treats one Han glyph as solo", () => expect(isSoloTextPage("我")).toBe(true));
  it("counts Han glyphs, not whitespace", () => expect(isSoloTextPage("你好")).toBe(false));
});

describe("getPageTextSize", () => {
  it("keeps a short English page at its base size", () =>
    expect(getPageTextSize(100, "hello world", false)).toBe(100));
  it("bumps a tiny English base size to at least 96", () =>
    expect(getPageTextSize(50, "hello world", false)).toBe(96));
  it("shrinks a dense English page", () => {
    const text = Array.from({ length: 14 }, (_, index) => `w${index}`).join(" ");
    expect(getPageTextSize(60, text, false)).toBe(80);
  });
  it("caps a busy Vietnamese page", () =>
    expect(getPageTextSize(200, "một hai ba", true)).toBe(104));
  it("keeps a two-syllable Vietnamese page at its base size", () =>
    expect(getPageTextSize(200, "một hai", true)).toBe(200));
  it("shrinks a long Vietnamese page", () =>
    expect(getPageTextSize(200, "một hai ba bốn năm", true)).toBe(92));
  it("wears the Vietnamese band for Han text", () =>
    expect(getPageTextSize(200, "我爱你你爱我", false)).toBe(104));
});

describe("getUniformPageTextSize", () => {
  it("uses the single page's own size", () =>
    expect(getUniformPageTextSize(100, ["hello world"], "hello world")).toBe(100));
  it("sizes every page to the smallest page", () =>
    expect(getUniformPageTextSize(50, ["one two", "three four five"], "one two three four five")).toBe(
      96,
    ));
  it("never drops below the minimum font size", () =>
    expect(getUniformPageTextSize(10, ["một", "hai"], "một hai")).toBe(MIN_FONT_SIZE));
  it("grows an English page that has many words", () => {
    const page = Array.from({ length: 12 }, (_, index) => `w${index}`).join(" ");
    expect(getUniformPageTextSize(60, [page, page], page)).toBe(86);
  });
  it("keeps a Han deck inside the Vietnamese band", () =>
    expect(getUniformPageTextSize(200, ["我爱你", "你好吗"], "我爱你 你好吗")).toBe(200));
  it("floors a tiny Vietnamese page at the minimum", () =>
    expect(getUniformPageTextSize(10, ["một"], "một")).toBe(MIN_FONT_SIZE));
});

describe("getPageDuration", () => {
  it("floors a two-word page at 3200ms on steady", () =>
    expect(getPageDuration("hello world", "steady", "smooth")).toBe(3200));
  it("caps a very long page at 5200ms", () => {
    const text = Array.from({ length: 30 }, (_, index) => `w${index}`).join(" ");
    expect(getPageDuration(text, "steady", "smooth")).toBe(5200);
  });
  it("slows down on the slow tempo", () =>
    expect(getPageDuration("hello world", "slow", "smooth")).toBe(
      3200 * tempoConfig.slow.pageMultiplier,
    ));
  it("stretches poetic rhythm by 1.18", () =>
    expect(getPageDuration("hello world", "steady", "poetic")).toBeCloseTo(3200 * 1.18, 5));
  it("counts Han glyphs when timing a page", () =>
    expect(getPageDuration("我爱你你爱我", "steady", "smooth")).toBe(4480));
  it("is faster on a snappy tempo than a slow one", () =>
    expect(getPageDuration("hello world there", "snappy", "smooth")).toBeLessThan(
      getPageDuration("hello world there", "slow", "smooth"),
    ));
});

describe("getPostExportDuration", () => {
  it("sums pages and adds the tail", () =>
    expect(getPostExportDuration(["a b", "c d e"], "steady", "smooth")).toBe(
      getPageDuration("a b", "steady", "smooth") +
        getPageDuration("c d e", "steady", "smooth") +
        650,
    ));
  it("floors an empty deck at 3600ms", () =>
    expect(getPostExportDuration([], "steady", "smooth")).toBe(3600));
  it("floors a single short page at 3600ms", () =>
    expect(getPostExportDuration(["a"], "snappy", "burst")).toBe(3600));
  it("grows with more pages", () =>
    expect(getPostExportDuration(["a b", "c d", "e f"], "steady", "smooth")).toBeGreaterThan(
      getPostExportDuration(["a b", "c d"], "steady", "smooth"),
    ));
});

describe("getWordDelay", () => {
  it("never delays the first word", () => {
    for (const rhythm of ["smooth", "stagger", "burst", "poetic"] as const)
      expect(getWordDelay(0, "steady", rhythm)).toBe(0);
  });
  it("multiplies by the base delay on a staggered rhythm", () =>
    expect(getWordDelay(2, "steady", "stagger")).toBeCloseTo(2 * tempoConfig.steady.wordDelay, 6));
  it("stretches poetic spacing", () =>
    expect(getWordDelay(2, "steady", "poetic")).toBeCloseTo(2 * 0.18 * 1.45, 6));
  it("tightens smooth spacing", () =>
    expect(getWordDelay(2, "steady", "smooth")).toBeCloseTo(2 * 0.18 * 0.58, 6));
  it("caps burst spacing at 0.38", () =>
    expect(getWordDelay(10, "steady", "burst")).toBe(0.38));
  it("keeps a small burst delay under the cap", () =>
    expect(getWordDelay(1, "steady", "burst")).toBeCloseTo(0.18 * 0.42, 6));
  it("scales with the tempo base delay", () =>
    expect(getWordDelay(2, "snappy", "stagger")).toBeCloseTo(2 * 0.1, 6));
});

describe("getTextSafeInsets", () => {
  it("scales insets on a tall canvas", () =>
    expect(getTextSafeInsets(1000)).toEqual({ top: 90, bottom: 170 }));
  it("falls back to the floor on a short canvas", () =>
    expect(getTextSafeInsets(100)).toEqual({
      top: TEXT_SAFE_TOP_PX,
      bottom: TEXT_SAFE_BOTTOM_PX,
    }));
  it("keeps the bottom inset larger than the top", () => {
    const insets = getTextSafeInsets(800);
    expect(insets.bottom).toBeGreaterThan(insets.top);
  });
  it("never goes below the floor", () => {
    const insets = getTextSafeInsets(50);
    expect(insets.top).toBeGreaterThanOrEqual(TEXT_SAFE_TOP_PX);
    expect(insets.bottom).toBeGreaterThanOrEqual(TEXT_SAFE_BOTTOM_PX);
  });
});
