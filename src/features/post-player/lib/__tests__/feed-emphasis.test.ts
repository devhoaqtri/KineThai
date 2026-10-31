import { describe, expect, it } from "vitest";
import { getWords } from "@/features/kinetic-text";
import { getEmphasizedWordIndexes } from "../feed-emphasis";

const glowing = (text: string, marks: string[], bound?: string[]) => {
  const words = getWords(text);
  return [...getEmphasizedWordIndexes(words, marks, bound)]
    .sort((a, b) => a - b)
    .map((index) => words[index]);
};

describe("getEmphasizedWordIndexes with a Vietnamese mark", () => {
  it("keeps a one-syllable mark to that syllable, not both its neighbours", () =>
    expect(glowing("Nghe giảng về vũ trụ, mình hỏi thầy đến hết giờ.", ["hỏi"])).toEqual(["hỏi"]));

  it("keeps a two-syllable mark from growing into its join chain across a clitic", () =>
    expect(
      glowing("Bạn mới chuyển lớp đã bắt chuyện với cả bàn.", ["bắt chuyện"], ["đã bắt chuyện"]),
    ).toEqual(["bắt", "chuyện"]));

  it("does not let a curated compound outgrow the mark", () =>
    expect(glowing("Hình ảnh động ghi lại để xem trên máy.", ["ảnh động"])).toEqual([
      "ảnh",
      "động",
    ]));

  it("grows a one-syllable mark to the whole `_` word it sits in", () =>
    expect(glowing("Cô đeo chiếc ba lô đi học.", ["ba"], ["ba lô"])).toEqual(["ba", "lô"]));
});

describe("getEmphasizedWordIndexes on a Vietnamese page with no mark", () => {
  it("finishes a pair rather than glowing half of it", () =>
    expect(glowing("Cả lớp đứng nhìn nhau ngơ ngác.", [])).toEqual(["ngơ", "ngác."]));

  it("never glows more than two syllables", () => {
    for (const text of ["Bà đầy thương mến.", "Mọi người đều vui vẻ hạnh phúc."])
      expect(glowing(text, []).length).toBeLessThanOrEqual(2);
  });
});
