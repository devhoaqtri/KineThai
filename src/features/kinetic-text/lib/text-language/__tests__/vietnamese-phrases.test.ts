import { describe, expect, it } from "vitest";
import {
  VIETNAMESE_BOUND_PHRASE_KEYS,
  VIETNAMESE_POETIC_EMPHASIS_KEYS,
  expandEmphasisToBoundPhrases,
  getBoundPhraseEmphasisSeed,
  getBoundPhraseLength,
  getBoundPhraseStartIndex,
  getCompoundTokenKey,
  getSpecialPoeticWordIndexes,
  isLikelyVietnameseText,
  normalizeVietnameseToken,
  repairSplitCompoundEmphasis,
} from "../vietnamese-phrases";

describe("normalizeVietnameseToken", () => {
  it("strips diacritics", () => expect(normalizeVietnameseToken("tiếng")).toBe("tieng"));
  it("maps đ to d", () => expect(normalizeVietnameseToken("đẹp")).toBe("dep"));
  it("maps a capital Đ to d", () => expect(normalizeVietnameseToken("Đà")).toBe("da"));
  it("lowercases", () => expect(normalizeVietnameseToken("HÀ")).toBe("ha"));
  it("drops punctuation", () => expect(normalizeVietnameseToken("anh,")).toBe("anh"));
  it("drops surrounding spaces", () => expect(normalizeVietnameseToken("  anh  ")).toBe("anh"));
  it("keeps digits", () => expect(normalizeVietnameseToken("số1")).toBe("so1"));
  it("returns empty for a punctuation-only token", () => expect(normalizeVietnameseToken("…")).toBe(""));
  it("is idempotent", () => {
    const once = normalizeVietnameseToken("Hình Ảnh");
    expect(normalizeVietnameseToken(once)).toBe(once);
  });
});

describe("getCompoundTokenKey", () => {
  it("preserves diacritics so nền and nên stay distinct", () =>
    expect(getCompoundTokenKey("nền")).not.toBe(getCompoundTokenKey("nên")));
  it("keeps những distinct from nhưng", () =>
    expect(getCompoundTokenKey("những")).not.toBe(getCompoundTokenKey("nhưng")));
  it("lowercases", () => expect(getCompoundTokenKey("ANH")).toBe("anh"));
  it("strips trailing punctuation", () => expect(getCompoundTokenKey("anh.")).toBe("anh"));
  it("keeps Vietnamese tone marks intact", () => expect(getCompoundTokenKey("tiếng")).toBe("tiếng"));
  it("keeps digits", () => expect(getCompoundTokenKey("10")).toBe("10"));
  it("strips a hyphen", () => expect(getCompoundTokenKey("a-b")).toBe("ab"));
});

describe("isLikelyVietnameseText", () => {
  it("detects tone-marked text", () => expect(isLikelyVietnameseText("tiếng việt")).toBe(true));
  it("detects the đ stroke", () => expect(isLikelyVietnameseText("đẹp")).toBe(true));
  it("detects an accent-free bound phrase", () => expect(isLikelyVietnameseText("y tuong")).toBe(true));
  it("rejects plain English", () => expect(isLikelyVietnameseText("hello world")).toBe(false));
  it("rejects the empty string", () => expect(isLikelyVietnameseText("")).toBe(false));
  it("rejects Han text", () => expect(isLikelyVietnameseText("我爱你")).toBe(false));
  it("detects a compound word like học sinh", () => expect(isLikelyVietnameseText("học sinh")).toBe(true));
});

describe("getBoundPhraseLength", () => {
  it("spans a known bound pair", () =>
    expect(getBoundPhraseLength(["hình", "ảnh"], 0)).toBe(2));
  it("spans an accent-free bound pair", () =>
    expect(getBoundPhraseLength(["y", "tuong"], 0)).toBe(2));
  it("returns 1 for a non-bound pair", () =>
    expect(getBoundPhraseLength(["the", "quick"], 0)).toBe(1));
  it("returns 1 for a single trailing token", () =>
    expect(getBoundPhraseLength(["hình", "ảnh"], 1)).toBe(1));
  it("returns 1 at the end of the array", () =>
    expect(getBoundPhraseLength(["hình"], 0)).toBe(1));
  it("finds a bound pair that starts later in the page", () =>
    expect(getBoundPhraseLength(["nói", "về", "hình", "ảnh"], 2)).toBe(2));
  it("honours a data-annotated phrase key", () =>
    expect(getBoundPhraseLength(["thực", "sự"], 0, [["thực", "sự"]])).toBe(2));
  it("ignores a phrase key that does not match", () =>
    expect(getBoundPhraseLength(["thực", "sự"], 0, [["khác", "nhau"]])).toBe(1));
});

describe("getBoundPhraseStartIndex", () => {
  it("returns the phrase head for its first syllable", () =>
    expect(getBoundPhraseStartIndex(["hình", "ảnh"], 0)).toBe(0));
  it("returns the phrase head for its second syllable", () =>
    expect(getBoundPhraseStartIndex(["hình", "ảnh"], 1)).toBe(0));
  it("returns the index itself for a solo token", () =>
    expect(getBoundPhraseStartIndex(["nói", "về", "hình", "ảnh"], 0)).toBe(0));
  it("returns the phrase head from later in the page", () =>
    expect(getBoundPhraseStartIndex(["nói", "về", "hình", "ảnh"], 3)).toBe(2));
});

