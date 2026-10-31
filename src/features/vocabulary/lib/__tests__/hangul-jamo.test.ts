import { describe, expect, it } from "vitest";
import {
  blockLetters,
  decomposeHangul,
  vowelParts,
  type HangulSegment,
  type JamoLevel,
} from "../hangul-jamo";

type Block = Extract<HangulSegment, { kind: "block" }>;
const blocks = (text: string) =>
  decomposeHangul(text).filter((segment): segment is Block => segment.kind === "block");
const spell = (text: string, level: JamoLevel) =>
  blocks(text)
    .map((block) =>
      blockLetters(block, level)
        .map((jamo) => jamo.letter)
        .join(""),
    )
    .join(" · ");
const shapes = (text: string) =>
  blocks(text)
    .map((block) => `${block.shape}${block.final ? "+final" : ""}`)
    .join(", ");

describe("decomposeHangul — the instruction's table", () => {
  const cases: [string, string, string, string][] = [
    ["학교", "ㅎㅏㄱ · ㄱㅛ", "ㅎㅏㄱ · ㄱㅛ", "right+final, below"],
    ["같이", "ㄱㅏㅌ · ㅇㅣ", "ㄱㅏㅌ · ㅇㅣ", "right+final, right"],
    ["값", "ㄱㅏㅄ", "ㄱㅏㅂㅅ", "right+final"],
    ["읽다", "ㅇㅣㄺ · ㄷㅏ", "ㅇㅣㄹㄱ · ㄷㅏ", "right+final, right"],
    [
      "괜찮아요",
      "ㄱㅙㄴ · ㅊㅏㄶ · ㅇㅏ · ㅇㅛ",
      "ㄱㅗㅐㄴ · ㅊㅏㄴㅎ · ㅇㅏ · ㅇㅛ",
      "wrap+final, right+final, right, below",
    ],
    ["의사", "ㅇㅢ · ㅅㅏ", "ㅇㅡㅣ · ㅅㅏ", "wrap, right"],
    ["꽃", "ㄲㅗㅊ", "ㄲㅗㅊ", "below+final"],
    ["없어요", "ㅇㅓㅄ · ㅇㅓ · ㅇㅛ", "ㅇㅓㅂㅅ · ㅇㅓ · ㅇㅛ", "right+final, right, below"],
  ];
  it.each(cases)("%s", (word, level1, level2, shape) => {
    expect(spell(word, 1)).toBe(level1);
    expect(spell(word, 2)).toBe(level2);
    expect(shapes(word)).toBe(shape);
  });

  it("passes spaces, Latin letters and digits through unchanged", () =>
    expect(decomposeHangul("K-pop 노래 2")).toEqual([
      { kind: "text", text: "K-pop " },
      expect.objectContaining({ kind: "block", syllable: "노" }),
      expect.objectContaining({ kind: "block", syllable: "래" }),
      { kind: "text", text: " 2" },
    ]));

  it("composes a decomposed (NFD) string before splitting it", () =>
    expect(spell("학교".normalize("NFD"), 1)).toBe("ㅎㅏㄱ · ㄱㅛ"));

  it("never splits a tense consonant or ㅐ ㅔ ㅒ ㅖ", () => expect(spell("빼", 2)).toBe("ㅃㅐ"));
});

describe("vowelParts", () => {
  it("draws a wrapping vowel below, then right", () => {
    expect(vowelParts("ㅘ")).toEqual(["ㅗ", "ㅏ"]);
    expect(vowelParts("ㅏ")).toEqual(["ㅏ"]);
  });
});
