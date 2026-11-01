import { describe, expect, it } from "vitest";
import { getDataEmphasisWordSpans, getWords } from "@/features/kinetic-text";
import { getEmphasizedWordIndexes } from "@/features/post-player/lib/feed-emphasis";
import type { Locale } from "../locale";
import type { VocabularyWord } from "../schema";
import { buildStages } from "../stages";

const word = (fields: Partial<VocabularyWord>) =>
  ({
    id: "x",
    word: "day",
    ipa: "/deɪ/",
    pos: "noun",
    defVi: "một ngày",
    leadVi: "gợi ý",
    anticipateVi: "đoán đi",
    usage: [],
    ...fields,
  }) as VocabularyWord;

/** @returns The tokens a letters page lights, the same two ways WordSequenceText picks them. */
const glowing = (entry: VocabularyWord, ui: Locale) => {
  const stage = buildStages(entry, "detective", ui).find((page) => page.id.startsWith("letters"))!;
  const tokens = getWords(stage.text);
  const lit = new Set(getEmphasizedWordIndexes(tokens, stage.dataEmphasis, stage.boundPhrases));
  for (const span of getDataEmphasisWordSpans(tokens, [stage.secondaryEmphasis?.phrase ?? ""])) {
    for (let offset = 0; offset < span.length; offset += 1) lit.add(span.start + offset);
  }
  return [...lit].sort((a, b) => a - b).map((index) => tokens[index]);
};

describe.each(["ja", "vi", "th"] as const)("the letters hint in %s", (ui) => {
  it("lights only the count and the first letter", () => {
    expect(glowing(word({ word: "insufficient" }), ui).sort()).toEqual(["12", "I"]);
  });

  it("lights only those two on a short word", () => {
    expect(glowing(word({ word: "day" }), ui).sort()).toEqual(["3", "D"]);
  });

  it("lights only the count and the pinyin initial on a Han word", () => {
    expect(glowing(word({ word: "诚实", ipa: "chéngshí" }), ui).sort()).toEqual(["2", "C"]);
  });
});
