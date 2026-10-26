import { describe, expect, it } from "vitest";
import {
  createEmojiSticker,
  getAccentKeyword,
  getAccentRecommendation,
} from "../accent-suggestions";

describe("getAccentKeyword", () => {
  it("returns null for empty text", () => expect(getAccentKeyword("")).toBeNull());
  it("returns null when every token is too short", () =>
    expect(getAccentKeyword("i am ok")).toBeNull());
  it("prefers a keyword that maps to an emoji hint", () =>
    expect(getAccentKeyword("they love us")).toBe("love"));
  it("normalises Vietnamese diacritics before matching", () =>
    expect(getAccentKeyword("mãi yêu nhau")).toBe("yeu"));
  it("skips a dismissed keyword", () =>
    expect(getAccentKeyword("we love sparks", "love")).not.toBe("love"));
  it("ignores stop words", () => expect(getAccentKeyword("about always never")).toBeNull());
});

describe("getAccentRecommendation", () => {
  it("returns null for an empty keyword", async () =>
    expect(await getAccentRecommendation("")).toBeNull());
  it("maps a hint keyword to its emoji", async () => {
    const result = await getAccentRecommendation("love");
    expect(result).toEqual({ keyword: "love", emoji: "❤️" });
  });
  it("normalises the returned keyword", async () => {
    const result = await getAccentRecommendation("Yêu");
    expect(result!.keyword).toBe("yeu");
  });
  it("falls back to a decorative emoji for unknown keywords", async () => {
    const result = await getAccentRecommendation("zzzzqqqq");
    expect(result!.emoji.length).toBeGreaterThan(0);
  });
  it("is deterministic for the same keyword", async () => {
    const a = await getAccentRecommendation("zzzzqqqq");
    const b = await getAccentRecommendation("zzzzqqqq");
    expect(a!.emoji).toBe(b!.emoji);
  });
});

describe("createEmojiSticker", () => {
  it("builds an emoji sticker carrying the keyword", () => {
    const sticker = createEmojiSticker("love", "❤️", 0);
    expect(sticker.kind).toBe("emoji");
    expect(sticker.word).toBe("love");
    expect(sticker.emoji).toBe("❤️");
    expect(sticker.title).toBe("love");
  });
  it("gives every sticker a unique id", () => {
    const a = createEmojiSticker("love", "❤️", 0);
    const b = createEmojiSticker("fire", "🔥", 1);
    expect(a.id).not.toBe(b.id);
  });
  it("places the sticker with numeric coordinates and a size", () => {
    const sticker = createEmojiSticker("spark", "✨", 2);
    expect(typeof sticker.x).toBe("number");
    expect(typeof sticker.y).toBe("number");
    expect(typeof sticker.size).toBe("number");
  });
});
