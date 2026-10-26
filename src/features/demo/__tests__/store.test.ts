import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FOLLOWING_KEY,
  LIKED_POSTS_KEY,
  LOCAL_POSTS_KEY,
  PROFILE_PATCH_KEY,
  getAllMockPosts,
  getAllMockProfiles,
  getMockComments,
  getMockFollows,
  getMockLikes,
  getStorage,
  hasStorageValue,
  makeUuid,
  readFollowingIds,
  readJson,
  readJsonArray,
  readLikedPostIds,
  removeStorage,
  resetMockRuntimeData,
  writeJson,
  writeJsonArray,
} from "../store";
import { MOCK_ME_ID, MOCK_PROFILES } from "../seed";

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

describe("storage access", () => {
  it("exposes a storage object when window exists", () => expect(getStorage()).not.toBeNull());
  it("returns the fallback when a key is absent", () =>
    expect(readJson("missing", { a: 1 })).toEqual({ a: 1 }));
  it("round-trips a JSON value", () => {
    writeJson(PROFILE_PATCH_KEY, { display_name: "X" });
    expect(readJson(PROFILE_PATCH_KEY, null)).toEqual({ display_name: "X" });
  });
  it("clears and falls back on malformed JSON", () => {
    getStorage()?.setItem("bad", "{nope");
    expect(readJson("bad", "fallback")).toBe("fallback");
    expect(hasStorageValue("bad")).toBe(false);
  });
  it("reports presence only for stored keys", () => {
    expect(hasStorageValue(LIKED_POSTS_KEY)).toBe(false);
    writeJsonArray(LIKED_POSTS_KEY, ["p1"]);
    expect(hasStorageValue(LIKED_POSTS_KEY)).toBe(true);
  });
  it("removes a key", () => {
    writeJson("temp", 1);
    removeStorage("temp");
    expect(hasStorageValue("temp")).toBe(false);
  });
});

describe("readJsonArray", () => {
  it("returns an empty array for a missing key", () => expect(readJsonArray("nope")).toEqual([]));
  it("returns the stored array", () => {
    writeJsonArray(LOCAL_POSTS_KEY, [{ id: "1" }, { id: "2" }]);
    expect(readJsonArray(LOCAL_POSTS_KEY)).toHaveLength(2);
  });
  it("returns an empty array when the value is not an array", () => {
    writeJson("obj", { not: "array" });
    expect(readJsonArray("obj")).toEqual([]);
  });
});

describe("makeUuid", () => {
  it("returns a distinct id per call", () => expect(makeUuid()).not.toBe(makeUuid()));
});

describe("seed defaults without overlays", () => {
  it("lists every seed profile", () => expect(getAllMockProfiles()).toHaveLength(MOCK_PROFILES.length));
  it("returns seed posts newest first", () => {
    const posts = getAllMockPosts();
    expect(posts.length).toBeGreaterThan(0);
    for (let i = 1; i < posts.length; i += 1) {
      expect(posts[i - 1].created_at >= posts[i].created_at).toBe(true);
    }
  });
  it("returns comments oldest first", () => {
    const comments = getMockComments();
    for (let i = 1; i < comments.length; i += 1) {
      expect(comments[i - 1].created_at <= comments[i].created_at).toBe(true);
    }
  });
  it("merges likes without duplicating the viewer's seed likes", () => {
    const likes = getMockLikes();
    expect(likes.length).toBeGreaterThan(0);
    for (const likeItem of likes) {
      expect(typeof likeItem.post_id).toBe("string");
      expect(typeof likeItem.user_id).toBe("string");
    }
  });
  it("reads the viewer's default following ids from the seed", () => {
    const followingIds = readFollowingIds();
    expect(Array.isArray(followingIds)).toBe(true);
  });
  it("reads the viewer's default liked posts from the seed", () => {
    const liked = readLikedPostIds();
    expect(Array.isArray(liked)).toBe(true);
    expect(new Set(liked).size).toBe(liked.length);
  });
  it("returns the merged follow edges", () => expect(getMockFollows().length).toBeGreaterThan(0));
});

describe("local overlays", () => {
  it("prepends a stored local post ahead of the seed", () => {
    writeJsonArray(LOCAL_POSTS_KEY, [
      {
        id: "local-1",
        author_id: MOCK_ME_ID,
        post_type: "text",
        canvas_html: '{"text":"local"}',
        media_urls: [],
        bg_gradient: "#000",
        created_at: "2099-01-01T00:00:00.000Z",
      },
    ]);
    expect(getAllMockPosts()[0].id).toBe("local-1");
  });
  it("applies a profile patch to the viewer only", () => {
    writeJson(PROFILE_PATCH_KEY, { display_name: "Patched Name" });
    const profiles = getAllMockProfiles();
    const me = profiles.find((profile) => profile.id === MOCK_ME_ID);
    const other = profiles.find((profile) => profile.id !== MOCK_ME_ID);
    expect(me?.display_name).toBe("Patched Name");
    expect(other?.display_name).not.toBe("Patched Name");
  });
  it("resets overlays back to the seed", () => {
    writeJsonArray(LIKED_POSTS_KEY, ["a", "b"]);
    resetMockRuntimeData();
    expect(hasStorageValue(LIKED_POSTS_KEY)).toBe(false);
    expect(hasStorageValue(FOLLOWING_KEY)).toBe(false);
    expect(hasStorageValue(PROFILE_PATCH_KEY)).toBe(false);
  });
});
