import { describe, expect, it } from "vitest";
import { buildStripWindow, isBackdropJump } from "../post-background";

describe("isBackdropJump", () => {
  it("glides a one-page turn either way", () => {
    expect(isBackdropJump(2, 3)).toBe(false);
    expect(isBackdropJump(3, 2)).toBe(false);
  });
  it("cuts the reveal jump from the first clue", () => expect(isBackdropJump(0, 5)).toBe(true));
  it("cuts a replay from the spelling coda back to the start", () =>
    expect(isBackdropJump(6, 0)).toBe(true));
});

describe("buildStripWindow", () => {
  const cycle = ["#111111", "#222222", "#333333", "#444444", "#555555", "#666666", "#777777"];
  const colorsIn = (gradient: string) => gradient.match(/#[0-9a-f]{6}/gi) ?? [];

  it("holds only the colours of its own segments", () => {
    // Segments 2..5 run from colour 2 to colour 6: nothing before or after.
    expect(colorsIn(buildStripWindow(cycle, 2, 4))).toEqual([
      "#333333",
      "#444444",
      "#555555",
      "#666666",
      "#777777",
    ]);
  });

  it("a page turn's window holds the two bands it moves between and their margins only", () => {
    // Turning from page 3 to 4 paints segments 2..5; page 0's or page 6's colours are absent.
    const turn = colorsIn(buildStripWindow(cycle, 2, 4));
    expect(turn).not.toContain("#111111");
    expect(new Set(turn).size).toBe(5);
  });

  it("wraps the cycle both ways, so page 0 has a band before it", () => {
    expect(colorsIn(buildStripWindow(cycle, -1, 3))).toEqual([
      "#777777",
      "#111111",
      "#222222",
      "#333333",
    ]);
  });

  it("puts the in-between blend inside each segment, ends at 0% and 100%", () => {
    const window = buildStripWindow(cycle, 0, 2, () => ["#abcdef"]);
    expect(window).toMatch(/^linear-gradient\(100deg, #111111 0\.000%, #abcdef 25\.0000%/);
    expect(window).toMatch(/#333333 100\.000%\)$/);
  });
});
