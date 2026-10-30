import { describe, expect, it } from "vitest";
import { previousDay, startOfDay } from "../day";
import { historyStats, historyWordIds } from "../history";

const now = new Date(2026, 9, 29, 18, 0, 0).getTime();
const today = startOfDay(now);
const yesterday = previousDay(today);
const noon = (day: number) => day + 12 * 60 * 60 * 1000;

const history = {
  agree: [noon(today)],
  allow: [noon(yesterday), noon(today) - 1000],
  apple: [yesterday - 3 * 24 * 60 * 60 * 1000],
};

describe("historyWordIds", () => {
  it("lists today's words newest first and matches the count", () => {
    expect(historyWordIds(history, "today", now)).toEqual(["agree", "allow"]);
    expect(historyWordIds(history, "today", now)).toHaveLength(
      historyStats(history, now).distinctToday,
    );
  });

  it("keeps yesterday's views out of today", () => {
    expect(historyWordIds(history, "yesterday", now)).toEqual(["allow"]);
    expect(historyWordIds(history, "yesterday", now)).toHaveLength(
      historyStats(history, now).distinctYesterday,
    );
  });

  it("lists the rolling week newest first, matching the count", () => {
    const ids = historyWordIds(history, "week", now);
    expect(ids).toEqual(["agree", "allow", "apple"]);
    expect(ids).toHaveLength(historyStats(history, now).distinct7d);
  });
});
