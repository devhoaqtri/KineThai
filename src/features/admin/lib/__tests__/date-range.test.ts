import { describe, expect, it } from "vitest";
import { daysAgo, parseAdminRange, utcToday, type AdminRangePreset } from "../date-range";

const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function utcMs(day: string): number {
  return Date.parse(`${day}T00:00:00.000Z`);
}

function dayDiff(a: string, b: string): number {
  return Math.round((utcMs(b) - utcMs(a)) / DAY_MS);
}

describe("utcToday", () => {
  it("returns a YYYY-MM-DD string", () => {
    expect(utcToday()).toMatch(ISO_DAY);
  });

  it("matches the UTC calendar day of the clock", () => {
    expect(utcToday()).toBe(new Date().toISOString().slice(0, 10));
  });

  it("is exactly daysAgo(0)", () => {
    expect(daysAgo(0)).toBe(utcToday());
  });
});

describe("daysAgo", () => {
  it("returns a valid ISO day key", () => {
    expect(daysAgo(5)).toMatch(ISO_DAY);
  });

  it("steps back one calendar day per unit", () => {
    expect(dayDiff(daysAgo(3), daysAgo(2))).toBe(1);
  });

  it("lands 7 days before today", () => {
    expect(dayDiff(daysAgo(7), utcToday())).toBe(7);
  });

  it("lands 30 days before today", () => {
    expect(dayDiff(daysAgo(30), utcToday())).toBe(30);
  });

  it("crosses a month boundary", () => {
    // Whatever today is, 40 days back must be a real, earlier day.
    expect(utcMs(daysAgo(40))).toBeLessThan(utcMs(utcToday()));
    expect(dayDiff(daysAgo(40), utcToday())).toBe(40);
  });

  it("is monotonic in the argument", () => {
    expect(utcMs(daysAgo(10))).toBeLessThan(utcMs(daysAgo(4)));
  });
});

describe("parseAdminRange", () => {
  it("24h spans exactly one day back", () => {
    const { from, to } = parseAdminRange("24h");
    expect(from).toBe(daysAgo(1));
    expect(to).toBe(utcToday());
  });

  it("7d spans seven days back", () => {
    const { from } = parseAdminRange("7d");
    expect(from).toBe(daysAgo(7));
  });

  it("30d spans thirty days back", () => {
    const { from } = parseAdminRange("30d");
    expect(from).toBe(daysAgo(30));
  });

  it("honours an explicit valid `to` for a preset", () => {
    const { to } = parseAdminRange("7d", undefined, "2026-01-15");
    expect(to).toBe("2026-01-15");
  });

  it("ignores an explicit `from` for the fixed presets", () => {
    // 30d always recomputes from, whatever from is handed in.
    const { from } = parseAdminRange("30d", "1999-12-31");
    expect(from).toBe(daysAgo(30));
  });

  it("falls back to today when `to` is not an ISO day", () => {
    const { to } = parseAdminRange("24h", undefined, "not-a-date");
    expect(to).toBe(utcToday());
  });

  it("custom keeps a valid from and to", () => {
    const { from, to } = parseAdminRange("custom", "2026-02-01", "2026-02-28");
    expect(from).toBe("2026-02-01");
    expect(to).toBe("2026-02-28");
  });

  it("custom defaults from to seven days back when absent", () => {
    const { from } = parseAdminRange("custom");
    expect(from).toBe(daysAgo(7));
  });

  it("custom defaults from to seven days back when malformed", () => {
    const { from } = parseAdminRange("custom", "2026/02/01");
    expect(from).toBe(daysAgo(7));
  });

  it("every preset returns a from no later than its to", () => {
    const presets: AdminRangePreset[] = ["24h", "7d", "30d", "custom"];
    for (const preset of presets) {
      const { from, to } = parseAdminRange(preset);
      expect(utcMs(from)).toBeLessThanOrEqual(utcMs(to));
    }
  });
});
