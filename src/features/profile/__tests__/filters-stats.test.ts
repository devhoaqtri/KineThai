import { describe, expect, it } from "vitest";
import type { MockPost } from "@/features/demo";
import {
  POST_KINDS,
  getTypeCounts,
  getVietnamDateKey,
  getSortedPosts,
  prioritizeVietnamYesterdayPosts,
  seededHash,
  type Engagement,
} from "../lib/filters";
import { formatCount, getProfileCompletion } from "../lib/stats";

const post = (id: string, overrides: Partial<MockPost> = {}): MockPost =>
  ({
    id,
    author_id: "author",
    post_type: "text",
    canvas_html: '{"text":"x"}',
    media_urls: [],
    bg_gradient: "#000",
    created_at: "2026-06-01T00:00:00.000Z",
    ...overrides,
  }) as MockPost;

describe("getSortedPosts", () => {
  const engagement: Record<string, Engagement> = {
    a: { likes: 1, comments: 0 },
    b: { likes: 5, comments: 2 },
    c: { likes: 0, comments: 0 },
  };

  it("leaves the order untouched for the recent sort", () => {
    const posts = [post("a"), post("b"), post("c")];
    expect(getSortedPosts(posts, "recent", engagement, 0).map((p) => p.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
  it("orders by combined engagement for popular", () => {
    const posts = [post("a"), post("b"), post("c")];
    expect(getSortedPosts(posts, "popular", engagement, 0).map((p) => p.id)).toEqual([
      "b",
      "a",
      "c",
    ]);
  });
  it("produces a deterministic order for a given shuffle seed", () => {
    const posts = [post("a"), post("b"), post("c"), post("d")];
    const first = getSortedPosts(posts, "shuffle", engagement, 7).map((p) => p.id);
    const second = getSortedPosts(posts, "shuffle", engagement, 7).map((p) => p.id);
    expect(first).toEqual(second);
  });
  it("can shuffle differently for different seeds", () => {
    const posts = [post("a"), post("b"), post("c"), post("d"), post("e"), post("f")];
    const one = getSortedPosts(posts, "shuffle", engagement, 1).map((p) => p.id);
    const two = getSortedPosts(posts, "shuffle", engagement, 999).map((p) => p.id);
    expect(one).not.toEqual(two);
  });
  it("does not mutate the input array", () => {
    const posts = [post("a"), post("b")];
    getSortedPosts(posts, "popular", engagement, 0);
    expect(posts.map((p) => p.id)).toEqual(["a", "b"]);
  });
  it("treats missing engagement as zero", () => {
    const posts = [post("ghost"), post("a")];
    expect(getSortedPosts(posts, "popular", engagement, 0)[0].id).toBe("a");
  });
});

describe("seededHash", () => {
  it("is stable for the same value and seed", () =>
    expect(seededHash("abc", 1)).toBe(seededHash("abc", 1)));
  it("changes with the seed", () => expect(seededHash("abc", 1)).not.toBe(seededHash("abc", 2)));
  it("changes with the value", () => expect(seededHash("abc", 1)).not.toBe(seededHash("abd", 1)));
  it("returns an unsigned 32-bit number", () => {
    const hash = seededHash("anything", 99);
    expect(hash).toBeGreaterThanOrEqual(0);
    expect(hash).toBeLessThanOrEqual(4294967295);
  });
});

describe("getVietnamDateKey", () => {
  it("formats an ISO string to YYYY-MM-DD", () =>
    expect(getVietnamDateKey("2026-06-01T00:00:00.000Z")).toMatch(/^\d{4}-\d{2}-\d{2}$/));
  it("accepts an epoch number", () =>
    expect(getVietnamDateKey(Date.UTC(2026, 5, 1))).toMatch(/^\d{4}-\d{2}-\d{2}$/));
  it("shifts a UTC midnight into the next Vietnam day", () =>
    expect(getVietnamDateKey("2026-06-01T23:30:00.000Z")).toBe("2026-06-02"));
});

describe("getTypeCounts", () => {
  it("starts every kind at zero", () => {
    const counts = getTypeCounts([]);
    for (const kind of POST_KINDS) expect(counts[kind]).toBe(0);
  });
  it("tallies each known kind", () => {
    const counts = getTypeCounts([
      post("1", { post_type: "text" }),
      post("2", { post_type: "image" }),
      post("3", { post_type: "text" }),
    ]);
    expect(counts.text).toBe(2);
    expect(counts.image).toBe(1);
  });
  it("ignores unknown post types", () => {
    const counts = getTypeCounts([post("1", { post_type: "reel" as MockPost["post_type"] })]);
    expect(Object.values(counts).reduce((sum, n) => sum + n, 0)).toBe(0);
  });
  it("tallies the remaining kinds", () => {
    const counts = getTypeCounts([
      post("1", { post_type: "video" }),
      post("2", { post_type: "slideshow" }),
      post("3", { post_type: "link" }),
    ]);
    expect(counts.video).toBe(1);
    expect(counts.slideshow).toBe(1);
    expect(counts.link).toBe(1);
  });
});

describe("prioritizeVietnamYesterdayPosts", () => {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  it("returns the input when fewer than three yesterday posts exist", () => {
    const posts = [post("a", { created_at: yesterday }), post("b")];
    const result = prioritizeVietnamYesterdayPosts([post("c"), post("d"), ...posts]);
    expect(result.some((p) => p.id === "c")).toBe(true);
  });
  it("lifts three or more yesterday posts to the front", () => {
    const posts = [
      post("y1", { created_at: yesterday }),
      post("y2", { created_at: yesterday }),
      post("y3", { created_at: yesterday }),
      post("old", { created_at: "2020-01-01T00:00:00.000Z" }),
    ];
    const result = prioritizeVietnamYesterdayPosts(posts);
    expect(new Set(result.slice(0, 3).map((p) => p.id))).toEqual(new Set(["y1", "y2", "y3"]));
  });
});

describe("formatCount", () => {
  it("uses standard notation under a thousand", () => expect(formatCount(999)).toBe("999"));
  it("keeps small numbers plain", () => expect(formatCount(0)).toBe("0"));
  it("compacts thousands", () => expect(formatCount(1500)).toMatch(/1\.5/));
  it("compacts millions", () => expect(formatCount(2_400_000)).toMatch(/2\.4/));
});

describe("getProfileCompletion", () => {
  it("scores a fully populated profile at one hundred", () =>
    expect(
      getProfileCompletion({ displayName: "Ann", bio: "hi", avatar: "url", posts: 3 }),
    ).toBe(100));
  it("scores an empty profile at zero", () =>
    expect(
      getProfileCompletion({ displayName: "  ", bio: null, avatar: null, posts: 0 }),
    ).toBe(0));
  it("awards a quarter per satisfied check", () =>
    expect(
      getProfileCompletion({ displayName: "Ann", bio: null, avatar: null, posts: 0 }),
    ).toBe(25));
  it("counts a present avatar even without a bio", () =>
    expect(
      getProfileCompletion({ displayName: "Ann", bio: null, avatar: "url", posts: 1 }),
    ).toBe(75));
  it("scores half when exactly two checks pass", () =>
    expect(
      getProfileCompletion({ displayName: "Ann", bio: "hey", avatar: null, posts: 0 }),
    ).toBe(50));
});
