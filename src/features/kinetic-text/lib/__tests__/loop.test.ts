import { describe, expect, it } from "vitest";
import { TEMPO_LOOP_SECONDS, getLoopAnimation } from "../loop";

describe("TEMPO_LOOP_SECONDS", () => {
  it("slows to 3.4s", () => expect(TEMPO_LOOP_SECONDS.slow).toBe(3.4));
  it("holds steady at 2.4s", () => expect(TEMPO_LOOP_SECONDS.steady).toBe(2.4));
  it("snaps to 1.45s", () => expect(TEMPO_LOOP_SECONDS.snappy).toBe(1.45));
  it("orders slow > steady > snappy", () => {
    expect(TEMPO_LOOP_SECONDS.slow).toBeGreaterThan(TEMPO_LOOP_SECONDS.steady);
    expect(TEMPO_LOOP_SECONDS.steady).toBeGreaterThan(TEMPO_LOOP_SECONDS.snappy);
  });
});

describe("getLoopAnimation", () => {
  it("returns undefined for no loop", () =>
    expect(getLoopAnimation("none", "steady")).toBeUndefined());
  it("builds a pulse shorthand", () =>
    expect(getLoopAnimation("pulse", "steady")).toBe("kinetic-pulse 2.4s ease-in-out infinite"));
  it("builds a float shorthand at the slow tempo", () =>
    expect(getLoopAnimation("float", "slow")).toBe("kinetic-float 3.4s ease-in-out infinite"));
  it("builds a shake shorthand at the snappy tempo", () =>
    expect(getLoopAnimation("shake", "snappy")).toBe("kinetic-shake 1.45s ease-in-out infinite"));
  it("names the loop in the animation", () => {
    for (const loop of ["pulse", "float", "shake"] as const)
      expect(getLoopAnimation(loop, "steady")).toContain(`kinetic-${loop}`);
  });
  it("always loops infinitely when not none", () => {
    for (const loop of ["pulse", "float", "shake"] as const)
      expect(getLoopAnimation(loop, "slow")).toContain("infinite");
  });
});
