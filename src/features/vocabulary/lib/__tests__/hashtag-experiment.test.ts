import { describe, expect, it } from "vitest";
import {
  EXPERIMENT_FIRST_POST,
  HASHTAG_GROUPS,
  ROUND_POSTS,
  experimentTags,
  rotationTags,
  hashtagReport,
  matchSnapshot,
  parseAgeDays,
  parseViews,
  withExperimentTags,
  type ViewSnapshot,
} from "../../../../../scripts/lib/hashtag-experiment";
import { MAX_HASHTAGS } from "../../../../../scripts/lib/tiktok-calendar";

const round = Array.from({ length: ROUND_POSTS }, (_, i) => experimentTags(EXPERIMENT_FIRST_POST + i)!);

describe("hashtag experiment rotation", () => {
  it("leaves posts before the experiment alone", () => {
    expect(experimentTags(EXPERIMENT_FIRST_POST - 1)).toBeNull();
    expect(withExperimentTags("Từ gì mà ...\n\n#a #b", EXPERIMENT_FIRST_POST - 1)).toBe("Từ gì mà ...\n\n#a #b");
  });

  it("has 25 distinct tags, one per group per post, within TikTok's limit", () => {
    const all = HASHTAG_GROUPS.flatMap((g) => g.tags);
    expect(new Set(all).size).toBe(25);
    for (const tags of round) {
      expect(tags).toHaveLength(MAX_HASHTAGS);
      tags.forEach((tag, s) => expect(HASHTAG_GROUPS[s]!.tags).toContain(tag));
    }
  });

  it("shows every tag 5 times and every cross-group pair once per round", () => {
    const tagCount = new Map<string, number>();
    const pairCount = new Map<string, number>();
    for (const tags of round) {
      for (const t of tags) tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
      for (let s = 0; s < tags.length; s += 1)
        for (let t = s + 1; t < tags.length; t += 1) {
          const key = `${tags[s]} ${tags[t]}`;
          pairCount.set(key, (pairCount.get(key) ?? 0) + 1);
        }
    }
    expect([...tagCount.values()].every((n) => n === 5)).toBe(true);
    expect(pairCount.size).toBe(10 * 25);
    expect([...pairCount.values()].every((n) => n === 1)).toBe(true);
  });

  it("gives every post of a round its own set, and starts again after", () => {
    expect(new Set(round.map((t) => t.join(" "))).size).toBe(ROUND_POSTS);
    expect(experimentTags(EXPERIMENT_FIRST_POST + ROUND_POSTS)).toEqual(round[0]);
  });

  it("gives the retag test the round's far end, apart from the first new posts", () => {
    expect(rotationTags(24)).toEqual(round[24]);
    expect(rotationTags(-1)).toEqual(round[24]);
    const firstNew = new Set(round.slice(0, 7).map((t) => t.join(" ")));
    for (let i = 17; i <= 24; i += 1) expect(firstNew.has(rotationTags(i).join(" "))).toBe(false);
  });

  it("matches by a post's recorded tags when given them", () => {
    const recorded: Record<number, string[]> = { 7: ["#b", "#a"], 9: ["#c"] };
    expect(matchSnapshot(["#a", "#b"], [7, 9], (p) => recorded[p])).toBe(7);
  });

  it("swaps the caption's tag line and keeps the rest", () => {
    const caption = "Từ gì mà ...\nHọc thêm mỗi ngày tại https://anh.chayla.app\n\n#hoctienganh #b2";
    const out = withExperimentTags(caption, EXPERIMENT_FIRST_POST + 7);
    expect(out.split("\n").slice(0, 3)).toEqual(caption.split("\n").slice(0, 3));
    expect(out.split("\n")[3]).toBe(experimentTags(EXPERIMENT_FIRST_POST + 7)!.join(" "));
    expect(withExperimentTags("Từ gì mà ...", EXPERIMENT_FIRST_POST)).toBe(
      `Từ gì mà ...\n\n${round[0]!.join(" ")}`,
    );
  });
});

describe("reading TikTok", () => {
  it("parses age labels and view counts", () => {
    expect(parseAgeDays("· 2d ago")).toBe(2);
    expect(parseAgeDays("5h ago")).toBeCloseTo(5 / 24);
    expect(parseAgeDays("1w ago")).toBe(7);
    expect(parseAgeDays("· 11-14")).toBeNull();
    expect(parseViews("113 views")).toBe(113);
    expect(parseViews("1,204")).toBe(1204);
    expect(parseViews("1.2K")).toBe(1200);
    expect(parseViews("Share")).toBeNull();
  });

  it("matches a video to its post by its tag set, in any order and case", () => {
    const posts = [20, 21, EXPERIMENT_FIRST_POST, EXPERIMENT_FIRST_POST + 3];
    const tags = [...experimentTags(EXPERIMENT_FIRST_POST + 3)!].reverse().map((t) => t.toUpperCase());
    expect(matchSnapshot(tags, posts)).toBe(EXPERIMENT_FIRST_POST + 3);
    expect(matchSnapshot(["#hoctienganh"], posts)).toBeNull();
  });
});

describe("hashtag report", () => {
  const snap = (post: number, views: number, ageDays: number, at: string): ViewSnapshot => ({
    at,
    post,
    views,
    age: `${ageDays}d ago`,
    ageDays,
    tags: experimentTags(post)!,
    caption: "",
  });

  it("measures each post once, at the first snapshot old enough", () => {
    const report = hashtagReport([
      snap(EXPERIMENT_FIRST_POST, 50, 2, "2026-11-24T06:00:00Z"),
      snap(EXPERIMENT_FIRST_POST, 90, 3, "2026-11-25T06:00:00Z"),
      snap(EXPERIMENT_FIRST_POST, 140, 4, "2026-11-26T06:00:00Z"),
    ]);
    expect(report.measured).toEqual([{ post: EXPERIMENT_FIRST_POST, views: 90, ageDays: 3 }]);
  });

  it("ranks the tag on the better posts first in its group", () => {
    const snaps = round.map((_, i) => {
      const post = EXPERIMENT_FIRST_POST + i;
      const hasFyp = experimentTags(post)!.includes("#fyp");
      return snap(post, hasFyp ? 400 : 100, 3, `2026-12-${String(1 + (i % 28)).padStart(2, "0")}T06:00:00Z`);
    });
    const report = hashtagReport(snaps);
    const discovery = report.effects.filter((e) => e.group === "discovery");
    expect(discovery[0]!.tag).toBe("#fyp");
    expect(discovery[0]!.posts).toBe(5);
    expect(discovery[0]!.ratio!).toBeGreaterThan(2);
    expect(report.best).toContain("#fyp");
    // Orthogonal: a tag from another group sat beside #fyp exactly once, so it shows no effect.
    const broad = report.effects.filter((e) => e.group === "learn English (broad)");
    for (const row of broad) expect(row.effect!).toBeCloseTo(0, 5);
  });
});
