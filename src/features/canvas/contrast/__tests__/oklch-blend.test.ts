import { describe, expect, it } from "vitest";
import { blendOklch, hexToOklch, oklchToHex, vividGradient } from "../oklch-blend";

const HEX6 = /^#[0-9a-f]{6}$/;

describe("hexToOklch", () => {
  it("parses black to zero lightness", () => {
    const oklch = hexToOklch("#000000");
    expect(oklch).not.toBeNull();
    expect(oklch!.l).toBeCloseTo(0, 5);
  });
  it("parses white to full lightness", () => {
    const oklch = hexToOklch("#ffffff");
    expect(oklch!.l).toBeCloseTo(1, 4);
  });
  it("keeps a chromatic red off the neutral axis", () => {
    const oklch = hexToOklch("#ff0000");
    expect(oklch!.c).toBeGreaterThan(0.1);
  });
  it("reports grey as near hueless", () => {
    const oklch = hexToOklch("#808080");
    expect(oklch!.c).toBeLessThan(0.02);
  });
  it("returns null for a non-hex color", () => expect(hexToOklch("rgb(1,2,3)")).toBeNull());
  it("returns null for a malformed hex", () => expect(hexToOklch("#12")).toBeNull());
  it("accepts a three-digit hex", () => expect(hexToOklch("#fff")).not.toBeNull());
  it("wraps the hue into zero and 360", () => {
    const oklch = hexToOklch("#3a86ff");
    expect(oklch!.h).toBeGreaterThanOrEqual(0);
    expect(oklch!.h).toBeLessThan(360);
  });
});

describe("oklchToHex", () => {
  it("round-trips black", () => expect(oklchToHex(hexToOklch("#000000")!)).toBe("#000000"));
  it("round-trips white", () => expect(oklchToHex(hexToOklch("#ffffff")!)).toBe("#ffffff"));
  it("returns a six-digit hex string", () => expect(oklchToHex({ l: 0.5, c: 0.1, h: 200 })).toMatch(HEX6));
  it("keeps an out-of-gamut color in range by giving up chroma", () =>
    expect(oklchToHex({ l: 0.5, c: 0.5, h: 30 })).toMatch(HEX6));
  it("lands near the source for an in-gamut color", () => {
    const hex = oklchToHex(hexToOklch("#118ab2")!);
    expect(hex).toMatch(HEX6);
  });
});

describe("blendOklch", () => {
  it("returns the requested number of stops", () =>
    expect(blendOklch("#ff0000", "#0000ff", 3)).toHaveLength(3));
  it("defaults to five intermediate stops", () =>
    expect(blendOklch("#ff0000", "#0000ff")).toHaveLength(5));
  it("emits valid hex for every stop", () => {
    for (const hex of blendOklch("#ff006e", "#06ffa5", 4)) expect(hex).toMatch(HEX6);
  });
  it("returns nothing for zero steps", () => expect(blendOklch("#ff0000", "#0000ff", 0)).toEqual([]));
  it("returns nothing when the start is not hex", () =>
    expect(blendOklch("red", "#0000ff", 3)).toEqual([]));
  it("returns nothing when the end is not hex", () =>
    expect(blendOklch("#ff0000", "blue", 3)).toEqual([]));
  it("is deterministic", () =>
    expect(blendOklch("#ff0000", "#00ff00", 4)).toEqual(blendOklch("#ff0000", "#00ff00", 4)));
  it("keeps stops inside the luminance band of the endpoints", () => {
    const from = hexToOklch("#000000")!;
    const to = hexToOklch("#ffffff")!;
    expect(oklchToHex(from)).toBe("#000000");
    expect(oklchToHex(to)).toBe("#ffffff");
    const stops = blendOklch("#000000", "#ffffff", 4);
    expect(stops).toHaveLength(4);
  });
});

describe("vividGradient", () => {
  it("expands a two-stop hex gradient", () => {
    const result = vividGradient("linear-gradient(135deg,#ff0000,#0000ff)");
    expect(result.startsWith("linear-gradient(135deg,")).toBe(true);
    expect(result).toContain("#ff0000");
    expect(result).toContain("#0000ff");
  });
  it("adds more stops than it started with", () => {
    const result = vividGradient("linear-gradient(135deg,#ff0000,#0000ff)");
    expect(result.split(",").length).toBeGreaterThan(3);
  });
  it("leaves a non-gradient untouched", () =>
    expect(vividGradient("url(photo.jpg)")).toBe("url(photo.jpg)"));
  it("leaves a three-stop gradient untouched", () => {
    const input = "linear-gradient(135deg,#ff0000,#00ff00,#0000ff)";
    expect(vividGradient(input)).toBe(input);
  });
  it("leaves a named-color gradient untouched", () => {
    const input = "linear-gradient(to right, red, blue)";
    expect(vividGradient(input)).toBe(input);
  });
  it("trims surrounding whitespace before matching", () => {
    const result = vividGradient("  linear-gradient(135deg,#ff0000,#0000ff)  ");
    expect(result.startsWith("linear-gradient(135deg,")).toBe(true);
  });
});
