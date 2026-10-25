import { describe, expect, it } from "vitest";
import {
  emptyDailyGoal,
  parseDailyGoal,
  recordDailyWord,
  wordsToday,
  type DailyGoal,
  type DailyGoalStore,
} from "../daily-goal";

const day = (d: number, hour = 12) => new Date(2026, 9, d, hour).getTime();
const words = (n: number, prefix: string) => Array.from({ length: n }, (_, i) => `${prefix}${i}`);
const finish = (store: DailyGoalStore, ids: string[], at: number) => {
  const reached: DailyGoal[] = [];
  for (const id of ids) {
    const result = recordDailyWord(store, id, at);
    store = result.store;
    if (result.reached) reached.push(result.reached);
  }
  return { store, reached };
};

describe("the daily goals", () => {
  it("are met on the 10th, 25th and 50th distinct word of a day", () => {
    const day1 = finish(emptyDailyGoal(), words(60, "a"), day(1));
    expect(day1.reached).toEqual([10, 25, 50]);
    expect(day1.store.times).toEqual({ 10: 1, 25: 1, 50: 1 });
    // Nothing past the largest goal is kept, and a repeat never counts.
    expect(wordsToday(day1.store, day(1))).toBe(50);
    const nine = finish(emptyDailyGoal(), words(9, "b"), day(2)).store;
    expect(recordDailyWord(nine, "b0", day(2)).store).toBe(nine);
  });

  it("count up each day a goal is met, with no need to be consecutive", () => {
    let store = finish(emptyDailyGoal(), words(10, "a"), day(1)).store;
    store = finish(store, words(30, "b"), day(2)).store;
    store = finish(store, words(12, "c"), day(9)).store;
    expect(store.times).toEqual({ 10: 3, 25: 1, 50: 0 });
  });

  it("start each day from zero", () => {
    const yesterday = finish(emptyDailyGoal(), words(7, "a"), day(1)).store;
    expect(wordsToday(yesterday, day(2))).toBe(0);
    expect(finish(yesterday, ["x", "y", "z"], day(2)).reached).toEqual([]);
  });

  it("forget a pending day that is not today when read back", () => {
    const pending = finish(emptyDailyGoal(), ["a", "b"], day(1)).store;
    expect(parseDailyGoal(JSON.stringify(pending), day(1)).pending?.words).toEqual(["a", "b"]);
    expect(parseDailyGoal(JSON.stringify(pending), day(2)).pending).toBeUndefined();
    expect(parseDailyGoal("not json", day(2))).toEqual(emptyDailyGoal());
  });
});
