import { describe, expect, it } from "vitest";
import { PALE_CARD_UNSAFE_EMPHASIS, cardEmphasisColor, cardEmphasisPool } from "./card-emphasis";
import { DOUYIN_STYLES, DOUYIN_THEMES, STYLES, THEMES } from "./presets";

describe("cardEmphasisPool", () => {
  it("leaves a deep card's pool exactly as authored", () => {
    for (const style of [...STYLES, ...DOUYIN_STYLES]) {
      expect(cardEmphasisPool(style.emphasis, "dark")).toBe(style.emphasis);
    }
  });

  it("never hands a pale card an effect drawn in light, and never an empty pool", () => {
    for (const style of [...STYLES, ...DOUYIN_STYLES]) {
      const pool = cardEmphasisPool(style.emphasis, "light")!;
      expect(pool.length).toBeGreaterThan(0);
      expect(pool.filter((v) => PALE_CARD_UNSAFE_EMPHASIS.includes(v))).toEqual([]);
    }
    const global = cardEmphasisPool(undefined, "light")!;
    expect(global.filter((v) => PALE_CARD_UNSAFE_EMPHASIS.includes(v))).toEqual([]);
  });

  it("puts an underline and a box where light effects were dropped", () => {
    expect(cardEmphasisPool(["glow", "halo", "underline"], "light")).toEqual([
      "underline",
      "frame",
    ]);
    // Nothing dropped: the authored pool is kept as it is.
    const minimal = ["color", "underline"] as const;
    expect(cardEmphasisPool(minimal, "light")).toBe(minimal);
  });
});

describe("cardEmphasisColor", () => {
  it("lets the player pick on a deep card", () => {
    const deep = [...THEMES, ...DOUYIN_THEMES].find((theme) => theme.tone === "dark")!;
    expect(cardEmphasisColor(deep)).toBeUndefined();
  });

  it("colours a pale card's highlight from its own palette, never near-black", () => {
    for (const theme of [...THEMES, ...DOUYIN_THEMES].filter((t) => t.tone === "light")) {
      const color = cardEmphasisColor(theme);
      expect([theme.accent, theme.accentAlt]).toContain(color);
      expect(color?.toLowerCase()).not.toBe("#111827");
    }
  });

  it("prefers the accent that is not the ink", () => {
    const theme = {
      tone: "light",
      ink: "#1c2a4a",
      accent: "#1c4087",
      accentAlt: "#87401c",
    } as const;
    expect(cardEmphasisColor(theme)).toBe("#87401c");
    expect(cardEmphasisColor({ ...theme, accent: "#d13010" })).toBe("#d13010");
  });
});
