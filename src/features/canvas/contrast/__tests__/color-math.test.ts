import { describe, expect, it } from "vitest";
import {
  type RgbColor,
  clamp,
  extractCssColors,
  getAverageHueDistance,
  getColorDistance,
  getContrastRatio,
  getHueDistance,
  getMaximumLuminance,
  getMinimumContrast,
  getRelativeLuminance,
  hslToRgb,
  hueToRgb,
  isGreenishBackground,
  isTooDarkBackground,
  isYellowishColor,
  parseCssColor,
  parseHexColor,
  parseHslColor,
  parseRgbChannel,
  parseRgbColor,
  rgbToHsl,
} from "../color-math";

const WHITE: RgbColor = { r: 255, g: 255, b: 255 };
const BLACK: RgbColor = { r: 0, g: 0, b: 0 };
const RED: RgbColor = { r: 255, g: 0, b: 0 };

describe("clamp", () => {
  it("keeps an in-range value", () => expect(clamp(5, 0, 10)).toBe(5));
  it("raises below the min", () => expect(clamp(-1, 0, 10)).toBe(0));
  it("lowers above the max", () => expect(clamp(11, 0, 10)).toBe(10));
});

describe("parseHexColor", () => {
  it("parses a six-digit hex", () => expect(parseHexColor("#ff0000")).toEqual({ r: 255, g: 0, b: 0 }));
  it("expands a three-digit hex", () => expect(parseHexColor("#fff")).toEqual(WHITE));
  it("keeps the leading channels of a four-digit hex", () =>
    expect(parseHexColor("#abcd")).toEqual({ r: 170, g: 187, b: 204 }));
  it("ignores the alpha of an eight-digit hex", () =>
    expect(parseHexColor("#ff000000")).toEqual(RED));
  it("rejects a two-digit hex", () => expect(parseHexColor("#12")).toBeNull());
  it("rejects non-hex characters", () => expect(parseHexColor("#gggggg")).toBeNull());
});

describe("parseRgbChannel", () => {
  it("parses an integer", () => expect(parseRgbChannel("200")).toBe(200));
  it("converts a percentage", () => expect(parseRgbChannel("50%")).toBe(128));
  it("clamps above 255", () => expect(parseRgbChannel("300")).toBe(255));
  it("clamps below zero", () => expect(parseRgbChannel("-10")).toBe(0));
  it("rounds a fraction", () => expect(parseRgbChannel("12.5")).toBe(13));
});

describe("parseRgbColor", () => {
  it("parses an rgb triple", () => expect(parseRgbColor("rgb(255, 0, 0)")).toEqual(RED));
  it("parses percentage channels", () =>
    expect(parseRgbColor("rgb(50%, 0%, 0%)")).toEqual({ r: 128, g: 0, b: 0 }));
  it("rejects fewer than three channels", () => expect(parseRgbColor("rgb(1,2)")).toBeNull());
});

describe("parseHslColor", () => {
  it("parses red", () => expect(parseHslColor("hsl(0, 100%, 50%)")).toEqual(RED));
  it("parses green", () => expect(parseHslColor("hsl(120, 100%, 50%)")).toEqual({ r: 0, g: 255, b: 0 }));
  it("rejects an incomplete value", () => expect(parseHslColor("hsl(0, 100%)")).toBeNull());
});

describe("parseCssColor", () => {
  it("parses the named white", () => expect(parseCssColor("white")).toEqual(WHITE));
  it("parses the named black", () => expect(parseCssColor("black")).toEqual(BLACK));
  it("delegates to hex", () => expect(parseCssColor("#00ff00")).toEqual({ r: 0, g: 255, b: 0 }));
  it("delegates to rgb", () => expect(parseCssColor("rgb(1, 2, 3)")).toEqual({ r: 1, g: 2, b: 3 }));
  it("delegates to hsl", () => expect(parseCssColor("hsl(0, 100%, 50%)")).toEqual(RED));
  it("trims and lowercases", () => expect(parseCssColor("  #FF0000 ")).toEqual(RED));
  it("returns null for a keyword", () => expect(parseCssColor("currentColor")).toBeNull());
});

describe("extractCssColors", () => {
  it("pulls hex out of a gradient", () =>
    expect(extractCssColors("linear-gradient(135deg,#FF006E,#8338EC)")).toEqual(["#FF006E", "#8338EC"]));
  it("pulls out rgb calls", () => expect(extractCssColors("rgb(1,2,3) and rgb(4,5,6)")).toHaveLength(2));
  it("falls back to the whole string when nothing matches", () =>
    expect(extractCssColors("no colors here")).toEqual(["no colors here"]));
});

