import { describe, expect, it } from "vitest";
import {
  ASSEMBLY_HOLD_SECONDS,
  assemblyPlan,
  hangulAssemblyDurationMs,
  type AssemblySegment,
} from "../hangul-assembly";
import { SPELLING_REDUCED_MOTION_MS } from "../spelling";

type Block = Extract<AssemblySegment, { kind: "block" }>;
const blocks = (word: string) =>
  assemblyPlan(word).segments.filter((segment): segment is Block => segment.kind === "block");

describe("assemblyPlan", () => {
  it("assembles a wrapping vowel from its two strokes, colour by role", () => {
    expect(blocks("괜").map((block) => block.pieces.map((p) => `${p.letter}:${p.role}`))).toEqual([
      ["ㄱ:initial", "ㅗ:vowel", "ㅐ:vowel", "ㄴ:final"],
    ]);
  });

  it("keeps a double final as the one letter it is written as", () =>
    expect(blocks("값")[0]!.pieces.map((piece) => piece.letter)).toEqual(["ㄱ", "ㅏ", "ㅄ"]));

  it("shows every letter at the finished block's size, one em apart", () => {
    const block = blocks("학")[0]!;
    expect(block.looseWidth).toBe(block.pieces.length);
    block.pieces.forEach((piece, index) => {
      expect(piece.loose).toEqual({ x: index, y: 0 });
      expect(piece.packed).not.toHaveProperty("scaleX");
      expect(piece.packed).not.toHaveProperty("scale");
    });
  });

  it("settles a final across the bottom and an initial at the top", () => {
    const [initial, , final] = blocks("학")[0]!.pieces;
    expect(initial!.packed.y).toBeLessThan(0);
    expect(final!.packed.y).toBeGreaterThan(0);
    expect(final!.packed.x).toBeCloseTo(0);
  });

  it("starts each block as the previous one merges, at a readable pace", () => {
    const plan = assemblyPlan("학교");
    const [first, second] = blocks("학교");
    expect(second!.start).toBeCloseTo(first!.start + first!.mergeAt);
    for (const block of [first!, second!]) {
      expect(block.combineAt).toBeGreaterThan(Math.max(...block.pieces.map((p) => p.snapAt)));
      expect(block.fadeAt).toBeGreaterThan(block.combineAt);
      expect(block.mergeAt).toBeGreaterThan(block.fadeAt);
      expect(block.end).toBeGreaterThan(block.mergeAt);
    }
    expect(plan.seconds).toBeCloseTo(second!.start + second!.end);
    expect(plan.seconds).toBeGreaterThan(4);
    expect(plan.seconds).toBeLessThan(5.5);
  });

  it("passes text through and gives it no time", () => {
    const plan = assemblyPlan("K-pop 노래");
    expect(plan.segments[0]).toEqual({ kind: "text", text: "K-pop " });
    expect(plan.seconds).toBeCloseTo(assemblyPlan("노래").seconds);
  });
});

describe("hangulAssemblyDurationMs", () => {
  it("covers every block plus the hold", () =>
    expect(hangulAssemblyDurationMs("학교", false)).toBe(
      Math.round((assemblyPlan("학교").seconds + ASSEMBLY_HOLD_SECONDS) * 1000),
    ));
  it("uses the shared still duration under reduced motion", () =>
    expect(hangulAssemblyDurationMs("학교", true)).toBe(SPELLING_REDUCED_MOTION_MS));
});
