import { describe, expect, it } from "vitest";
import { countSyllables } from "../syllables";

describe("countSyllables", () => {
  it("counts a Chinese word per glyph", () => {
    expect(countSyllables({ word: "累", ipa: "lèi" })).toBe(1);
    expect(countSyllables({ word: "生气", ipa: "shēngqì" })).toBe(2);
  });
  it("counts a Korean word per block", () => {
    expect(countSyllables({ word: "것", ipa: "geot" })).toBe(1);
    expect(countSyllables({ word: "하다", ipa: "hada" })).toBe(2);
  });
  it("counts a Japanese word from its kana reading", () => {
    expect(countSyllables({ word: "野", ipa: "の" })).toBe(1);
    expect(countSyllables({ word: "学校", ipa: "がっこう" })).toBe(4);
    expect(countSyllables({ word: "お茶", ipa: "おちゃ" })).toBe(2);
    expect(countSyllables({ word: "ビール" })).toBe(2);
  });
  it("counts spoken vowels, not spelled ones", () => {
    expect(countSyllables({ word: "awesome", ipa: "/ˈɔːsəm/" })).toBe(2);
    expect(countSyllables({ word: "interested", ipa: "/ˈɪn.trə.stɪd/" })).toBe(3);
    expect(countSyllables({ word: "bottle", ipa: "/ˈbɒtl̩/" })).toBe(2);
  });
  it("counts a diphthong once, with its non-syllabic mark", () => {
    expect(countSyllables({ word: "Detail", ipa: "/deˈtaɪ̯/" })).toBe(2);
    expect(countSyllables({ word: "interessiert", ipa: "/ɪntəʁɛˈsiːɐ̯t/" })).toBe(4);
  });
  it("counts French and Spanish readings", () => {
    expect(countSyllables({ word: "oublier", ipa: "/ublije/" })).toBe(3);
    expect(countSyllables({ word: "caro", ipa: "/ˈkaɾo/" })).toBe(2);
  });
  it("falls back to the spelling without a reading", () => {
    expect(countSyllables({ word: "Hause" })).toBe(2);
    expect(countSyllables({ word: "gut" })).toBe(1);
  });
});
