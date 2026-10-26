import { describe, expect, it } from "vitest";
import { getWordAnchorKey, getWords } from "../words";
import { getStableNumber } from "../stable-hash";

describe("getWords", () => {
  it("splits on whitespace", () => expect(getWords("one two three")).toEqual(["one", "two", "three"]));
  it("returns an empty array for an empty string", () => expect(getWords("")).toEqual([]));
  it("returns an empty array for whitespace only", () => expect(getWords("   ")).toEqual([]));
  it("collapses runs of whitespace", () => expect(getWords("a   b")).toEqual(["a", "b"]));
  it("keeps punctuation attached to its token", () =>
    expect(getWords("hello, world!")).toEqual(["hello,", "world!"]));
  it("keeps Vietnamese diacritics intact", () =>
    expect(getWords("một hai ba")).toEqual(["một", "hai", "ba"]));
  it("treats a newline as whitespace", () =>
    expect(getWords("a\nb")).toEqual(["a", "b"]));
  it("counts Han text as one whitespace token", () =>
    expect(getWords("我 爱")).toEqual(["我", "爱"]));
});

describe("getWordAnchorKey", () => {
  it("lowercases", () => expect(getWordAnchorKey("Word")).toBe("word"));
  it("strips Vietnamese diacritics", () =>
    expect(getWordAnchorKey("tiếng")).toBe("tieng"));
  it("strips a leading đ (no NFD decomposition)", () =>
    expect(getWordAnchorKey("đẹp")).toBe("ep"));
  it("trims leading and trailing punctuation", () =>
    expect(getWordAnchorKey("hello,")).toBe("hello"));
  it("keeps inner apostrophes and hyphens", () =>
    expect(getWordAnchorKey("well-known")).toBe("well-known"));
  it("removes spaces", () => expect(getWordAnchorKey("a b")).toBe("ab"));
  it("returns empty for a punctuation-only token", () =>
    expect(getWordAnchorKey("…")).toBe(""));
  it("is idempotent", () => {
    const once = getWordAnchorKey("Tiếng Việt");
    expect(getWordAnchorKey(once)).toBe(once);
  });
});

describe("getStableNumber", () => {
  it("is deterministic", () => expect(getStableNumber("abc")).toBe(getStableNumber("abc")));
  it("differs for different inputs", () =>
    expect(getStableNumber("abc")).not.toBe(getStableNumber("abd")));
  it("returns an unsigned 32-bit integer", () => {
    const value = getStableNumber("seed");
    expect(Number.isInteger(value)).toBe(true);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(0xffffffff);
  });
  it("handles the empty string", () => expect(getStableNumber("")).toBeGreaterThanOrEqual(0));
  it("matches the FNV-1a offset basis for the empty string", () =>
    expect(getStableNumber("")).toBe(2166136261));
  it("is order-sensitive", () => expect(getStableNumber("ab")).not.toBe(getStableNumber("ba")));
});