describe("hslToRgb and rgbToHsl", () => {
  it("renders a hueless grey from lightness", () =>
    expect(hslToRgb({ h: 0, s: 0, l: 0.5 })).toEqual({ r: 128, g: 128, b: 128 }));
  it("maps pure red", () => expect(hslToRgb({ h: 0, s: 1, l: 0.5 })).toEqual(RED));
  it("wraps the hue past 360", () =>
    expect(hslToRgb({ h: 720, s: 1, l: 0.5 })).toEqual(hslToRgb({ h: 0, s: 1, l: 0.5 })));
  it("returns q in the green-segment plateau", () => expect(hueToRgb(0.2, 0.8, 0.4)).toBe(0.8));
  it("converts red back to a zero hue", () => expect(rgbToHsl(RED).h).toBe(0));
  it("reports white at full lightness", () => expect(rgbToHsl(WHITE)).toEqual({ h: 0, s: 0, l: 1 }));
  it("reports black at zero lightness", () => expect(rgbToHsl(BLACK).l).toBe(0));
  it("recovers a hue through a round trip", () =>
    expect(rgbToHsl(hslToRgb({ h: 210, s: 0.6, l: 0.5 })).h).toBeCloseTo(210, 0));
});

describe("getRelativeLuminance", () => {
  it("puts white at one", () => expect(getRelativeLuminance(WHITE)).toBeCloseTo(1, 5));
  it("puts black at zero", () => expect(getRelativeLuminance(BLACK)).toBe(0));
  it("weights red by its coefficient", () => expect(getRelativeLuminance(RED)).toBeCloseTo(0.2126, 5));
});

describe("getContrastRatio", () => {
  it("maxes white against black at 21", () => expect(getContrastRatio(WHITE, BLACK)).toBeCloseTo(21, 5));
  it("gives a color against itself a ratio of one", () =>
    expect(getContrastRatio(RED, RED)).toBeCloseTo(1, 5));
  it("is symmetric", () =>
    expect(getContrastRatio(WHITE, RED)).toBe(getContrastRatio(RED, WHITE)));
});

describe("getMinimumContrast and getMaximumLuminance", () => {
  it("takes the worst contrast against a set", () =>
    expect(getMinimumContrast(WHITE, [BLACK, WHITE])).toBeCloseTo(1, 5));
  it("takes the brightest of a set", () =>
    expect(getMaximumLuminance([BLACK, WHITE])).toBeCloseTo(1, 5));
});

describe("hue and colour distance", () => {
  it("takes the short way around the wheel", () => expect(getHueDistance(0, 350)).toBe(10));
  it("caps a half turn at 180", () => expect(getHueDistance(0, 180)).toBe(180));
  it("returns zero for the same hue", () => expect(getHueDistance(100, 100)).toBe(0));
  it("wraps a wide gap", () => expect(getHueDistance(300, 10)).toBe(70));
  it("measures red against green in rgb space", () =>
    expect(getColorDistance(RED, { r: 0, g: 255, b: 0 })).toBeCloseTo(255 * Math.SQRT2, 2));
  it("measures a color against itself as zero", () => expect(getColorDistance(RED, RED)).toBe(0));
  it("averages the hue distance over a backdrop", () =>
    expect(getAverageHueDistance(RED, [RED, RED])).toBe(0));
  it("averages a red against a single green backdrop", () =>
    expect(getAverageHueDistance(RED, [{ r: 0, g: 255, b: 0 }])).toBe(120));
});

describe("backdrop hue classifiers", () => {
  it("flags a green backdrop", () =>
    expect(isGreenishBackground([hslToRgb({ h: 120, s: 0.6, l: 0.5 })])).toBe(true));
  it("does not flag a red backdrop", () => expect(isGreenishBackground([RED])).toBe(false));
  it("does not flag an empty backdrop", () => expect(isGreenishBackground([])).toBe(false));
  it("flags a saturated yellow", () => expect(isYellowishColor(hslToRgb({ h: 50, s: 0.9, l: 0.5 }))).toBe(true));
  it("does not flag a hueless grey", () => expect(isYellowishColor(WHITE)).toBe(false));
  it("does not flag red", () => expect(isYellowishColor(RED)).toBe(false));
});

describe("isTooDarkBackground", () => {
  it("never condemns an empty backdrop", () => expect(isTooDarkBackground([])).toBe(false));
  it("flags an all-black backdrop", () => expect(isTooDarkBackground([BLACK])).toBe(true));
  it("passes a white backdrop", () => expect(isTooDarkBackground([WHITE])).toBe(false));
  it("passes a black and white mix", () => expect(isTooDarkBackground([BLACK, WHITE])).toBe(false));
  it("flags two near-black stops", () =>
    expect(isTooDarkBackground([BLACK, { r: 30, g: 30, b: 30 }])).toBe(true));
  it("passes a mid-grey backdrop", () =>
    expect(isTooDarkBackground([{ r: 100, g: 100, b: 100 }, { r: 150, g: 150, b: 150 }])).toBe(false));
});
