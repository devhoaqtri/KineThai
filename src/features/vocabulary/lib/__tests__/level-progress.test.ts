import { describe, expect, it } from "vitest";
import { LEVEL_GOAL, progressFor, recordLevelProgress } from "../level-progress";

describe("recordLevelProgress", () => {
  it("counts a word once", () => {
    const once = recordLevelProgress({}, "A1", "w1");
    expect(recordLevelProgress(once, "A1", "w1")).toBe(once);
    expect(once.A1).toEqual(["w1"]);
  });

  it("stops at the goal", () => {
    let progress = {};
    for (let i = 0; i < LEVEL_GOAL + 20; i++)
      progress = recordLevelProgress(progress, "B1", `w${i}`);
    expect((progress as { B1: string[] }).B1).toHaveLength(LEVEL_GOAL);
  });
});

describe("progressFor", () => {
  it("caps each level at the goal or its own size", () => {
    const seen = Array.from({ length: 30 }, (_, i) => `w${i}`);
    // A1 has 300 words (goal 100), A2 only 12 (goal 12, more seen than it holds).
    const result = progressFor(["A1", "A2"], { A1: seen, A2: seen }, { A1: 300, A2: 12 });
    expect(result).toEqual({ seen: 42, goal: 112, ratio: 42 / 112 });
  });

  it("is zero for levels with no words", () => {
    expect(progressFor(["C2"], {}, {})).toEqual({ seen: 0, goal: 0, ratio: 0 });
  });
});
