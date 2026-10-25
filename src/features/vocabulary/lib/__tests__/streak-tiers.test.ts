import { describe, expect, it } from "vitest";
import {
  STREAK_TIER_LABEL,
  dailyBadgeBlurb,
  dailyBadgeTitle,
  dailyTier,
  streakBlurb,
  streakTier,
} from "../streak-tiers";

describe("streakTier", () => {
  it("strikes day 1 in bronze", () => expect(streakTier(1)).toBe("bronze"));
  it("keeps day 19 in bronze", () => expect(streakTier(19)).toBe("bronze"));
  it("promotes day 20 to silver", () => expect(streakTier(20)).toBe("silver"));
  it("keeps day 49 in silver", () => expect(streakTier(49)).toBe("silver"));
  it("promotes day 50 to gold", () => expect(streakTier(50)).toBe("gold"));
  it("keeps day 149 in gold", () => expect(streakTier(149)).toBe("gold"));
  it("promotes day 150 to diamond", () => expect(streakTier(150)).toBe("diamond"));
  it("keeps day 365 in diamond", () => expect(streakTier(365)).toBe("diamond"));
  it("is monotonic: a longer streak never demotes", () => {
    const order = { bronze: 0, silver: 1, gold: 2, diamond: 3 } as const;
    let previous = -1;
    for (let days = 1; days <= 400; days += 1) {
      const rank = order[streakTier(days)];
      expect(rank).toBeGreaterThanOrEqual(previous);
      previous = rank;
    }
  });
});

describe("STREAK_TIER_LABEL", () => {
  it("labels every tier", () =>
    expect(Object.keys(STREAK_TIER_LABEL).sort()).toEqual(["bronze", "diamond", "gold", "silver"]));
  it("bronze reads Huy hiệu Đồng", () => expect(STREAK_TIER_LABEL.bronze).toBe("Huy hiệu Đồng"));
  it("diamond reads Huy hiệu Kim cương", () =>
    expect(STREAK_TIER_LABEL.diamond).toBe("Huy hiệu Kim cương"));
  it("every label is non-empty", () => {
    for (const label of Object.values(STREAK_TIER_LABEL)) expect(label.length).toBeGreaterThan(0);
  });
});

describe("streakBlurb", () => {
  it("has a written line for day 3", () => expect(streakBlurb(3)).toContain("Ba ngày"));
  it("has a written line for day 7", () => expect(streakBlurb(7)).toContain("một tuần"));
  it("has a written line for day 100", () => expect(streakBlurb(100)).toContain("Một trăm"));
  it("has a written line for day 365", () => expect(streakBlurb(365)).toContain("Trọn một năm"));
  it("falls back to a generic line for day 4", () =>
    expect(streakBlurb(4)).toBe("4 ngày liên tiếp — giữ lửa nhé!"));
  it("falls back for day 999", () => expect(streakBlurb(999)).toContain("999 ngày"));
  it("names the day count in every fallback", () => {
    for (const days of [1, 2, 4, 6, 42, 999]) expect(streakBlurb(days)).toContain(`${days} ngày`);
  });
});

describe("dailyTier", () => {
  it("a 10-word day is bronze", () => expect(dailyTier(10)).toBe("bronze"));
  it("a 24-word day is still bronze", () => expect(dailyTier(24)).toBe("bronze"));
  it("a 25-word day is silver", () => expect(dailyTier(25)).toBe("silver"));
  it("a 49-word day is silver", () => expect(dailyTier(49)).toBe("silver"));
  it("a 50-word day is gold", () => expect(dailyTier(50)).toBe("gold"));
  it("never awards diamond for a daily goal", () => {
    for (const goal of [10, 25, 50, 500]) expect(dailyTier(goal)).not.toBe("diamond");
  });
});

describe("dailyBadgeTitle", () => {
  it("celebrates the first time without a counter", () =>
    expect(dailyBadgeTitle(10, 1)).toBe("10 từ trong một ngày!"));
  it("counts the second time", () =>
    expect(dailyBadgeTitle(25, 2)).toBe("Lần thứ 2: 25 từ trong ngày!"));
  it("counts a large repeat", () =>
    expect(dailyBadgeTitle(50, 30)).toBe("Lần thứ 30: 50 từ trong ngày!"));
});

describe("dailyBadgeBlurb", () => {
  it("explains the counting rule on the first award", () => {
    const blurb = dailyBadgeBlurb(25, 1);
    expect(blurb).toContain("25 từ/ngày");
    expect(blurb).toContain("đếm thêm một lần");
  });
  it("reports the accumulated days afterwards", () => {
    const blurb = dailyBadgeBlurb(10, 4);
    expect(blurb).toContain("4 ngày");
    expect(blurb).toContain("10 từ");
  });
  it("names the goal in every repeat blurb", () => {
    for (const times of [2, 3, 10]) expect(dailyBadgeBlurb(50, times)).toContain("50 từ");
  });
});
