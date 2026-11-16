import { describe, expect, it } from "vitest";
import {
  LEVEL_ORDERS,
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
  postsToPublish,
  isPostLevel,
  carouselSlides,
  captionForPlatform,
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
  it("climbs a third at a time from B1 when rising", () => {
    expect(levelForDay("rising", 1, "2026-11-15")).toBe("B1");
    expect(levelForDay("rising", 122, "2026-11-15")).toBe("B1");
    expect(levelForDay("rising", 123, "2026-11-15")).toBe("B2");
    expect(levelForDay("rising", 365, "2026-11-15")).toBe("C1");
  });
  it("keeps C1 for the weekend when weekly", () => {
    expect(levelForDay("weekly", 1, "2026-11-14")).toBe("C1"); // Saturday
    expect(levelForDay("weekly", 2, "2026-11-15")).toBe("C1"); // Sunday
    expect(levelForDay("weekly", 3, "2026-11-16")).toBe("B1"); // Monday, odd day
    expect(levelForDay("weekly", 4, "2026-11-17")).toBe("B2");
  });
  it("mixes B1, B2 and C1 in every run of three, never twice in a row, when mixed", () => {
    const levels = Array.from({ length: 365 }, (_, i) => levelForDay("mixed", i + 1, "2026-11-15"));
    for (let i = 0; i + 3 <= 363; i += 3) expect(new Set(levels.slice(i, i + 3)).size).toBe(3);
    for (let i = 1; i < levels.length; i += 1) expect(levels[i]).not.toBe(levels[i - 1]);
    // Not one fixed rotation: the year uses several different runs.
    const runs = new Set(Array.from({ length: 30 }, (_, b) => levels.slice(b * 3, b * 3 + 3).join()));
    expect(runs.size).toBeGreaterThan(3);
  });
  it("never draws below B1 in any order", () => {
    const easy = new Set(["A1", "A2"]);
    for (const order of LEVEL_ORDERS) {
      for (let day = 1; day <= 365; day += 1) {
        expect(easy.has(levelForDay(order, day, dateOfDay("2026-11-15", day)))).toBe(false);
      }
    }
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
      address: "https://anh.chayla.app",
    });
    expect(caption).toContain("Từ số 12/365");
    expect(caption).not.toContain("Ngày");
    expect(caption).toContain("#a2");
    expect(caption).toContain("Học thêm mỗi ngày tại https://anh.chayla.app");
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
    level: "B1",
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

  it("never drafts a word below B1, even one planned before the floor", () => {
    const easy = { ...calendar, days: calendar.days.map((d) => (d.day === 5 ? { ...d, level: "A1" } : d)) };
    expect(postsToDraft(easy, now, 24).ready.map((d) => d.day)).toEqual([2]);
    const unrendered = { ...calendar, days: calendar.days.map((d) => (d.day === 4 ? { ...d, level: "A2" } : d)) };
    expect(postsToDraft(unrendered, now, 24).unrendered).toEqual([]);
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

describe("publishing on Facebook and Instagram", () => {
  const post = (n: number, time: string, extra: Partial<CalendarDay> = {}): CalendarDay => ({
    day: n,
    date: "2026-11-15",
    time,
    wordId: `vi-w${n}`,
    word: `w${n}`,
    code: "ABC",
    level: "B1",
    topic: "t",
    status: "drafted",
    caption: "shared",
    clip: "~/c.mp4",
    durationSec: 50,
    renderedAt: null,
    scheduledAt: null,
    postedAt: null,
    url: null,
    note: null,
    ...extra,
  });
  const calendar = (days: CalendarDay[]): Calendar => ({
    version: 1,
    locale: "en",
    startDate: "2026-11-15",
    postTime: "19:00",
    order: "rising",
    seed: 1,
    clipDir: "~/clips",
    excluded: [],
    days,
  });
  const at = (hhmm: string) => Date.parse(`2026-11-15T${hhmm}:00+07:00`);

  it("never publishes a word below B1 (bottle, A1, went out on 2026-11-16)", () => {
    const cal = calendar([post(1, "19:00", { level: "A1" }), post(2, "19:00", { level: "A2" }), post(3, "19:00", { level: "C1" })]);
    expect(postsToPublish(cal, at("19:05"), "facebook").map((d) => d.day)).toEqual([3]);
  });

  it("publishes a post once its time has come, not before and not hours late", () => {
    const cal = calendar([post(1, "11:30"), post(2, "19:00"), post(3, "21:30")]);
    expect(postsToPublish(cal, at("19:05"), "instagram").map((d) => d.day)).toEqual([2]);
    expect(postsToPublish(cal, at("18:59"), "instagram").map((d) => d.day)).toEqual([]);
    // 11:30 is more than six hours gone by 19:05.
    expect(postsToPublish(cal, at("17:00"), "facebook").map((d) => d.day)).toEqual([1]);
  });

  it("leaves posted, skipped and unrendered posts alone, and retries a failure a few times", () => {
    const cal = calendar([
      post(1, "19:00", { platforms: { facebook: { status: "posted" } } }),
      post(2, "19:00", { platforms: { facebook: { status: "skipped" } } }),
      post(3, "19:00", { status: "planned", clip: null }),
      post(4, "19:00", { platforms: { facebook: { status: "failed", attempts: 1 } } }),
      post(5, "19:00", { platforms: { facebook: { status: "failed", attempts: 3 } } }),
      post(6, "19:00", { platforms: { facebook: { status: "publishing", at: "2026-11-15T11:00:00Z", attempts: 1 } } }),
      post(7, "19:00", { platforms: { facebook: { status: "publishing", at: "2026-11-15T12:00:00Z", attempts: 1 } } }),
    ]);
    // 19:10 Vietnam is 12:10 UTC: post 6 has been "publishing" for over an hour, post 7 for ten minutes.
    expect(postsToPublish(cal, at("19:10"), "facebook").map((d) => d.day)).toEqual([4, 6]);
    // Each platform keeps its own track.
    expect(postsToPublish(cal, at("19:10"), "instagram").map((d) => d.day)).toEqual([1, 2, 4, 5, 6, 7]);
  });

  it("posts a platform's own caption when it has one", () => {
    const day = post(1, "19:00", { platforms: { instagram: { status: "pending", caption: "for instagram" } } });
    expect(captionForPlatform(day, "instagram")).toBe("for instagram");
    expect(captionForPlatform(day, "facebook")).toBe("shared");
  });

  it("does not call the same post on another platform a repeat", () => {
    const list: ExportedWords = { version: 1, words: {} };
    const word = { id: "vi-w1", word: "w1", code: "ABC", level: "A1" };
    recordExport(list, word, { where: "calendar", ref: "post 1", at: "2026-11-15" });
    recordExport(list, word, { where: "instagram", ref: "post 1", at: "2026-11-15" });
    expect(exportConflicts({ days: [post(1, "19:00")] }, list)).toEqual([]);
  });
});

describe("isPostLevel", () => {
  it("lets B1 and harder through, and nothing easier or unknown", () => {
    expect(["A1", "A2"].map(isPostLevel)).toEqual([false, false]);
    expect(["B1", "B2", "C1", "C2"].map(isPostLevel)).toEqual([true, true, true, true]);
    expect(isPostLevel("")).toBe(false);
  });
});

describe("carouselSlides", () => {
  it("takes the numbered JPEGs in page order and nothing beside them", () => {
    expect(carouselSlides(["10.jpg", "alt.txt", "02.jpg", "01.jpg", "caption.txt", "cover.png", "03.jpeg"])).toEqual([
      "01.jpg",
      "02.jpg",
      "03.jpeg",
      "10.jpg",
    ]);
  });
});
