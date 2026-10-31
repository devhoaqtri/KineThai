import { describe, expect, it } from "vitest";
import { previousDay, startOfDay } from "../day";
import { historyDays, historyEntries, historyStats, type HistoryScope } from "../history";

const now = new Date(2026, 9, 29, 18, 0, 0).getTime();
const today = startOfDay(now);
const yesterday = previousDay(today);
const noon = (day: number) => day + 12 * 60 * 60 * 1000;

const ids = (scope: HistoryScope) => historyEntries(history, scope, now).map((entry) => entry.id);

const history = {
  agree: [noon(today)],
  allow: [noon(yesterday), noon(today) - 1000],
  apple: [yesterday - 3 * 24 * 60 * 60 * 1000],
};

describe("historyEntries", () => {
  it("lists today's words newest first and matches the count", () => {
    expect(ids(today)).toEqual(["agree", "allow"]);
    expect(ids(today)).toHaveLength(historyStats(history, now).distinctToday);
  });

  it("keeps yesterday's views out of today", () => {
    expect(ids(yesterday)).toEqual(["allow"]);
    expect(ids(yesterday)).toHaveLength(historyStats(history, now).distinctYesterday);
  });

  it("lists the rolling week newest first, matching the count", () => {
    const week = ids("week");
    expect(week).toEqual(["agree", "allow", "apple"]);
    expect(week).toHaveLength(historyStats(history, now).distinct7d);
  });

  it("counts the views inside the scope only", () => {
    const entry = (scope: HistoryScope) =>
      historyEntries(history, scope, now).find((row) => row.id === "allow");
    expect(entry("week")).toMatchObject({ views: 2, at: noon(today) - 1000 });
    expect(entry(yesterday)).toMatchObject({ views: 1, at: noon(yesterday) });
  });
});

describe("historyDays", () => {
  it("gives seven calendar days ending today, oldest first", () => {
    const days = historyDays(history, now);
    expect(days).toHaveLength(7);
    expect(days.at(-1)).toEqual({ start: today, ids: ["agree", "allow"] });
    expect(days.at(-2)).toEqual({ start: yesterday, ids: ["allow"] });
  });
  it("counts a word once per day it was seen, not once per view", () => {
    const twice = { agree: [noon(today), noon(today) + 1000] };
    expect(historyDays(twice, now).at(-1)!.ids).toEqual(["agree"]);
  });
});
