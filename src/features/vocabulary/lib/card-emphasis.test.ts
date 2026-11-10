import { describe, expect, it } from "vitest";
import { EMPHASIS_VARIANTS, type EmphasisVariant } from "@/features/kinetic-text";
import { DOUYIN_THEMES, THEMES } from "./presets";
import {
  cardEmphasisColor,
  cardEmphasisPool,
  PALE_CARD_UNSAFE_EMPHASIS,
} from "./card-emphasis";

describe("cardEmphasisPool", () => {
  it("keeps a deep card's pool untouched", () => {
    const pool: EmphasisVariant[] = ["glow", "halo", "underline"];
    expect(cardEmphasisPool(pool, "dark")).toBe(pool);
  });

  it("strips light effects on a pale card and adds marks when any were dropped", () => {
    const stripped = cardEmphasisPool(["glow", "color"], "light");
    expect(stripped).not.toContain("glow");
    expect(stripped).toContain("color");
    expect(stripped).toContain("underline");
    expect(stripped).toContain("frame");
  });

  it("leaves a pale card's pool untouched when it already had no light effects", () => {
    const marks: EmphasisVariant[] = ["underline", "frame", "color"];
    expect(cardEmphasisPool(marks, "light")).toBe(marks);
  });

  it("draws from the global pool when the style gave none, dropping light effects", () => {
    const pool = cardEmphasisPool(undefined, "light");
    expect(pool).toBeDefined();
    for (const unsafe of PALE_CARD_UNSAFE_EMPHASIS) {
      expect(pool).not.toContain(unsafe);
    }
    expect(pool).toContain("underline");
    expect(pool).toContain("frame");
    // Deep tone with undefined pool returns undefined (stage picks from global pool)
    expect(cardEmphasisPool(undefined, "dark")).toBeUndefined();
  });
});

describe("cardEmphasisColor", () => {
  it("leaves deep cards to the player's own pick", () => {
    for (const theme of [...THEMES, ...DOUYIN_THEMES].filter((t) => t.tone === "dark")) {
      expect(cardEmphasisColor(theme)).toBeUndefined();
    }
  });

  it("gives every pale card an accent that never resolves to near-black", () => {
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
