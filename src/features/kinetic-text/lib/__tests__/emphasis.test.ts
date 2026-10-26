import { describe, expect, it } from "vitest";
import {
  EMPHASIS_FONT_SCALE,
  EMPHASIS_VARIANTS,
  GLYPH_STROKE_EMPHASIS_VARIANTS,
  NON_LUMINOUS_EMPHASIS_VARIANTS,
  getAuraColor,
  getEmphasisInnerAnimation,
  getEmphasisTextShadow,
  getEmphasisVariant,
  getRunEmphasisStyle,
  isDimEmphasisColor,
  isGlyphStrokeSafeText,
  isWhiteLikeColor,
} from "../emphasis";

describe("variant catalogues", () => {
  it("ships eleven emphasis variants", () => expect(EMPHASIS_VARIANTS).toHaveLength(11));
  it("has no duplicates", () =>
    expect(new Set(EMPHASIS_VARIANTS).size).toBe(EMPHASIS_VARIANTS.length));
  it("the non-luminous subset is smaller than the full set", () =>
    expect(NON_LUMINOUS_EMPHASIS_VARIANTS.length).toBeLessThan(EMPHASIS_VARIANTS.length));
  it("every non-luminous variant is a real variant", () => {
    for (const variant of NON_LUMINOUS_EMPHASIS_VARIANTS)
      expect(EMPHASIS_VARIANTS).toContain(variant);
  });
  it("excludes the two auras from the non-luminous set", () => {
    expect(NON_LUMINOUS_EMPHASIS_VARIANTS).not.toContain("glow");
    expect(NON_LUMINOUS_EMPHASIS_VARIANTS).not.toContain("halo");
  });
  it("glyph-stroke variants are only outline", () =>
    expect(GLYPH_STROKE_EMPHASIS_VARIANTS).toEqual(["outline"]));
  it("scales an emphasised word by 1.12", () => expect(EMPHASIS_FONT_SCALE).toBe(1.12));
});

describe("isGlyphStrokeSafeText", () => {
  it("accepts a pure Han run", () => expect(isGlyphStrokeSafeText("诚实")).toBe(true));
  it("rejects Latin text", () => expect(isGlyphStrokeSafeText("honest")).toBe(false));
  it("rejects Vietnamese text with stacked diacritics", () =>
    expect(isGlyphStrokeSafeText("thật")).toBe(false));
  it("rejects a Han run carrying one Latin letter", () =>
    expect(isGlyphStrokeSafeText("诚实x")).toBe(false));
  it("rejects text with no Han glyph", () =>
    expect(isGlyphStrokeSafeText("")).toBe(false));
  it("accepts Han with punctuation but no other letters", () =>
    expect(isGlyphStrokeSafeText("诚实，")).toBe(true));
});

describe("isDimEmphasisColor", () => {
  it("treats near-black as dim", () => expect(isDimEmphasisColor("#000000")).toBe(true));
  it("treats a dark blue as dim", () => expect(isDimEmphasisColor("#101a4d")).toBe(true));
  it("treats white as bright", () => expect(isDimEmphasisColor("#ffffff")).toBe(false));
  it("treats a saturated yellow as bright", () => expect(isDimEmphasisColor("#FFBE0B")).toBe(false));
  it("expands a three-digit hex", () => expect(isDimEmphasisColor("#000")).toBe(true));
  it("ignores surrounding whitespace", () => expect(isDimEmphasisColor("  #000000  ")).toBe(true));
  it("returns false for a non-hex string", () => expect(isDimEmphasisColor("currentColor")).toBe(false));
});

describe("isWhiteLikeColor", () => {
  it("matches the named white", () => expect(isWhiteLikeColor("white")).toBe(true));
  it("matches #fff", () => expect(isWhiteLikeColor("#fff")).toBe(true));
  it("matches #ffffff", () => expect(isWhiteLikeColor("#ffffff")).toBe(true));
  it("is case-insensitive", () => expect(isWhiteLikeColor("WHITE")).toBe(true));
  it("ignores whitespace", () => expect(isWhiteLikeColor("  #fff ")).toBe(true));
  it("rejects off-white", () => expect(isWhiteLikeColor("#fefefe")).toBe(false));
  it("rejects other named colors", () => expect(isWhiteLikeColor("ivory")).toBe(false));
});

describe("getAuraColor", () => {
  it("gives white text a gold aura", () => expect(getAuraColor("white")).toBe("#FFBE0B"));
  it("gives #fff a gold aura", () => expect(getAuraColor("#fff")).toBe("#FFBE0B"));
  it("falls back to currentColor for a dark word", () =>
    expect(getAuraColor("#222")).toBe("currentColor"));
});

