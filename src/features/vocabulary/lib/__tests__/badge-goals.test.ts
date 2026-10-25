import { describe, expect, it } from "vitest";
import { badgeGoalCriteria, badgeGoalProgress, nextBadgeGoals } from "../badge-goals";
import type { ProgressScope } from "../level-progress";

const ids = (n: number, prefix: string) => Array.from({ length: n }, (_, i) => `${prefix}${i}`);
const scopes: ProgressScope[] = [
  { id: "all", levels: ["A1", "A2", "B1"] },
  { id: "vo-long", levels: ["A1", "A2"] },
  { id: "co-ban", levels: ["A2"] },
  { id: "doc-hieu", levels: ["B1"] },
];
const levelCounts = { A1: 150, A2: 125, B1: 83 };
const describeGoal = (goal: ReturnType<typeof nextBadgeGoals>[number]) =>
  goal.kind === "streak" ? `streak:${goal.days}` : `${goal.scope}:${goal.words}`;

describe("nextBadgeGoals", () => {
  it("offers a fresh reader the broadest goals first", () => {
    const goals = nextBadgeGoals({
      streakEarned: [],
      streakNow: 0,
      wordEarned: new Set(),
      scopes,
      seen: {},
      levelCounts,
    });
    // all:100 and streak:5 both take 5 days; overall words win the tie, then the streak.
    expect(goals.map(describeGoal)).toEqual([
      "all:100",
      "streak:5",
      "vo-long:100",
      "co-ban:100",
      "doc-hieu:83",
    ]);
  });

  it("ranks by distance, and moves past what is earned", () => {
    const goals = nextBadgeGoals({
      streakEarned: [5],
      streakNow: 6,
      wordEarned: new Set(["all:100", "co-ban:100"]),
      scopes,
      seen: { A2: ids(120, "b"), B1: ids(80, "c") },
      levelCounts,
    });
    // all:200 and vo-long:100 are already reached (200 and 120 seen), 0 days, "all" first;
    // co-ban: 5 words to its 125 and doc-hieu: 3 to its 83, a day each; streak:10 is 4.
    expect(goals.map(describeGoal)).toEqual([
      "all:200",
      "vo-long:100",
      "co-ban:125",
      "doc-hieu:83",
      "streak:10",
    ]);
  });

  it("returns at most the limit", () => {
    expect(
      nextBadgeGoals(
        { streakEarned: [], streakNow: 0, wordEarned: new Set(), scopes, seen: {}, levelCounts },
        2,
      ),
    ).toHaveLength(2);
  });
});

describe("badge criteria", () => {
  it("explains a streak and where the reader stands", () => {
    const goal = { kind: "streak", days: 10, current: 3 } as const;
    expect(badgeGoalCriteria(goal, "en")).toContain("10 ngày liền nhau");
    expect(badgeGoalProgress(goal)).toBe("Chuỗi hiện tại: 3/10 ngày");
  });

  it("names a track and its band", () => {
    const goal = {
      kind: "words",
      scope: "vo-long",
      words: 100,
      complete: false,
      seen: 37,
    } as const;
    expect(badgeGoalCriteria(goal, "en")).toContain("vỡ lòng (A1–A2)");
    expect(badgeGoalProgress(goal)).toBe("Đã xem: 37/100 từ");
  });
});
