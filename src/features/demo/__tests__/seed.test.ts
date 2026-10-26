import { describe, expect, it } from "vitest";
import { COMMENT_CHIPS, parseCanvas } from "@/features/canvas";
import { comment } from "../seed/comment-helpers";
import {
  DEMO_TRANSITION_GRADIENTS,
  NOVA_RAE_ID,
  VOCAB_BOT_ID,
  canvas,
} from "../seed/posts/helpers";
import { follow } from "../seed/follows";
import {
  MOCK_COMMENTS,
  MOCK_FOLLOWS,
  MOCK_LIKES,
  MOCK_ME_ID,
  MOCK_POSTS,
  MOCK_PROFILES,
} from "../seed";

describe("canvas helper", () => {
  it("returns a parseable canvas blob", () => {
    const spec = parseCanvas(canvas({}));
    expect(spec.text).toBe("TYPE.");
    expect(spec.font).toBe("Space Grotesk");
  });
  it("applies overrides over the defaults", () => {
    const spec = parseCanvas(canvas({ text: "xin chào", size: 120 }));
    expect(spec.text).toBe("xin chào");
    expect(spec.size).toBe(120);
    expect(spec.font).toBe("Space Grotesk");
  });
});

describe("comment helper", () => {
  it("assembles a comment row from its arguments", () => {
    const row = comment("id-1", "post-1", "user-1", "wow", "2026-06-01T00:00:00.000Z");
    expect(row).toEqual({
      id: "id-1",
      post_id: "post-1",
      user_id: "user-1",
      chip_id: "wow",
      created_at: "2026-06-01T00:00:00.000Z",
    });
  });
});

describe("follow helper", () => {
  it("assembles a follow edge", () => {
    expect(follow("a", "b", "2026-06-01T00:00:00.000Z")).toEqual({
      follower_id: "a",
      following_id: "b",
      created_at: "2026-06-01T00:00:00.000Z",
    });
  });
});

describe("chip-burst comments", () => {
  const burst = MOCK_COMMENTS.slice(0, 5 * 26);
  it("seeds a dense fixed-size burst ahead of the authored comments", () => {
    expect(MOCK_COMMENTS.length).toBeGreaterThan(5 * 26);
    expect(burst).toHaveLength(5 * 26);
  });
  it("uses only known chip ids", () => {
    const chipIds = new Set(COMMENT_CHIPS.map((chip) => chip.id));
    for (const row of burst) expect(chipIds.has(row.chip_id)).toBe(true);
  });
  it("gives every burst comment a distinct id", () => {
    expect(new Set(burst.map((row) => row.id)).size).toBe(burst.length);
  });
  it("stamps an ISO created_at", () =>
    expect(burst[0].created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/));
});

describe("seed collections", () => {
  it("includes the demo viewer among the profiles", () =>
    expect(MOCK_PROFILES.some((profile) => profile.id === MOCK_ME_ID)).toBe(true));
  it("keeps profile ids unique", () => {
    const ids = MOCK_PROFILES.map((profile) => profile.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("gives every profile a username and display name", () => {
    for (const profile of MOCK_PROFILES) {
      expect(profile.username.length).toBeGreaterThan(0);
      expect(profile.display_name.length).toBeGreaterThan(0);
    }
  });
  it("keeps post ids unique", () => {
    const ids = MOCK_POSTS.map((post) => post.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("gives every post an id and a canvas blob", () => {
    for (const post of MOCK_POSTS) {
      expect(post.id.length).toBeGreaterThan(0);
      expect(typeof post.canvas_html).toBe("string");
    }
  });
  it("references only known posts from likes", () => {
    const postIds = new Set(MOCK_POSTS.map((post) => post.id));
    for (const likeItem of MOCK_LIKES) expect(postIds.has(likeItem.post_id)).toBe(true);
  });
  it("references only known posts from comments", () => {
    const postIds = new Set(MOCK_POSTS.map((post) => post.id));
    for (const row of MOCK_COMMENTS) expect(postIds.has(row.post_id)).toBe(true);
  });
  it("references only known profiles from follows", () => {
    const profileIds = new Set(MOCK_PROFILES.map((profile) => profile.id));
    for (const edge of MOCK_FOLLOWS) {
      expect(profileIds.has(edge.follower_id)).toBe(true);
      expect(profileIds.has(edge.following_id)).toBe(true);
    }
  });
  it("seeds a non-empty set of like edges", () => {
    expect(MOCK_LIKES.length).toBeGreaterThan(0);
    for (const likeItem of MOCK_LIKES) expect(likeItem.post_id.length).toBeGreaterThan(0);
  });
  it("carries ISO timestamps on every like and comment", () => {
    for (const likeItem of MOCK_LIKES) expect(likeItem.created_at).toMatch(/^\d{4}-/);
    for (const row of MOCK_COMMENTS) expect(row.created_at).toMatch(/^\d{4}-/);
  });
});

describe("seed constants", () => {
  it("exposes transition gradients", () => expect(DEMO_TRANSITION_GRADIENTS.length).toBeGreaterThan(0));
  it("distinguishes the vocab bot from Nova Rae", () => expect(VOCAB_BOT_ID).not.toBe(NOVA_RAE_ID));
});
