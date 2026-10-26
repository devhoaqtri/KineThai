import { describe, expect, it } from "vitest";
import type { CanvasSpec } from "@/features/canvas";
import { getKineticTextLayoutMode, hasVisibleStickerAccent } from "../layout";
import { getStableNumber } from "../stable-hash";

const MODES = ["left-spotlight", "left", "center"] as const;

/** Find a deterministic string whose stable hash lands on a residue. */
function textWithMod(mod: number, residue: number): string {
  for (let index = 0; index < 5000; index += 1) {
    const candidate = `layout-seed-${index}`;
    if (getStableNumber(candidate) % mod === residue) return candidate;
  }
  throw new Error(`no seed found for ${residue} mod ${mod}`);
}

describe("getKineticTextLayoutMode", () => {
  it("always returns a known mode", () => {
    for (let index = 0; index < 40; index += 1) {
      const mode = getKineticTextLayoutMode(`page ${index}`, index % 2 === 0, index, new Set([0]));
      expect(MODES).toContain(mode);
    }
  });
  it("gives packed lines with no emphasis the left rail", () =>
    expect(getKineticTextLayoutMode("bất kỳ chữ nào", true, 8, new Set())).toBe("left"));
  it("can spotlight a packed line when the seed divides by four", () => {
    const text = textWithMod(4, 0);
    expect(getKineticTextLayoutMode(text, true, 8, new Set([0]))).toBe("left-spotlight");
  });
  it("keeps a packed line on the left when the seed does not divide by four", () => {
    const text = textWithMod(4, 1);
    expect(getKineticTextLayoutMode(text, true, 8, new Set([0]))).toBe("left");
  });
  it("centres a short unpacked page of three words", () =>
    expect(getKineticTextLayoutMode("one two three", false, 3, new Set())).toBe("center"));
  it("centres a single word even with emphasis", () =>
    expect(getKineticTextLayoutMode("solo", false, 1, new Set([0]))).toBe("center"));
  it("gives a long unpacked page with no emphasis the left rail", () =>
    expect(getKineticTextLayoutMode("a b c d e f", false, 6, new Set())).toBe("left"));
  it("can spotlight an emphasised unpacked page when the seed divides by five", () => {
    const text = textWithMod(5, 0);
    expect(getKineticTextLayoutMode(text, false, 5, new Set([0]))).toBe("left-spotlight");
  });
  it("is deterministic for identical inputs", () =>
    expect(getKineticTextLayoutMode("same text", false, 5, new Set([0]))).toBe(
      getKineticTextLayoutMode("same text", false, 5, new Set([0])),
    ));
  it("never spotlights without emphasis on an unpacked page", () => {
    for (let index = 0; index < 40; index += 1)
      expect(getKineticTextLayoutMode(`t${index}`, false, 5, new Set())).not.toBe("left-spotlight");
  });
});

describe("hasVisibleStickerAccent", () => {
  const stickers = (words: string[]) =>
    words.map((word) => ({ word })) as unknown as CanvasSpec["stickers"];

  it("finds a sticker word in the text", () =>
    expect(hasVisibleStickerAccent(stickers(["love"]), "I love you")).toBe(true));
  it("matches case-insensitively", () =>
    expect(hasVisibleStickerAccent(stickers(["LOVE"]), "i love you")).toBe(true));
  it("matches a sticker written in a different case", () =>
    expect(hasVisibleStickerAccent(stickers(["love"]), "I LOVE YOU")).toBe(true));
  it("returns false when no sticker appears", () =>
    expect(hasVisibleStickerAccent(stickers(["hate"]), "love wins")).toBe(false));
  it("returns false for an empty sticker list", () =>
    expect(hasVisibleStickerAccent(stickers([]), "love wins")).toBe(false));
  it("returns false when stickers are undefined", () =>
    expect(
      hasVisibleStickerAccent(undefined as unknown as CanvasSpec["stickers"], "love wins"),
    ).toBe(false));
  it("finds any one of several stickers", () =>
    expect(hasVisibleStickerAccent(stickers(["hate", "win"]), "love wins")).toBe(true));
  it("matches a substring inside a longer word", () =>
    expect(hasVisibleStickerAccent(stickers(["lov"]), "lovely day")).toBe(true));
  it("keeps Vietnamese diacritics in the match", () =>
    expect(hasVisibleStickerAccent(stickers(["thương"]), "yêu thương nhau")).toBe(true));
});
