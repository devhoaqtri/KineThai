import { describe, expect, it } from "vitest";
import { buildStages, completeUsage } from "../stages";
import { makeWord } from "./helpers";

const letters = (word: Parameters<typeof makeWord>[0]) =>
  buildStages(makeWord(word), "detective").find((stage) => stage.id.startsWith("letters"));

describe("letter clue", () => {
  it("counts a Korean word's syllables and names only the opening consonant", () =>
    expect(letters({ id: "saram", word: "사람", ipa: "saram" })?.text).toBe(
      "Gồm 2 âm tiết, bắt đầu bằng ㅅ",
    ));
  it("never spells out a one-syllable Korean word", () =>
    expect(letters({ id: "geot", word: "것", ipa: "geot" })?.text).toBe(
      "Gồm 1 âm tiết, bắt đầu bằng ㄱ",
    ));
  it("gives a Japanese kanji word its kanji count and reading length", () =>
    expect(letters({ id: "aku", word: "開く", ipa: "あく" })?.text).toBe(
      "Gồm 1 chữ Hán, đọc thành 2 chữ kana, bắt đầu bằng あ",
    ));
  it("holds back the opening kana when it is the whole reading", () =>
    expect(letters({ id: "o", word: "お", ipa: "o" })?.text).toBe("Gồm 1 chữ kana"));
});

describe("answer language", () => {
  it("tags a Korean reveal ko and a Japanese one ja", () => {
    const reveal = (word: Parameters<typeof makeWord>[0]) =>
      buildStages(makeWord(word), "detective").at(-1)?.lang;
    expect(reveal({ id: "saram", word: "사람" })).toBe("ko");
    expect(reveal({ id: "aku", word: "開く", ipa: "あく" })).toBe("ja");
    expect(reveal({ id: "agree", word: "agree" })).toBe("en");
  });
});

describe("completeUsage", () => {
  it("fills a conjugated blank with its form", () =>
    expect(completeUsage("저는 운동을 _____.", "하다", "해요")).toBe("저는 운동을 해요."));
});
