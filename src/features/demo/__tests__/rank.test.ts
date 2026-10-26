import { describe, expect, it } from "vitest";
import { buildEngagementByPost, rankMockFeedPosts } from "../rank";
import { MOCK_ME_ID, type MockComment, type MockLike, type MockPost } from "../seed";

const post = (id: string, overrides: Partial<MockPost> = {}): MockPost =>
  ({
    id,
    author_id: `author-${id}`,
    post_type: "text",
    canvas_html: '{"text":"hello"}',
    media_urls: [],
    bg_gradient: "linear-gradient(#000,#111)",
    created_at: "2026-06-01T00:00:00.000Z",
    ...overrides,
  }) as MockPost;

const like = (post_id: string, user_id: string): MockLike => ({
  post_id,
  user_id,
  created_at: "2026-06-01T00:00:00.000Z",
});

const comment = (post_id: string, user_id: string): MockComment =>
  ({
    id: `c-${post_id}-${user_id}`,
    post_id,
    user_id,
    chip_id: "wow",
    created_at: "2026-06-01T00:00:00.000Z",
  }) as MockComment;

describe("buildEngagementByPost", () => {
  it("seeds every post with zero counts", () => {
    const engagement = buildEngagementByPost([post("a"), post("b")], [], []);
    expect(engagement).toEqual({
      a: { likes: 0, comments: 0 },
      b: { likes: 0, comments: 0 },
    });
  });
  it("counts likes per post", () => {
    const engagement = buildEngagementByPost(
      [post("a")],
      [like("a", "u1"), like("a", "u2")],
      [],
    );
    expect(engagement.a.likes).toBe(2);
  });
  it("counts comments per post", () => {
    const engagement = buildEngagementByPost([post("a")], [], [comment("a", "u1")]);
    expect(engagement.a.comments).toBe(1);
  });
  it("ignores engagement that references an unknown post", () => {
    const engagement = buildEngagementByPost([post("a")], [like("ghost", "u1")], []);
    expect(engagement.a.likes).toBe(0);
    expect(engagement.ghost).toBeUndefined();
  });
});

describe("rankMockFeedPosts", () => {
  it("orders by popularity on a cold start", () => {
    const posts = [post("low"), post("high")];
    const likes = [
      like("high", "u1"),
      like("high", "u2"),
      like("high", "u3"),
      like("low", "u4"),
    ];
    const ranked = rankMockFeedPosts({ posts, likes, comments: [], followingIds: [] });
    expect(ranked[0].id).toBe("high");
  });
  it("lifts followed authors above popular strangers once following", () => {
    const posts = [post("popular"), post("friend")];
    const likes = [like("popular", "x1"), like("popular", "x2"), like("friend", "x3")];
    const followingIds = ["author-friend", "other-a", "other-b"];
    const ranked = rankMockFeedPosts({ posts, likes, comments: [], followingIds });
    expect(ranked[0].id).toBe("friend");
  });
  it("treats the viewer's own posts as relationship boosted", () => {
    const posts = [post("mine", { author_id: MOCK_ME_ID }), post("theirs")];
    const likes = [like("theirs", "x1"), like("theirs", "x2")];
    const followingIds = ["a", "b", "c"];
    const ranked = rankMockFeedPosts({ posts, likes, comments: [], followingIds });
    expect(ranked[0].id).toBe("mine");
  });
  it("breaks popularity ties with recency", () => {
    const posts = [
      post("old", { created_at: "2026-01-01T00:00:00.000Z" }),
      post("new", { created_at: "2099-01-01T00:00:00.000Z" }),
    ];
    const ranked = rankMockFeedPosts({ posts, likes: [], comments: [], followingIds: [] });
    expect(ranked[0].id).toBe("new");
  });
  it("does not mutate the input array", () => {
    const posts = [post("a"), post("b")];
    const snapshot = posts.map((p) => p.id);
    rankMockFeedPosts({ posts, likes: [], comments: [], followingIds: [] });
    expect(posts.map((p) => p.id)).toEqual(snapshot);
  });
  it("weights a comment above a like", () => {
    const posts = [post("liked"), post("commented")];
    const ranked = rankMockFeedPosts({
      posts,
      likes: [like("liked", "u1")],
      comments: [comment("commented", "u2")],
      followingIds: [],
    });
    expect(ranked[0].id).toBe("commented");
  });
  it("lets popularity dominate recency on a cold start", () => {
    const posts = [
      post("popular-old", { created_at: "2020-01-01T00:00:00.000Z" }),
      post("quiet-new", { created_at: "2099-01-01T00:00:00.000Z" }),
    ];
    const likes = [like("popular-old", "u1"), like("popular-old", "u2")];
    const ranked = rankMockFeedPosts({ posts, likes, comments: [], followingIds: [] });
    expect(ranked[0].id).toBe("popular-old");
  });
  it("keeps two followed authors ordered by popularity", () => {
    const posts = [
      post("friend-a", { author_id: "f1" }),
      post("friend-b", { author_id: "f1" }),
    ];
    const likes = [like("friend-a", "x1"), like("friend-a", "x2")];
    const ranked = rankMockFeedPosts({
      posts,
      likes,
      comments: [],
      followingIds: ["f1", "z2", "z3"],
    });
    expect(ranked[0].id).toBe("friend-a");
  });
});
