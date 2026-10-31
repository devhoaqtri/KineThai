import { describe, expect, it } from "vitest";
import {
  badgeGoalCriteria,
  badgeGoalProgress,
  badgeGoalRatio,
  badgeLadders,
  earnedRepeatCount,
  type BadgeRung,
} from "../badge-goals";
import { previousDay, startOfDay } from "../day";
import type { ProgressScope } from "../level-progress";

const ids = (n: number, prefix: string) => Array.from({ length: n }, (_, i) => `${prefix}${i}`);
const scopes: ProgressScope[] = [
  { id: "all", levels: ["A1", "A2", "B1"] },
  { id: "vo-long", levels: ["A1", "A2"] },
  { id: "co-ban", levels: ["A2"] },
  { id: "doc-hieu", levels: ["B1"] },
];
const levelCounts = { A1: 150, A2: 125, B1: 83 };
const describe_ = ({ goal, earned }: BadgeRung) => {
  const name =
    goal.kind === "daily"
      ? `daily:${goal.goal}`
      : goal.kind === "streak"
        ? `streak:${goal.days}`
        : goal.kind === "repeat"
          ? `${goal.of}:${goal.base}x${goal.times}`
          : `${goal.scope}:${goal.words}`;
  return earned ? name : `next ${name}`;
};
const levelScopes: ProgressScope[] = [
  { id: "A1", levels: ["A1"] },
  { id: "A2", levels: ["A2"] },
  { id: "B1", levels: ["B1"] },
];
const fresh = {
  daily: { times: { 10: 0, 25: 0, 50: 0 }, today: 0 },
  streakEarned: [],
  streakNow: 0,
  streakDays: [],
  streakRepeats: [],
  wordEarned: [],
  levelScopes,
  trackScopes: scopes.slice(1),
  seen: {},
  levelCounts,
};

describe("badgeLadders", () => {
  it("gives a fresh reader the first goal of every ladder and nothing more", () => {
    const ladders = badgeLadders(fresh);
    expect(ladders.daily.map(describe_)).toEqual(["next daily:10"]);
    expect(ladders.streak.map(describe_)).toEqual(["next streak:3"]);
    // Nothing read yet: the first level and the first pack stand in.
    expect(ladders.level?.rungs.map(describe_)).toEqual(["next A1:100"]);
    expect(ladders.track?.rungs.map(describe_)).toEqual(["next vo-long:100"]);
  });

  it("lists what is earned lowest first, then only the very next goal", () => {
    const ladders = badgeLadders({
      ...fresh,
      daily: { times: { 10: 4, 25: 1, 50: 0 }, today: 12 },
      streakEarned: [7, 3],
      streakNow: 8,
    });
    expect(ladders.daily.map(describe_)).toEqual([
      "daily:10",
      "daily:25",
      "next daily:50",
      "next daily:10x5",
    ]);
    expect(ladders.streak.map(describe_)).toEqual([
      "streak:3",
      "streak:7",
      "next streak:10",
      "next streak:3x5",
      "next streak:7x3",
    ]);
  });

  it("climbs the 10-word day's repeats 5, 10, 20, showing only the next one", () => {
    const daily = (count: number) =>
      badgeLadders({ ...fresh, daily: { times: { 10: count, 25: 0, 50: 0 }, today: 0 } })
        .daily.filter(({ goal }) => goal.kind === "repeat")
        .map(describe_);
    expect(daily(0)).toEqual([]);
    expect(daily(4)).toEqual(["next daily:10x5"]);
    expect(daily(5)).toEqual(["daily:10x5", "next daily:10x10"]);
    expect(daily(25)).toEqual(["daily:10x5", "daily:10x10", "daily:10x20"]);
  });

  it("counts completed runs from the streak days for the run repeats", () => {
    // Newest first: a 9-day run, a two-day gap, then a 6-day run — three 3-day runs plus two.
    const days: number[] = [startOfDay(Date.now())];
    while (days.length < 17) days.push(previousDay(days.at(-1)!));
    days.splice(9, 2);
    const ladders = badgeLadders({ ...fresh, streakEarned: [3, 7], streakDays: days });
    const repeat = (base: number) =>
      ladders.streak.find(({ goal }) => goal.kind === "repeat" && goal.base === base);
    expect(repeat(3)).toMatchObject({ earned: true, goal: { count: 5, times: 5 } });
    expect(repeat(7)).toMatchObject({ earned: false, goal: { count: 1, times: 3 } });
    // Not shown until the run itself has been earned once.
    expect(repeat(10)).toBeUndefined();
  });

  it("shows the one level and the one pack taken furthest, by share of their size", () => {
    const ladders = badgeLadders({
      ...fresh,
      wordEarned: ["A2:100", "co-ban:100", "B1:83"],
      // A1 60/150, A2 110/125, B1 83/83 (finished, so passed over while others remain).
      seen: { A1: ids(60, "a"), A2: ids(110, "b"), B1: ids(83, "c") },
    });
    expect(ladders.level?.rungs.map(describe_)).toEqual(["A2:100", "next A2:125"]);
    // co-ban (A2 only) 110/125 beats vo-long (A1+A2) 170/275; doc-hieu (B1) is finished.
    expect(ladders.track?.rungs.map(describe_)).toEqual(["co-ban:100", "next co-ban:125"]);
    expect(ladders.track?.rungs.at(-1)?.goal).toMatchObject({ seen: 110 });
  });

  it("counts a rung already passed as earned before it is recorded", () => {
    const ladders = badgeLadders({ ...fresh, seen: { A2: ids(110, "b") } });
    expect(ladders.level?.rungs.map(describe_)).toEqual(["A2:100", "next A2:125"]);
  });

  it("falls back to a finished scope only when every one is finished", () => {
    const ladders = badgeLadders({
      ...fresh,
      levelScopes: [{ id: "B1", levels: ["B1"] }],
      wordEarned: ["B1:83"],
      seen: { B1: ids(83, "c") },
    });
    expect(ladders.level?.rungs.map(describe_)).toEqual(["B1:83"]);
  });
});

describe("a saved repeat badge", () => {
  const rung = (ladders: ReturnType<typeof badgeLadders>) =>
    ladders.streak.find(({ goal }) => goal.kind === "repeat" && goal.base === 3);
  it("stays earned after the days that earned it have aged out", () => {
    const ladders = badgeLadders({ ...fresh, streakEarned: [3], streakRepeats: [3] });
    expect(rung(ladders)?.earned).toBe(true);
  });
  it("is not earned by a run that was never saved", () => {
    expect(rung(badgeLadders({ ...fresh, streakEarned: [3] }))?.earned).toBe(false);
  });
});

describe("earnedRepeatCount", () => {
  it("counts the daily repeats passed and the run repeats saved", () => {
    expect(earnedRepeatCount(12, [3])).toBe(2 + 1);
    expect(earnedRepeatCount(4, [])).toBe(0);
  });
});

describe("badgeGoalRatio", () => {
  it("measures each kind against its own target, capped at 1", () => {
    expect(badgeGoalRatio({ kind: "daily", goal: 25, times: 0, today: 5 })).toBe(0.2);
    expect(badgeGoalRatio({ kind: "streak", days: 10, current: 4 })).toBe(0.4);
    expect(
      badgeGoalRatio({ kind: "words", scope: "A1", words: 100, complete: false, seen: 140 }),
    ).toBe(1);
    expect(
      badgeGoalRatio({ kind: "repeat", of: "streak", base: 7, times: 3, count: 2 }),
    ).toBeCloseTo(2 / 3);
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
