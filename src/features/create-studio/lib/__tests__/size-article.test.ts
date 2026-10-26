import { describe, expect, it } from "vitest";
import { suggestSize } from "../size";
import { getArticleTitle, getUrlHost, normalizeArticleUrl } from "../article";

describe("suggestSize", () => {
  it("keeps the current size for empty text", () => expect(suggestSize("   ", 88)).toBe(88));
  it("keeps the current size for short text", () => expect(suggestSize("hello", 60)).toBe(60));
  it("does not enlarge a small current size", () => expect(suggestSize("hello", 40)).toBe(40));
  it("caps at 96 once past the medium threshold", () => {
    const text = "a".repeat(49);
    expect(suggestSize(text, 120)).toBe(96);
  });
  it("caps at 84 once past the long threshold", () => {
    const text = "a".repeat(91);
    expect(suggestSize(text, 120)).toBe(84);
  });
  it("caps at 72 once past the very long threshold", () => {
    const text = "a".repeat(151);
    expect(suggestSize(text, 120)).toBe(72);
  });
  it("only lowers, never raises, the size", () => expect(suggestSize("a".repeat(200), 50)).toBe(50));
  it("counts trimmed length, not surrounding spaces", () =>
    expect(suggestSize(`${"a".repeat(151)}   `, 100)).toBe(72));
});

describe("normalizeArticleUrl", () => {
  it("returns an empty string for empty input", () => expect(normalizeArticleUrl("")).toBe(""));
  it("returns an empty string for whitespace", () => expect(normalizeArticleUrl("   ")).toBe(""));
  it("adds https when no protocol is present", () =>
    expect(normalizeArticleUrl("example.com")).toBe("https://example.com/"));
  it("keeps an explicit http protocol", () =>
    expect(normalizeArticleUrl("http://example.com/a")).toBe("http://example.com/a"));
  it("keeps an explicit https protocol", () =>
    expect(normalizeArticleUrl("https://example.com/a")).toBe("https://example.com/a"));
  it("trims surrounding whitespace before parsing", () =>
    expect(normalizeArticleUrl("  example.com  ")).toBe("https://example.com/"));
});

describe("getUrlHost", () => {
  it("strips the www prefix", () =>
    expect(getUrlHost("https://www.example.com/a")).toBe("example.com"));
  it("keeps a subdomain", () =>
    expect(getUrlHost("https://blog.example.com")).toBe("blog.example.com"));
  it("falls back to a label for garbage", () => expect(getUrlHost("not a url")).toBe("linked article"));
});

describe("getArticleTitle", () => {
  it("falls back for empty text", () => expect(getArticleTitle("")).toBe("Linked article"));
  it("collapses whitespace and returns a short title", () =>
    expect(getArticleTitle("  a   b  ")).toBe("a b"));
  it("leaves a 72-char title untouched", () => {
    const title = "b".repeat(72);
    expect(getArticleTitle(title)).toBe(title);
  });
  it("truncates a long title with an ellipsis", () => {
    const result = getArticleTitle("c".repeat(100));
    expect(result.length).toBeLessThanOrEqual(72);
    expect(result.endsWith("...")).toBe(true);
  });
});
