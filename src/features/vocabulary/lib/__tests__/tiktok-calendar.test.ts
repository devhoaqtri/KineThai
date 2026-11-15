import { describe, expect, it } from "vitest";
import {
  MAX_HASHTAGS,
  captionFor,
  dateOfDay,
  dayOfDate,
  firstPostOnDate,
  parseBurst,
  slotOfPost,
  eligibleWords,
  levelForDay,
  parseDaySpec,
  planDays,
  postsToDraft,
  exportConflicts,
  recordExport,
  type ExportedWords,
  summarize,
  todayInVietnam,
  type Calendar,
  type CalendarDay,
  type CandidateWord,
} from "../../../../../scripts/lib/tiktok-calendar";

const word = (id: string, level: string, topic: string): CandidateWord => ({
  id,
  word: id.replace(/^vi-/, ""),
  level,
  topic,
  shareCode: id.toUpperCase().slice(-3),
  ipa: "/x/",
  meaningVi: "nghĩa",
  pos: "noun",
  usage: [{ en: "An _____." }],
});

describe("parseDaySpec", () => {
  it("reads days, ranges and lists", () => {
    expect(parseDaySpec("3")).toEqual([3]);
    expect(parseDaySpec("1-3,5,4-6")).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it("refuses what is not a day", () => {
    expect(() => parseDaySpec("a")).toThrow();
    expect(() => parseDaySpec("5-2")).toThrow();
    expect(() => parseDaySpec("0")).toThrow();
  });
});

describe("dates", () => {
  it("counts days from the start, across a month and a year", () => {
    expect(dateOfDay("2026-11-15", 1)).toBe("2026-11-15");
    expect(dateOfDay("2026-11-15", 17)).toBe("2026-12-01");
    expect(dateOfDay("2026-11-15", 365)).toBe("2027-11-14");
    expect(dayOfDate("2026-11-15", "2027-11-14")).toBe(365);
    expect(dayOfDate("2026-11-15", "2026-11-14")).toBe(0);
  });
  it("takes today in Vietnam, seven hours ahead of UTC", () => {
    expect(todayInVietnam(Date.UTC(2026, 10, 14, 16, 59))).toBe("2026-11-14");
    expect(todayInVietnam(Date.UTC(2026, 10, 14, 17, 0))).toBe("2026-11-15");
  });
});

describe("levelForDay", () => {
  it("climbs a quarter at a time when rising", () => {
    expect(levelForDay("rising", 1, "2026-11-15")).toBe("A1");
    expect(levelForDay("rising", 92, "2026-11-15")).toBe("A1");
    expect(levelForDay("rising", 93, "2026-11-15")).toBe("A2");
    expect(levelForDay("rising", 365, "2026-11-15")).toBe("B2");
  });
  it("keeps B1 and B2 for the weekend when weekly", () => {
    expect(levelForDay("weekly", 1, "2026-11-14")).toBe("B1"); // Saturday
    expect(levelForDay("weekly", 2, "2026-11-15")).toBe("B2"); // Sunday
    expect(levelForDay("weekly", 3, "2026-11-16")).toBe("A1"); // Monday, odd day
    expect(levelForDay("weekly", 4, "2026-11-17")).toBe("A2");
  });
});

describe("eligibleWords", () => {
  it("leaves out an incomplete, reported or broken word", () => {
    const words = [
      word("vi-good", "A1", "t"),
      { ...word("vi-noipa", "A1", "t"), ipa: "" },
      word("vi-reported", "A1", "t"),
      word("vi-agree", "A1", "t"),
      word("vi-broken", "A1", "t"),
    ];
    const kept = eligibleWords(words, new Set(["vi-reported", "agree"]), new Set(["vi-broken"]));
    expect(kept.map((w) => w.id)).toEqual(["vi-good"]);
  });
});

describe("planDays", () => {
  const words = Array.from({ length: 40 }, (_, i) =>
    word(`vi-w${i}`, i < 20 ? "A1" : "A2", `topic${i % 4}`),
  );
  const days = Array.from({ length: 30 }, (_, i) => i + 1);
  const levelOf = (day: number) => (day <= 15 ? "A1" : "A2");

  it("uses each word once, from the day's level, with no topic two days running", () => {
    const plan = planDays({ words, taken: new Map(), dayNumbers: days, levelOf, seed: 1 });
    const picked = days.map((d) => plan.get(d)!);
    expect(new Set(picked.map((w) => w.id)).size).toBe(30);
    for (const d of days) expect(plan.get(d)!.level).toBe(levelOf(d));
    for (let i = 1; i < picked.length; i += 1) expect(picked[i]!.topic).not.toBe(picked[i - 1]!.topic);
  });

  it("plans the same year from the same seed", () => {
    const a = planDays({ words, taken: new Map(), dayNumbers: days, levelOf, seed: 7 });
    const b = planDays({ words, taken: new Map(), dayNumbers: days, levelOf, seed: 7 });
    expect([...a.values()].map((w) => w.id)).toEqual([...b.values()].map((w) => w.id));
  });

  it("refills one day without touching or reusing the others", () => {
    const first = planDays({ words, taken: new Map(), dayNumbers: days, levelOf, seed: 1 });
    const taken = new Map(first);
    taken.delete(5);
    const again = planDays({ words, taken, dayNumbers: [5], levelOf, seed: 2 });
    const replacement = again.get(5)!;
    expect([...taken.values()].map((w) => w.id)).not.toContain(replacement.id);
    expect(replacement.topic).not.toBe(taken.get(4)!.topic);
    expect(replacement.topic).not.toBe(taken.get(6)!.topic);
  });

  it("says when a level has run out", () => {
    expect(() =>
      planDays({ words: words.slice(0, 3), taken: new Map(), dayNumbers: [1, 2, 3, 4], levelOf, seed: 1 }),
    ).toThrow(/A1/);
  });
});

describe("captionFor", () => {
  it("counts the word and names the level, never the word itself", () => {
    const caption = captionFor({
      day: 12,
      total: 365,
      level: "A2",
      hook: "Từ gì mà ...",
      address: "anh.chayla.app",
    });
    expect(caption).toContain("Từ số 12/365");
    expect(caption).not.toContain("Ngày");
    expect(caption).toContain("#a2");
    expect(caption).toContain("anh.chayla.app");
    expect(caption.match(/#\w+/g)?.length).toBeLessThanOrEqual(MAX_HASHTAGS);
  });
});

describe("summarize", () => {
  const day = (n: number, status: CalendarDay["status"]): CalendarDay => ({
    day: n,
    date: dateOfDay("2026-11-15", n),
    wordId: `vi-w${n}`,
    word: `w${n}`,
    code: "ABC",
    level: "A1",
    topic: "t",
    status,
    caption: "",
    clip: null,
    durationSec: null,
    renderedAt: null,
    scheduledAt: null,
    postedAt: null,
    url: null,
    note: null,
  });
  const calendar: Calendar = {
    version: 1,
    locale: "en",
    startDate: "2026-11-15",
    postTime: "19:00",
    order: "rising",
    seed: 1,
    clipDir: "~/clips",
    excluded: [],
    days: [
      day(1, "posted"),
      day(2, "posted"),
      day(3, "scheduled"), // gone, never marked
      day(4, "scheduled"), // today
      day(5, "scheduled"),
      day(6, "rendered"),
      day(7, "planned"),
    ],
  };

  it("finds today's runway, the overdue day and the streak", () => {
    const s = summarize(calendar, "2026-11-18");
    expect(s.todayDay).toBe(4);
    expect(s.scheduledThrough?.day).toBe(5);
    expect(s.renderedThrough?.day).toBe(6);
    expect(s.overdue.map((d) => d.day)).toEqual([3]);
    expect(s.streak).toBe(0);
    expect(summarize(calendar, "2026-11-17").streak).toBe(2);
    expect(s.counts).toEqual({ planned: 1, rendered: 1, drafted: 0, scheduled: 3, posted: 2, missed: 0 });
  });

  it("measures the runway from day 1 before the start", () => {
    const s = summarize({ ...calendar, days: calendar.days.map((d) => ({ ...d, status: "scheduled" as const })) }, "2026-11-10");
    expect(s.todayDay).toBeLessThan(1);
    expect(s.scheduledThrough?.day).toBe(7);
  });
});

describe("postsToDraft", () => {
  const day = (n: number, date: string, time: string, status: CalendarDay["status"]): CalendarDay => ({
    day: n,
    date,
    time,
    wordId: `vi-w${n}`,
    word: `w${n}`,
    code: "ABC",
    level: "A1",
    topic: "t",
    status,
    caption: "",
    clip: status === "planned" ? null : "~/c.mp4",
    durationSec: null,
    renderedAt: null,
    scheduledAt: null,
    postedAt: null,
    url: null,
    note: null,
  });
  const calendar: Calendar = {
    version: 1,
    locale: "en",
    startDate: "2026-11-14",
    postTime: "19:00",
    order: "rising",
    seed: 1,
    clipDir: "~/clips",
    excluded: [],
    days: [
      day(1, "2026-11-14", "19:00", "rendered"), // yesterday: overdue, not due
      day(2, "2026-11-15", "11:30", "rendered"), // passed this morning: still drafted
      day(3, "2026-11-15", "19:00", "drafted"), // already done
      day(4, "2026-11-15", "21:30", "planned"), // due, no clip
      day(5, "2026-11-16", "06:00", "rendered"), // inside the window
      day(6, "2026-11-16", "11:30", "rendered"), // beyond it
    ],
  };
  // 07:00 on 15 Nov in Vietnam.
  const now = Date.parse("2026-11-15T07:00:00+07:00");

  it("drafts today's and the window's rendered posts, and names the ones with no clip", () => {
    const { ready, unrendered } = postsToDraft(calendar, now, 24);
    expect(ready.map((d) => d.day)).toEqual([2, 5]);
    expect(unrendered.map((d) => d.day)).toEqual([4]);
  });

  it("reads the date in Vietnam, not on the machine's clock", () => {
    // 23:30 UTC on the 14th is already 06:30 on the 15th in Vietnam, so post 1 (the 14th) is past.
    const { ready } = postsToDraft(calendar, Date.parse("2026-11-14T23:30:00Z"), 6);
    expect(ready.map((d) => d.day)).toEqual([2]);
  });
});

describe("the opening burst", () => {
  const schedule = {
    startDate: "2026-11-15",
    postTime: "19:00",
    burst: { days: 7, perDay: 3, times: ["11:30", "19:00", "21:30"] },
  };

  it("reads a burst as typed, and none", () => {
    expect(parseBurst("7x3", "19:00, 11:30,21:30")).toEqual(schedule.burst);
    expect(parseBurst("none", "")).toBeNull();
    expect(() => parseBurst("7x3", "11:30,19:00")).toThrow(/3 times/);
    expect(() => parseBurst("7-3", "11:30,19:00,21:30")).toThrow(/DAYSxPERDAY/);
    expect(() => parseBurst("7x3", "11:30,19:00,25:00")).toThrow(/HH:MM/);
  });

  it("puts three posts on each of the first 7 days, then one a day", () => {
    expect(slotOfPost(schedule, 1)).toEqual({ date: "2026-11-15", time: "11:30" });
    expect(slotOfPost(schedule, 3)).toEqual({ date: "2026-11-15", time: "21:30" });
    expect(slotOfPost(schedule, 4)).toEqual({ date: "2026-11-16", time: "11:30" });
    expect(slotOfPost(schedule, 21)).toEqual({ date: "2026-11-21", time: "21:30" });
    expect(slotOfPost(schedule, 22)).toEqual({ date: "2026-11-22", time: "19:00" });
    expect(slotOfPost(schedule, 23)).toEqual({ date: "2026-11-23", time: "19:00" });
  });

  it("finds the first post of any date, before, in and after the burst", () => {
    expect(firstPostOnDate(schedule, "2026-11-14")).toBe(0);
    expect(firstPostOnDate(schedule, "2026-11-15")).toBe(1);
    expect(firstPostOnDate(schedule, "2026-11-17")).toBe(7);
    expect(firstPostOnDate(schedule, "2026-11-22")).toBe(22);
    expect(firstPostOnDate(schedule, "2026-11-30")).toBe(30);
    for (let post = 1; post <= 40; post += 1) {
      const { date } = slotOfPost(schedule, post);
      expect(firstPostOnDate(schedule, date)).toBeLessThanOrEqual(post);
    }
  });

  it("without a burst is one a day, as before", () => {
    const plain = { startDate: "2026-11-15", postTime: "19:00" };
    expect(slotOfPost(plain, 17)).toEqual({ date: dateOfDay("2026-11-15", 17), time: "19:00" });
    expect(firstPostOnDate(plain, "2026-12-01")).toBe(dayOfDate("2026-11-15", "2026-12-01"));
  });
});

describe("exported words", () => {
  const day = (n: number, wordId: string): CalendarDay => ({
    day: n,
    date: dateOfDay("2026-11-15", n),
    wordId,
    word: wordId.slice(3),
    code: "ABC",
    level: "A1",
    topic: "t",
    status: "planned",
    caption: "",
    clip: null,
    durationSec: null,
    renderedAt: null,
    scheduledAt: null,
    postedAt: null,
    url: null,
    note: null,
  });
  const w = (id: string) => ({ id, word: id.slice(3), code: "ABC", level: "A1" });

  it("records an export once, and never the same one twice", () => {
    const list: ExportedWords = { version: 1, words: {} };
    expect(recordExport(list, w("vi-kit"), { where: "carousel", ref: "exports/carousel/x-JPV-4x5", at: "2026-10-31" })).toBe(true);
    expect(recordExport(list, w("vi-kit"), { where: "carousel", ref: "exports/carousel/x-JPV-4x5", at: "2026-11-01" })).toBe(false);
    expect(recordExport(list, w("vi-kit"), { where: "tiktok", ref: "a post", at: "2026-11-02" })).toBe(true);
    expect(list.words["vi-kit"]!.exports).toHaveLength(2);
  });

  it("flags a day whose word went out elsewhere, but not the day's own calendar clip", () => {
    const list: ExportedWords = { version: 1, words: {} };
    recordExport(list, w("vi-good"), { where: "calendar", ref: "post 1", at: "2026-11-15" });
    recordExport(list, w("vi-kit"), { where: "carousel", ref: "folder", at: "2026-10-31" });
    const clashes = exportConflicts({ days: [day(1, "vi-good"), day(2, "vi-kit"), day(3, "vi-mess")] }, list);
    expect(clashes.map((c) => c.day.day)).toEqual([2]);
    // The same calendar clip on another post is a repeat too.
    expect(exportConflicts({ days: [day(9, "vi-good")] }, list).map((c) => c.day.day)).toEqual([9]);
  });
});
