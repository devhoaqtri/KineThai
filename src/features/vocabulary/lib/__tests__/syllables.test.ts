import { describe, expect, it } from "vitest";
import { countSyllables } from "../syllables";

describe("countSyllables", () => {
  it("counts English syllables from the IPA vowels", () => {
    expect(countSyllables({ word: "apple", ipa: "/ˈæp.l̩/" })).toBe(2);
    expect(countSyllables({ word: "awesome", ipa: "/ˈɔː.səm/" })).toBe(2);
    expect(countSyllables({ word: "interlocutor", ipa: "/ˌɪn.təˈlɒk.jə.tər/" })).toBe(5);
  });

  it("treats an IPA diphthong as one syllable", () => {
    expect(countSyllables({ word: "time", ipa: "/taɪm/" })).toBe(1);
    expect(countSyllables({ word: "boy", ipa: "/bɔɪ/" })).toBe(1);
  });

  it("counts syllables from a syllabic consonant in the IPA", () => {
    expect(countSyllables({ word: "bottle", ipa: "/ˈbɒt.l̩/" })).toBe(2);
    expect(countSyllables({ word: "button", ipa: "/ˈbʌt.n̩/" })).toBe(2);
  });

  it("counts one syllable per Hangul block", () => {
    expect(countSyllables({ word: "안녕하세요" })).toBe(5);
    expect(countSyllables({ word: "물" })).toBe(1);
  });

  it("counts kana beats for Japanese, grouping small kana with their host", () => {
    expect(countSyllables({ word: "今日", ipa: "きょう" })).toBe(2);
    expect(countSyllables({ word: "東京", ipa: "とうきょう" })).toBe(4);
    expect(countSyllables({ word: "ちょっと" })).toBe(3);
  });

  it("counts one syllable per Han character for Chinese", () => {
    expect(countSyllables({ word: "你好" })).toBe(2);
    expect(countSyllables({ word: "去" })).toBe(1);
  });

  it("falls back to spelled vowel groups when no reading is given", () => {
    expect(countSyllables({ word: "cat" })).toBe(1);
    expect(countSyllables({ word: "banana" })).toBe(3);
    expect(countSyllables({ word: "café" })).toBe(2);
  });
});