describe("getEmphasisVariant", () => {
  it("returns a real variant", () =>
    expect(EMPHASIS_VARIANTS).toContain(getEmphasisVariant("page text", "text", 0, true)));
  it("is deterministic for identical inputs", () =>
    expect(getEmphasisVariant("t", "seed", 2, true)).toBe(
      getEmphasisVariant("t", "seed", 2, true),
    ));
  it("never returns outline on non-Han text", () => {
    for (let index = 0; index < 40; index += 1)
      expect(getEmphasisVariant("latin words", `seed${index}`, index, true)).not.toBe("outline");
  });
  it("can return outline on Han text", () => {
    const seen = new Set(
      Array.from({ length: 60 }, (_, index) => getEmphasisVariant("诚实", `诚实${index}`, index, true)),
    );
    expect(seen.has("outline")).toBe(true);
  });
  it("restricts a dim colour to the non-luminous set", () => {
    for (let index = 0; index < 60; index += 1) {
      const variant = getEmphasisVariant("page", `s${index}`, index, false);
      expect(NON_LUMINOUS_EMPHASIS_VARIANTS).toContain(variant);
      expect(variant).not.toBe("glow");
      expect(variant).not.toBe("halo");
    }
  });
  it("honours an authored pool", () => {
    const pool = ["color", "sweep"] as const;
    for (let index = 0; index < 40; index += 1)
      expect(pool).toContain(getEmphasisVariant("page", `s${index}`, index, true, pool));
  });
  it("filters an all-aura pool down to something drawable on a dim colour", () => {
    const pool = ["glow", "halo"] as const;
    const variant = getEmphasisVariant("page", "seed", 0, false, pool);
    expect(NON_LUMINOUS_EMPHASIS_VARIANTS).toContain(variant);
  });
  it("still drops outline from a pool on Latin text", () => {
    const pool = ["outline", "color"] as const;
    for (let index = 0; index < 30; index += 1)
      expect(getEmphasisVariant("latin", `s${index}`, index, true, pool)).not.toBe("outline");
  });
  it("varies across anchors", () => {
    const seen = new Set(
      Array.from({ length: 30 }, (_, index) => getEmphasisVariant("same page", "same", index, true)),
    );
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe("getRunEmphasisStyle", () => {
  it("never returns frame for a grouped run", () => {
    const words = ["hình", "ảnh", "đẹp"];
    for (let index = 0; index < 40; index += 1) {
      const variant = getRunEmphasisStyle("page", words, [index, index + 1], "#FFBE0B");
      expect(variant).not.toBe("frame");
    }
  });
  it("returns a real variant", () =>
    expect(EMPHASIS_VARIANTS).toContain(
      getRunEmphasisStyle("page", ["a", "b"], [0, 1], "#FFBE0B"),
    ));
  it("is deterministic for the same run", () =>
    expect(getRunEmphasisStyle("page", ["x", "y"], [0, 1], "#fff")).toBe(
      getRunEmphasisStyle("page", ["x", "y"], [0, 1], "#fff"),
    ));
  it("keeps a dim run inside the non-luminous set", () => {
    const variant = getRunEmphasisStyle("page", ["x", "y"], [0, 1], "#000");
    expect(NON_LUMINOUS_EMPHASIS_VARIANTS).toContain(variant);
  });
});

describe("getEmphasisTextShadow", () => {
  it("gives every variant a shadow", () => {
    for (const variant of EMPHASIS_VARIANTS)
      expect(getEmphasisTextShadow(variant).length).toBeGreaterThan(0);
  });
  it("returns a flat separation shadow for outline", () =>
    expect(getEmphasisTextShadow("outline")).toBe("0 4px 40px rgba(0,0,0,0.45)"));
  it("gives glow its registered-property breathing shadow", () =>
    expect(getEmphasisTextShadow("glow")).toContain("--kinetic-glow-inner"));
  it("falls back to the generic shadow for null", () =>
    expect(getEmphasisTextShadow(null)).toContain("rgba(255,255,255,0.35)"));
});

describe("getEmphasisInnerAnimation", () => {
  it("animates jiggle as a bounded one-shot", () =>
    expect(getEmphasisInnerAnimation("jiggle")).toContain("kinetic-emphasis-jiggle"));
  it("loops pulse on the beat", () =>
    expect(getEmphasisInnerAnimation("pulse")).toContain("--kinetic-beat"));
  it("floors flash to keep it under the WCAG 3 Hz limit", () =>
    expect(getEmphasisInnerAnimation("flash")).toContain("max(0.5s"));
  it("runs fringe exactly once", () =>
    expect(getEmphasisInnerAnimation("fringe")).toMatch(/\b1$/));
  it("returns undefined for a colour-only variant", () =>
    expect(getEmphasisInnerAnimation("color")).toBeUndefined());
  it("returns undefined for null", () =>
    expect(getEmphasisInnerAnimation(null)).toBeUndefined());
});
