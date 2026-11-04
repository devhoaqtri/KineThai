import { describe, expect, it } from "vitest";
import {
  VIETNAMESE_MAX_LINE_SYLLABLES,
  countSegmentSyllables,
  getVietnameseWordLines,
} from "../page-metrics";
import { getHanTokens } from "../han-lines";

const syllablesPerLine = (words: string[]) =>
  getVietnameseWordLines(words).map((line) =>
    line.segments.reduce((total, segment) => total + countSegmentSyllables(segment), 0),
  );

describe("Vietnamese line syllable cap (estimate packer)", () => {
  it("is four", () => expect(VIETNAMESE_MAX_LINE_SYLLABLES).toBe(4));

  it("never packs more than four syllables on a line", () => {
    for (const text of [
      "Mình đi chợ mua rau về nấu canh",
      "Bản kê việc cần làm xếp theo giờ, ngày.",
      "Có cao nhân chỉ?",
      "Đọc xong review, em quyết chờ hàng giảm giá.",
      "Ở trạng thái ngủ, mắt nhắm và không tỉnh.",
    ]) {
      for (const count of syllablesPerLine(text.split(" "))) {
        expect(count).toBeLessThanOrEqual(VIETNAMESE_MAX_LINE_SYLLABLES);
      }
    }
  });

  it("does not count a mark standing alone", () =>
    expect(countSegmentSyllables({ key: "k", words: [{ text: "—", index: 0 }] })).toBe(0));

  it("leaves Han lines alone", () => {
    const lines = getVietnameseWordLines(getHanTokens("我们今天一起去图书馆看书"));
    expect(lines.length).toBeGreaterThan(0);
  });
});