describe("getBoundPhraseEmphasisSeed", () => {
  it("joins a bound phrase into one seed", () =>
    expect(getBoundPhraseEmphasisSeed(["hình", "ảnh"], 0)).toBe("hình ảnh"));
  it("returns the same seed from either syllable", () =>
    expect(getBoundPhraseEmphasisSeed(["hình", "ảnh"], 1)).toBe("hình ảnh"));
  it("returns the bare token for a solo word", () =>
    expect(getBoundPhraseEmphasisSeed(["the", "quick"], 0)).toBe("the"));
  it("returns empty for an out-of-range solo index", () =>
    expect(getBoundPhraseEmphasisSeed(["the"], 5)).toBe(""));
});

describe("expandEmphasisToBoundPhrases", () => {
  it("expands one syllable to its whole bound phrase", () =>
    expect([...expandEmphasisToBoundPhrases(["hình", "ảnh", "đẹp"], [0])].sort()).toEqual([0, 1]));
  it("expands from the second syllable too", () =>
    expect([...expandEmphasisToBoundPhrases(["hình", "ảnh", "đẹp"], [1])].sort()).toEqual([0, 1]));
  it("leaves a solo token alone", () =>
    expect([...expandEmphasisToBoundPhrases(["the", "quick"], [0])]).toEqual([0]));
  it("returns an empty set for no selection", () =>
    expect(expandEmphasisToBoundPhrases(["hình", "ảnh"], []).size).toBe(0));
  it("keeps two separate phrases distinct", () => {
    const result = expandEmphasisToBoundPhrases(["hình", "ảnh", "ý", "tưởng"], [0, 2]);
    expect([...result].sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
  });
  it("deduplicates overlapping selections", () =>
    expect(expandEmphasisToBoundPhrases(["hình", "ảnh"], [0, 1]).size).toBe(2));
});

describe("getSpecialPoeticWordIndexes", () => {
  it("flags a poetic reduplicative phrase", () =>
    expect([...getSpecialPoeticWordIndexes(["lơ", "lửng"])].sort()).toEqual([0, 1]));
  it("flags the phrase inside a longer page", () => {
    const result = getSpecialPoeticWordIndexes(["mặt", "nước", "sóng", "biếc"]);
    expect([...result].sort((a, b) => a - b)).toEqual([2, 3]);
  });
  it("returns an empty set when nothing is poetic", () =>
    expect(getSpecialPoeticWordIndexes(["hello", "world"]).size).toBe(0));
  it("returns an empty set for an empty page", () =>
    expect(getSpecialPoeticWordIndexes([]).size).toBe(0));
  it("matches accent-free input", () =>
    expect([...getSpecialPoeticWordIndexes(["lo", "lung"])].sort()).toEqual([0, 1]));
});

describe("repairSplitCompoundEmphasis", () => {
  it("pulls in the missing syllable of a compound", () =>
    expect(repairSplitCompoundEmphasis(["học", "sinh"], [0])).toEqual([0, 1]));
  it("reaches left to complete a compound", () =>
    expect(repairSplitCompoundEmphasis(["học", "sinh"], [1])).toEqual([0, 1]));
  it("leaves non-Vietnamese text untouched", () =>
    expect(repairSplitCompoundEmphasis(["the", "quick"], [0])).toEqual([0]));
  it("does not drag in a stop word", () =>
    expect(repairSplitCompoundEmphasis(["và", "học"], [1])).toEqual([1]));
  it("keeps an already-complete run unchanged", () =>
    expect(repairSplitCompoundEmphasis(["học", "sinh"], [0, 1])).toEqual([0, 1]));
  it("returns a sorted, deduplicated list", () =>
    expect(repairSplitCompoundEmphasis(["học", "sinh", "giỏi"], [2, 0])).toEqual(
      repairSplitCompoundEmphasis(["học", "sinh", "giỏi"], [2, 0]).slice().sort((a, b) => a - b),
    ));
  it("handles an empty selection", () =>
    expect(repairSplitCompoundEmphasis(["học", "sinh"], [])).toEqual([]));
  it("ignores an out-of-range index", () =>
    expect(repairSplitCompoundEmphasis(["học", "sinh"], [9])).toEqual([9]));
});

describe("phrase key catalogues", () => {
  it("normalizes every bound phrase key", () => {
    for (const phrase of VIETNAMESE_BOUND_PHRASE_KEYS)
      for (const token of phrase) expect(token).toBe(normalizeVietnameseToken(token));
  });
  it("includes the im lặng bound phrase", () =>
    expect(VIETNAMESE_BOUND_PHRASE_KEYS.some((phrase) => phrase.join(" ") === "im lang")).toBe(true));
  it("normalizes every poetic key", () => {
    for (const phrase of VIETNAMESE_POETIC_EMPHASIS_KEYS)
      for (const token of phrase) expect(token).toBe(normalizeVietnameseToken(token));
  });
  it("keeps bound phrases at two or more tokens", () => {
    for (const phrase of VIETNAMESE_BOUND_PHRASE_KEYS) expect(phrase.length).toBeGreaterThan(1);
  });
});
