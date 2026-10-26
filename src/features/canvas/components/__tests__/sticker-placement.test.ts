import { describe, expect, it } from "vitest";
import type { CanvasSticker } from "../../types";
import {
  getWordAnchoredPlacement,
  getEmptySpacePlacement,
  type Rect,
} from "../sticker-placement";

const sticker = (overrides: Partial<CanvasSticker> = {}): CanvasSticker => ({
  id: "s1",
  kind: "emoji",
  word: "spark",
  x: 10,
  y: 20,
  size: 20,
  ...overrides,
});

const anchor: Rect = { left: 10, right: 60, top: 40, bottom: 70 };

describe("getWordAnchoredPlacement", () => {
  it("caps a large sticker at the non-compact maximum", () => {
    const result = getWordAnchoredPlacement(sticker({ size: 20 }), anchor, false);
    expect(result.size).toBe(15);
    expect(result.x).toBeCloseTo(64.2, 1);
    expect(result.y).toBeCloseTo(37, 1);
  });
  it("caps a large sticker at the compact maximum", () => {
    const result = getWordAnchoredPlacement(sticker({ size: 20 }), anchor, true);
    expect(result.size).toBe(12);
    expect(result.x).toBeCloseTo(63.36, 1);
    expect(result.y).toBeCloseTo(37.6, 1);
  });
  it("keeps a small sticker at its requested size", () => {
    const result = getWordAnchoredPlacement(sticker({ size: 6 }), anchor, false);
    expect(result.size).toBe(6);
  });
  it("shrinks toward the floor when there is no room to the right", () => {
    const result = getWordAnchoredPlacement(
      sticker({ size: 20 }),
      { left: 80, right: 95, top: 8, bottom: 30 },
      false,
    );
    expect(result.size).toBe(10);
  });
  it("never lets the placement leave the canvas", () => {
    const result = getWordAnchoredPlacement(sticker({ size: 20 }), anchor, false);
    expect(result.x).toBeGreaterThan(0);
    expect(result.x).toBeLessThan(100);
    expect(result.y).toBeGreaterThan(0);
    expect(result.y).toBeLessThan(100);
  });
  it("places just past the anchor's right edge", () => {
    const result = getWordAnchoredPlacement(sticker({ size: 20 }), anchor, false);
    expect(result.x).toBeGreaterThan(anchor.right);
  });
  it("lifts above the anchor's top edge", () => {
    const result = getWordAnchoredPlacement(sticker({ size: 20 }), anchor, false);
    expect(result.y).toBeLessThan(anchor.top);
  });
  it("is deterministic", () => {
    expect(getWordAnchoredPlacement(sticker(), anchor, false)).toEqual(
      getWordAnchoredPlacement(sticker(), anchor, false),
    );
  });
});

describe("getEmptySpacePlacement", () => {
  it("keeps the requested size when not compact", () => {
    const result = getEmptySpacePlacement(sticker({ size: 20 }), 0, "hello world", { x: 50, y: 50, size: 76 }, false);
    expect(result.size).toBe(20);
  });
  it("caps the size at fourteen when compact", () => {
    const result = getEmptySpacePlacement(sticker({ size: 20 }), 1, "một hai ba", undefined, true);
    expect(result.size).toBe(14);
  });
  it("lands on one of the composition zones", () => {
    const result = getEmptySpacePlacement(sticker(), 0, "hello world", { x: 50, y: 50, size: 76 }, false);
    expect(result.x).toBeGreaterThanOrEqual(0);
    expect(result.x).toBeLessThanOrEqual(100);
    expect(result.y).toBeGreaterThanOrEqual(0);
    expect(result.y).toBeLessThanOrEqual(100);
  });
  it("avoids the centred typography block by choosing a corner-ish zone", () => {
    const result = getEmptySpacePlacement(sticker(), 0, "a long sentence about nothing at all", {
      x: 50,
      y: 50,
      size: 76,
    }, false);
    expect(result).not.toEqual(expect.objectContaining({ x: 50, y: 50 }));
  });
  it("is deterministic for identical inputs", () => {
    const a = getEmptySpacePlacement(sticker(), 0, "hello world", { x: 50, y: 50, size: 76 }, false);
    const b = getEmptySpacePlacement(sticker(), 0, "hello world", { x: 50, y: 50, size: 76 }, false);
    expect(a).toEqual(b);
  });
  it("stays on a composition zone for any sticker index", () => {
    const zones = new Set([17, 20, 50, 80, 81, 52, 76, 24]);
    const first = getEmptySpacePlacement(sticker(), 0, "một hai ba", undefined, false);
    const second = getEmptySpacePlacement(sticker(), 1, "một hai ba", undefined, false);
    expect(zones.has(first.y) || zones.has(first.x)).toBe(true);
    expect(zones.has(second.y) || zones.has(second.x)).toBe(true);
  });
  it("still returns a placement for empty text", () => {
    const result = getEmptySpacePlacement(sticker(), 0, "", undefined, false);
    expect(typeof result.x).toBe("number");
    expect(typeof result.size).toBe("number");
  });
});
