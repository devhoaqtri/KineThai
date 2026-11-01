import { describe, expect, it } from "vitest";
import {
  ALL_SCOPE,
  progressScopes,
  scopeKind,
  scopeLabel,
  wordBadgeBlurb,
  wordBadgeTitle,
  wordTier,
} from "../word-badges";
import type { WordMilestone } from "../level-progress";
import { levelLadderFor } from "../level-ladder";
import { LEVELS } from "../schema";

const milestone = (m: Partial<WordMilestone> = {}): WordMilestone => ({
  scope: ALL_SCOPE,
  words: 100,
  complete: false,
  ...m,
});

describe("ALL_SCOPE", () => {
  it("is the id 'all'", () => expect(ALL_SCOPE).toBe("all"));
});

describe("wordTier", () => {
  it("is bronze under two hundred", () => {
    expect(wordTier(milestone({ words: 100 }))).toBe("bronze");
  });
  it("stays bronze at 199", () => expect(wordTier(milestone({ words: 199 }))).toBe("bronze"));
  it("turns silver at 200", () => expect(wordTier(milestone({ words: 200 }))).toBe("silver"));
  it("keeps silver to 499", () => expect(wordTier(milestone({ words: 499 }))).toBe("silver"));
  it("turns gold at 500", () => expect(wordTier(milestone({ words: 500 }))).toBe("gold"));
  it("stays gold past 500 when unfinished", () =>
    expect(wordTier(milestone({ words: 999 }))).toBe("gold"));
  it("is always diamond for a finished scope, whatever the size", () => {
    for (const words of [100, 250, 635, 12]) {
      expect(wordTier(milestone({ words, complete: true }))).toBe("diamond");
    }
  });
  it("is monotonic as the count grows", () => {
    const order = { bronze: 0, silver: 1, gold: 2, diamond: 3 } as const;
    let previous = -1;
    for (let words = 1; words <= 1000; words += 1) {
      const rank = order[wordTier(milestone({ words }))];
      expect(rank).toBeGreaterThanOrEqual(previous);
      previous = rank;
    }
  });
});

describe("scopeLabel", () => {
  it("names a single level by its code", () => {
    expect(scopeLabel("B1", "en")).toBe("Cấp B1");
    expect(scopeLabel("B1", "en", "ja")).toBe("B1 レベル");
    expect(scopeLabel("B1", "en", "th")).toBe("ระดับ B1");
  });
  it("names a track in the reader's language, never a raw copy key", () => {
    for (const ui of ["ja", "th"] as const) {
      expect(scopeLabel("vo-long", "ja", ui)).not.toContain("difficulty.");
    }
  });
  it("names the whole set 'Tổng cộng'", () =>
    expect(scopeLabel(ALL_SCOPE, "en")).toBe("Tổng cộng"));
  it("returns an unknown scope id verbatim", () =>
    expect(scopeLabel("no-such-scope", "en")).toBe("no-such-scope"));
  it("does not depend on locale for the all scope", () =>
    expect(scopeLabel(ALL_SCOPE, "zh")).toBe(scopeLabel(ALL_SCOPE, "en")));
});

describe("wordBadgeTitle", () => {
  it("proclaims the whole set finished", () =>
    expect(wordBadgeTitle(milestone({ words: 635, complete: true }), "en")).toBe(
      "Trọn bộ từ vựng!",
    ));
  it("counts a broad milestone", () =>
    expect(wordBadgeTitle(milestone({ words: 100 }), "en")).toBe("100 từ đã học!"));
  it("names an unknown track in a count", () =>
    expect(wordBadgeTitle(milestone({ scope: "zz", words: 200 }), "en")).toBe("200 từ zz!"));
  it("proclaims a finished track", () =>
    expect(wordBadgeTitle(milestone({ scope: "zz", words: 150, complete: true }), "en")).toBe(
      "Trọn bộ zz!",
    ));
});

describe("wordBadgeBlurb", () => {
  it("greets finishing the whole set", () =>
    expect(wordBadgeBlurb(milestone({ words: 635, complete: true }), "en")).toContain(
      "mọi từ trong bộ",
    ));
  it("marks the first hundred specially", () =>
    expect(wordBadgeBlurb(milestone({ words: 100 }), "en")).toBe(
      "Trăm từ đầu tiên — hành trình đã thật sự bắt đầu.",
    ));
  it("gives a generic line for a later broad milestone", () =>
    expect(wordBadgeBlurb(milestone({ words: 300 }), "en")).toContain("300"));
  it("celebrates finishing a track", () =>
    expect(wordBadgeBlurb(milestone({ scope: "zz", words: 120, complete: true }), "en")).toContain(
      "zz",
    ));
  it("points to the next rung on an unfinished track", () =>
    expect(wordBadgeBlurb(milestone({ scope: "zz", words: 100 }), "en")).toContain(
      "mốc tiếp theo",
    ));
});

describe("progressScopes", () => {
  it("adds one scope per level that has words, after the tracks", () => {
    const { scopes, levelCounts } = progressScopes("en");
    const levels = scopes.filter((scope) => scopeKind(scope.id, "en") === "level");
    expect(levels.length).toBeGreaterThan(0);
    for (const scope of levels) {
      expect(scope.levels).toEqual([scope.id]);
      expect(levelCounts[scope.levels[0]!]).toBeGreaterThan(0);
    }
    const kinds = scopes.map((scope) => scopeKind(scope.id, "en"));
    expect(kinds.indexOf("level")).toBeGreaterThan(kinds.lastIndexOf("track"));
  });
  it("keeps Japanese school codes out of the Japanese deck's level scopes", () => {
    const levels = progressScopes("ja")
      .scopes.filter((scope) => scopeKind(scope.id, "ja") === "level")
      .map((scope) => scope.id);
    expect(levels.length).toBeGreaterThan(0);
    for (const level of levels) expect(level).toMatch(/^[ABC][12]$/);
  });
  it("lists the whole set first", () => {
    expect(progressScopes("en").scopes[0]!.id).toBe(ALL_SCOPE);
  });
  it("never repeats a scope id", () => {
    const ids = progressScopes("en").scopes.map((scope) => scope.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("gives every scope a non-empty level list", () => {
    for (const scope of progressScopes("en").scopes) expect(scope.levels.length).toBeGreaterThan(0);
  });
  it("reports words per level beside the scopes", () => {
    const { levelCounts } = progressScopes("en");
    expect(Object.keys(levelCounts).length).toBeGreaterThan(0);
  });
  it("only uses levels from the master ladder", () => {
    const { scopes } = progressScopes("en");
    for (const scope of scopes) {
      for (const level of scope.levels)
        expect((LEVELS as readonly string[]).includes(level)).toBe(true);
    }
  });
  // A track keeps its whole band even where the ladder serves only part of it (KineThai's
  // English ladder is A2–B2), so the all scope is pinned to the ladder, not to the tracks.
  it("the all scope is every level the ladder offers", () => {
    const { scopes } = progressScopes("en");
    const all = scopes.find((scope) => scope.id === ALL_SCOPE)!;
    expect(all.levels).toEqual(levelLadderFor("en").levels);
    expect(all.levels.length).toBeGreaterThan(0);
  });
});
