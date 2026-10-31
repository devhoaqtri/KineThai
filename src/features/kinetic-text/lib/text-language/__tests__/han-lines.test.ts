import { describe, expect, it } from "vitest";
import { getHanTokens, isHanToken, isLikelyChineseText } from "../han-lines";

describe("isLikelyChineseText", () => {
  it("detects a full Han sentence", () => expect(isLikelyChineseText("我爱你")).toBe(true));
  it("needs at least two Han glyphs", () => expect(isLikelyChineseText("水")).toBe(false));
  it("counts Han with punctuation as dominant", () =>
    expect(isLikelyChineseText("你好。")).toBe(true));
  it("rejects pure Latin text", () => expect(isLikelyChineseText("hello world")).toBe(false));
  it("rejects Vietnamese text", () => expect(isLikelyChineseText("tiếng việt")).toBe(false));
  it("rejects the empty string", () => expect(isLikelyChineseText("")).toBe(false));
  it("rejects a lone Han gloss inside Latin", () =>
    expect(isLikelyChineseText("the 水 label")).toBe(false));
  it("rejects Han outnumbered by Latin letters", () =>
    expect(isLikelyChineseText("我love你")).toBe(false));
  it("accepts Han that outnumbers a short Latin run", () =>
    expect(isLikelyChineseText("我你他ab")).toBe(true));
  it("accepts Han with a masked blank", () => expect(isLikelyChineseText("我___你")).toBe(true));
  it("counts per glyph, not per whitespace token", () =>
    expect(isLikelyChineseText("我 爱 你")).toBe(true));
});

describe("getHanTokens", () => {
  it("splits each Han glyph into its own token", () =>
    expect(getHanTokens("我爱你")).toEqual(["我", "爱", "你"]));
  it("glues a closing mark to the token before it", () =>
    expect(getHanTokens("你好。")).toEqual(["你", "好。"]));
  it("glues an opening bracket to the token after it", () =>
    expect(getHanTokens("「你好」")).toEqual(["「你", "好」"]));
  it("keeps a Latin run whole", () =>
    expect(getHanTokens("hello 世界")).toEqual(["hello", "世", "界"]));
  it("keeps a space-separated masked blank whole", () =>
    expect(getHanTokens("我 _____ 你")).toEqual(["我", "_____", "你"]));
  it("keeps a blank apart from the Han glyph after it, so it draws as a slot", () =>
    expect(getHanTokens("我_____你")).toEqual(["我", "_____", "你"]));
  it("returns an empty array for an empty string", () => expect(getHanTokens("")).toEqual([]));
  it("reconstructs the visible text when joined", () => {
    for (const text of ["我爱你", "你好。", "「你好」", "hello 世界"])
      expect(getHanTokens(text).join("")).toBe(text.replace(/\s+/g, ""));
  });
  it("never leaves a token that is only punctuation", () => {
    for (const token of getHanTokens("你好，世界！")) expect(isHanToken(token)).toBe(true);
  });
  it("holds a leading closing mark until a token exists", () =>
    expect(getHanTokens("。你").join("")).toBe("。你"));
  it("tokenizes a longer sentence one glyph at a time", () =>
    expect(getHanTokens("我爱学习中文")).toHaveLength(6));
});

describe("isHanToken", () => {
  it("is true for a single Han glyph", () => expect(isHanToken("我")).toBe(true));
  it("is true for a Han-led token", () => expect(isHanToken("你好")).toBe(true));
  it("is false for a Latin token", () => expect(isHanToken("hello")).toBe(false));
  it("is false when an opening bracket leads", () => expect(isHanToken("「你")).toBe(false));
  it("is true when a closing mark trails", () => expect(isHanToken("你」")).toBe(true));
  it("is false for the empty token", () => expect(isHanToken("")).toBe(false));
  it("is false for a blank run", () => expect(isHanToken("_____")).toBe(false));
});
