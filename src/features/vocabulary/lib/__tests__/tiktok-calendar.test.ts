import { describe, expect, it } from "vitest";
import { WORD_HOOK } from "../first-visit";
import {
  LEVEL_ORDERS,
  MAX_HASHTAGS,
  bareCaption,
  CAPTION_HOOK,
  captionFor,
  postIsDay,
  dateOfDay,
  dayOfDate,
  firstPostOnDate,
  parseBurst,
  postNumberIn,
  midnightIndex,
  slotOfPost,
  eligibleWords,
  levelForDay,
  parseDaySpec,
  planDays,
  postsToDraft,
  exportConflicts,
  recordExport,
  postsToPublish,
  postsAwaitingMusic,
  mixedClipPath,
  pickSong,
  publishTimes,
  soundsDirFor,
  youtubeTitle,
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
  it("opens on the hook, then the site's domain and the tags, with no teaser, count or word link", () => {
    const caption = captionFor({ level: "A2", address: "https://anh.chayla.app/w/VSM" });
    expect(caption).toBe(
      "Từ gì mà ...\nHọc thêm mỗi ngày tại https://anh.chayla.app\n\n#hoctienganh #tuvungtienganh #tienganhmoingay #englishvocabulary #a2",
    );
    expect(caption).not.toMatch(/Từ số|Bình luận|Đoán trước|\/w\//);
    expect(caption.match(/#\w+/g)?.length).toBeLessThanOrEqual(MAX_HASHTAGS);
  });

  it("opens on the same words as the clip's hook", () => {
    expect(CAPTION_HOOK).toBe(WORD_HOOK);
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

  it("keeps a day that runs past midnight in its typed order, the late post on the next date", () => {
    const late = { ...schedule, burst: parseBurst("7x3", "13:30,20:30,02:30")! };
    expect(late.burst.times).toEqual(["13:30", "20:30", "02:30"]);
    expect(midnightIndex(["13:30", "20:30", "02:30"])).toBe(2);
    expect(midnightIndex(["11:30", "19:00", "21:30"])).toBe(3);
    expect(midnightIndex(["13:30", "02:30", "20:30"])).toBeNull();
    expect(slotOfPost(late, 10)).toEqual({ date: "2026-11-18", time: "13:30" });
    expect(slotOfPost(late, 11)).toEqual({ date: "2026-11-18", time: "20:30" });
    expect(slotOfPost(late, 12)).toEqual({ date: "2026-11-19", time: "02:30" });
    expect(slotOfPost(late, 21)).toEqual({ date: "2026-11-22", time: "02:30" });
    expect(slotOfPost(late, 22)).toEqual({ date: "2026-11-22", time: "19:00" });
    expect(firstPostOnDate(late, "2026-11-15")).toBe(1);
    expect(firstPostOnDate(late, "2026-11-19")).toBe(12);
    expect(firstPostOnDate(late, "2026-11-22")).toBe(21);
    expect(firstPostOnDate(late, "2026-11-23")).toBe(23);
    for (let post = 1; post <= 40; post += 1) {
      const { date } = slotOfPost(late, post);
      expect(firstPostOnDate(late, date)).toBeLessThanOrEqual(post);
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

  it("runs the publish job at each slot still to come, and the daily time when none is", () => {
    const later = (n: number, date: string, time: string) => post(n, time, { date });
    const cal = calendar([
      later(1, "2026-11-15", "11:30"),
      later(2, "2026-11-16", "21:30"),
      later(3, "2026-11-16", "11:30"),
      later(4, "2026-11-17", "19:00"),
      later(5, "2026-11-18", "19:00"),
    ]);
    expect(publishTimes(cal, "2026-11-16")).toEqual(["11:30", "19:00", "21:30"]);
    expect(publishTimes(cal, "2026-11-17")).toEqual(["19:00"]);
    expect(publishTimes(cal, "2026-12-01")).toEqual(["19:00"]);
  });

  it("holds a post with a proposed song until it is accepted, on that platform only", () => {
    const song = (status: "proposed" | "accepted", name: string | null = "Upbeat.mp3") => ({
      platforms: { facebook: { status: "pending" as const, music: { song: name, startSec: 0, status, at: "x" } } },
    });
    const cal = calendar([
      post(1, "19:00", song("proposed")),
      post(2, "19:00", song("accepted")),
      post(3, "19:00", song("accepted", null)),
      post(4, "19:00"),
    ]);
    expect(postsToPublish(cal, at("19:00"), "facebook").map((d) => d.day)).toEqual([2, 3, 4]);
    expect(postsAwaitingMusic(cal, at("19:00"), "facebook").map((d) => d.day)).toEqual([1]);
    expect(postsAwaitingMusic(cal, at("18:59"), "facebook")).toEqual([]);
    expect(postsToPublish(cal, at("19:00"), "instagram").map((d) => d.day)).toEqual([1, 2, 3, 4]);
  });

  it("titles a Short with the hook alone, never the word, within 100 characters", () => {
    expect(youtubeTitle("Từ gì mà ...")).toBe("Từ gì mà ... #shorts");
    expect([...youtubeTitle("x".repeat(200))].length).toBe(100);
    expect(youtubeTitle("<a> hook")).not.toMatch(/[<>]/);
  });

  it("gives Facebook and YouTube their own song folders", () => {
    const defaults = { facebook: "~/fb", youtube: "~/yt" };
    expect(soundsDirFor({}, "facebook", defaults)).toBe("~/fb");
    expect(soundsDirFor({}, "youtube", defaults)).toBe("~/yt");
    expect(soundsDirFor({ soundsDir: "/a", youtubeSoundsDir: "/b" }, "youtube", defaults)).toBe("/b");
  });

  it("holds a YouTube post on its own proposed song, not Facebook's", () => {
    const cal = calendar([
      post(1, "19:00", { platforms: { youtube: { status: "pending", music: { song: "a.mp3", startSec: 0, status: "proposed", at: "x" } } } }),
    ]);
    expect(postsToPublish(cal, at("19:00"), "youtube")).toEqual([]);
    expect(postsToPublish(cal, at("19:00"), "facebook").map((d) => d.day)).toEqual([1]);
  });

  it("writes the mix beside the clip, named for the platform", () => {
    expect(mixedClipPath("/c/day-008-ceiling.mp4", "facebook")).toBe("/c/day-008-ceiling.facebook.mp4");
    expect(mixedClipPath("/c/day-008-ceiling.mp4", "youtube")).toBe("/c/day-008-ceiling.youtube.mp4");
  });

  it("proposes an unused song first, then the one used longest ago, and varies ties by post", () => {
    const songs = ["a.mp3", "b.mp3", "c.mp3"];
    expect(pickSong([], [], 1)).toBeNull();
    expect(pickSong(songs, [{ song: "a.mp3", day: 1 }, { song: "b.mp3", day: 2 }], 3)).toBe("c.mp3");
    expect(pickSong(songs, [{ song: "a.mp3", day: 4 }, { song: "b.mp3", day: 2 }, { song: "c.mp3", day: 3 }], 5)).toBe("b.mp3");
    expect(pickSong(songs, [], 8)).not.toBe(pickSong(songs, [], 9));
    // A post's own song does not count against it when it is picked again.
    expect(pickSong(["a.mp3", "b.mp3"], [{ song: "a.mp3", day: 7 }, { song: "b.mp3", day: 6 }], 7)).toBe("a.mp3");
  });

  it("posts a platform's own caption when it has one", () => {
    const day = post(1, "19:00", { platforms: { instagram: { status: "pending", caption: "for instagram" } } });
    expect(captionForPlatform(day, "instagram")).toBe("for instagram");
    expect(captionForPlatform(day, "youtube")).toBe("shared");
  });

  it("credits a CC BY song under that platform's text only", () => {
    const music = {
      song: "openverse:x1",
      startSec: 0,
      status: "accepted" as const,
      at: "2026-11-19T00:00:00Z",
      credit: "🎵 “Song” by Someone is licensed under CC BY 4.0.",
    };
    const day = post(1, "19:00", { platforms: { youtube: { status: "pending", music } } });
    expect(captionForPlatform(day, "youtube")).toBe("shared\n\n🎵 “Song” by Someone is licensed under CC BY 4.0.");
    expect(captionForPlatform(day, "facebook")).not.toContain("CC BY");
    // No song, no credit, even if one was left behind.
    const silent = post(2, "19:00", { platforms: { youtube: { status: "pending", music: { ...music, song: null } } } });
    expect(captionForPlatform(silent, "youtube")).toBe("shared");
  });

  it("brings every older caption to the hook, domain and tags on every platform", () => {
    const fresh = captionFor({ level: "B1", address: "https://anh.chayla.app" });
    const teaser = [
      "Từ gì mà ... 🤔 Đoán trước khi đáp án hiện ra!",
      "Từ số 17/365 · trình độ B1",
      "Bình luận đáp án của bạn nhé 👇",
      "Học thêm mỗi ngày tại https://anh.chayla.app",
      "",
      "#hoctienganh #tuvungtienganh #tienganhmoingay #englishvocabulary #b1",
    ].join("\n");
    const wordLink =
      "Học thêm mỗi ngày tại https://anh.chayla.app/w/VSM\n\n#hoctienganh #tuvungtienganh #tienganhmoingay #englishvocabulary #b1";
    expect(bareCaption(teaser)).toBe(fresh);
    expect(bareCaption(wordLink)).toBe(fresh);
    expect(bareCaption(fresh)).toBe(fresh);
    const day = { ...post(17, "20:30"), caption: teaser, code: "VSM" };
    for (const platform of ["facebook", "instagram", "youtube", "threads"] as const) {
      expect(captionForPlatform(day, platform)).toBe(fresh);
    }
  });

  it("recognises a live post by its old markers, or by its text and a time after it was sent", () => {
    const day = { day: 17, code: "VSM" };
    const text = captionFor({ level: "B1", address: "https://anh.chayla.app" });
    const since = "2026-11-21T06:30:00Z";
    expect(postIsDay({ text: "Từ gì mà ... 🤔\nTừ số 17/365 · trình độ B1" }, day, text, null)).toBe(true);
    expect(postIsDay({ text: "Học thêm mỗi ngày tại https://anh.chayla.app/w/VSM\n\n#b1" }, day, text, null)).toBe(true);
    expect(postIsDay({ text: "Học thêm mỗi ngày tại https://anh.chayla.app/w/VSMX" }, day, text, null)).toBe(false);
    expect(postIsDay({ text: "Từ số 7/365" }, day, text, null)).toBe(false);
    expect(postIsDay({}, day, text, since)).toBe(false);
    // The same text: this post only when it went up after it was first sent.
    expect(postIsDay({ text, at: "2026-11-21T06:31:10Z" }, day, text, since)).toBe(true);
    expect(postIsDay({ text: `Title #shorts\n${text}`, at: "2026-11-21T06:31:10Z" }, day, text, since)).toBe(true);
    expect(postIsDay({ text, at: "2026-11-21T01:30:00Z" }, day, text, since)).toBe(false);
    expect(postIsDay({ text, at: "2026-11-21T06:31:10Z" }, day, text, null)).toBe(false);
    expect(postIsDay({ text: text.replace("#b1", "#b2"), at: "2026-11-21T06:31:10Z" }, day, text, since)).toBe(false);
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

describe("postNumberIn", () => {
  it("reads the post from a caption, a Short's title or a description", () => {
    expect(postNumberIn("Từ gì mà ... 🤔 Đoán trước!\nTừ số 10/365 · trình độ B1")).toBe(10);
    expect(postNumberIn("Từ gì mà ... 🤔 Từ số 7/365 · B2 #shorts")).toBe(7);
  });

  it("never takes post 1 for post 10", () => {
    expect(postNumberIn("Từ số 10/365")).not.toBe(1);
    expect(postNumberIn("Từ số 1/365")).toBe(1);
  });

  it("reads accents that came back decomposed", () => {
    expect(postNumberIn("Từ số 12/365".normalize("NFD"))).toBe(12);
  });

  it("is null for text that names no post", () => {
    expect(postNumberIn("Học thêm mỗi ngày")).toBeNull();
    expect(postNumberIn(undefined)).toBeNull();
  });
});
