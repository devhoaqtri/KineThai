import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addMockComment,
  addMockPost,
  getMockDiscover,
  getMockFeed,
  getMockMe,
  getMockNotifications,
  getMockPost,
  getMockProfile,
  searchMock,
  toggleMockFollow,
  toggleMockLike,
  updateMockProfile,
} from "../api";
import { MOCK_ME_ID } from "../seed";
import { getAllMockPosts, getAllMockProfiles, getMockComments } from "../store";

vi.mock("@/features/admin/lib/emit", () => ({
  emitTelemetryEvent: vi.fn(async () => {}),
}));

function createStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
    setItem: (key: string, value: string) => void map.set(key, String(value)),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
    key: (index: number) => [...map.keys()][index] ?? null,
    get length() {
      return map.size;
    },
  } as unknown as Storage;
}

beforeEach(() => {
  vi.stubGlobal("window", { localStorage: createStorage() });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("read APIs", () => {
  it("builds a feed graph referencing only feed posts", () => {
    const feed = getMockFeed();
    expect(feed.posts.length).toBeGreaterThan(0);
    const postIds = new Set(feed.posts.map((post) => post.id));
    for (const likeItem of feed.likes) expect(postIds.has(likeItem.post_id)).toBe(true);
    for (const commentItem of feed.comments) expect(postIds.has(commentItem.post_id)).toBe(true);
  });
  it("caps the discover grid sizes", () => {
    const discover = getMockDiscover();
    expect(discover.posts.length).toBeLessThanOrEqual(36);
    expect(discover.profiles.length).toBeLessThanOrEqual(12);
  });
  it("loads a profile graph by username", () => {
    const data = getMockProfile("demo_creator");
    expect(data.profile.username).toBe("demo_creator");
    expect(typeof data.followers).toBe("number");
    expect(typeof data.totalLikes).toBe("number");
  });
  it("throws for an unknown profile username", () => expect(() => getMockProfile("nope")).toThrow());
  it("loads a single post by id", () => {
    const postId = getAllMockPosts()[0].id;
    const data = getMockPost(postId);
    expect(data.post.id).toBe(postId);
  });
  it("throws for an unknown post id", () => expect(() => getMockPost("missing-post")).toThrow());
  it("returns the signed-in viewer", () => {
    const me = getMockMe();
    expect(me.profile.id).toBe(MOCK_ME_ID);
    expect(me.stats.posts).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(me.followingIds)).toBe(true);
  });
  it("returns a notification list", () => {
    const notifications = getMockNotifications();
    expect(Array.isArray(notifications.items)).toBe(true);
  });
  it("caps the feed and notification lists", () => {
    expect(getMockFeed().posts.length).toBeLessThanOrEqual(60);
    expect(getMockNotifications().items.length).toBeLessThanOrEqual(60);
  });
  it("aggregates profile engagement by post", () => {
    const data = getMockProfile("demo_creator");
    expect(typeof data.engagementByPost).toBe("object");
    expect(data.followers).toBeGreaterThanOrEqual(0);
    expect(data.following).toBeGreaterThanOrEqual(0);
  });
  it("reports the same following count for me and the viewer profile", () => {
    expect(getMockMe().stats.following).toBe(getMockProfile("demo_creator").following);
  });
  it("sorts discover profiles newest first", () => {
    const profiles = getMockDiscover().profiles;
    for (let i = 1; i < profiles.length; i += 1) {
      const prev = profiles[i - 1]!;
      const curr = profiles[i]!;
      if (prev.created_at && curr.created_at) {
        expect(prev.created_at >= curr.created_at).toBe(true);
      }
    }
  });
});

describe("searchMock", () => {
  it("returns empty buckets for a blank query", () =>
    expect(searchMock("   ")).toEqual({ users: [], posts: [] }));
  it("returns empty buckets when nothing matches", () => {
    const result = searchMock("zzzzqqqq-nothing-matches-this");
    expect(result.users).toEqual([]);
    expect(result.posts).toEqual([]);
  });
  it("finds a user by username fragment", () => {
    const result = searchMock("nova");
    expect(result.users.some((profile) => profile.username.includes("nova"))).toBe(true);
  });
  it("caps result sizes", () => {
    const result = searchMock("a");
    expect(result.users.length).toBeLessThanOrEqual(20);
    expect(result.posts.length).toBeLessThanOrEqual(30);
  });
});

describe("mutations", () => {
  it("toggles a like on then off", async () => {
    expect((await toggleMockLike("brand-new-post")).liked).toBe(true);
    expect((await toggleMockLike("brand-new-post")).liked).toBe(false);
  });
  it("toggles a follow on then off", async () => {
    expect((await toggleMockFollow("target-1")).following).toBe(true);
    expect((await toggleMockFollow("target-1")).following).toBe(false);
  });
  it("refuses to follow the viewer", async () => {
    await expect(toggleMockFollow(MOCK_ME_ID)).rejects.toThrow("Cannot follow self");
  });
  it("appends a local comment onto the store", async () => {
    await addMockComment("post-1", "wow");
    const added = getMockComments().find(
      (commentItem) => commentItem.post_id === "post-1" && commentItem.user_id === MOCK_ME_ID,
    );
    expect(added).toBeDefined();
  });
  it("patches the viewer profile", async () => {
    await updateMockProfile({ display_name: "Renamed Viewer" });
    const me = getAllMockProfiles().find((profile) => profile.id === MOCK_ME_ID);
    expect(me?.display_name).toBe("Renamed Viewer");
  });
  it("creates a local post authored by the viewer", () => {
    const post = addMockPost({
      post_type: "text",
      canvas_html: '{"text":"fresh"}',
      bg_gradient: "#123",
    });
    expect(post.author_id).toBe(MOCK_ME_ID);
    expect(post.id.length).toBeGreaterThan(0);
    expect(getAllMockPosts().some((item) => item.id === post.id)).toBe(true);
  });
});
