import { describe, expect, it } from "vitest";
import { checkPronounPair, personMentions } from "../../../../../scripts/lib/pronoun-agreement";

const pronouns = (text: string, answer?: string) =>
  personMentions(text, answer ? new Set(answer.split(" ")) : undefined).map((mention) => mention.pronoun);

describe("personMentions", () => {
  it("reads through joins, phrase edges and highlight marks", () => {
    expect(pronouns("Thi xong, | em /nhăn_mặt/ với=chị.")).toEqual(["em", "chị"]);
    expect(pronouns("Truyện của=em | được in.")).toEqual(["em"]);
  });

  it("skips words that only contain a pronoun syllable", () => {
    expect(pronouns("Học /tiếng_anh/ mỗi tối.")).toEqual([]);
    expect(pronouns("Ga mạnh, /giật_mình/?")).toEqual([]);
    expect(pronouns("Ở nhà một mình, thấy cô đơn.")).toEqual([]);
    expect(pronouns("Bà con | hàng xóm bế em bé, chú ý nhé.")).toEqual([]);
    expect(pronouns("Chị em | đi chợ cùng ông bà.")).toEqual([]);
    expect(pronouns("Sang Anh du học.")).toEqual([]);
    expect(pronouns("Chú chó nhà bên sủa.")).toEqual([]);
  });

  it("skips plurals and the card's own answer", () => {
    expect(pronouns("Các anh | và 2 bạn | cùng chúng mình đi.")).toEqual([]);
    expect(pronouns("Bà dắt cháu đi chơi.", "bà ngoại")).toEqual(["cháu"]);
  });

  it("tells a friend, a relative and a title from the story's person", () => {
    const roles = personMentions("Em với cô bạn, | em gái và cô giáo.").map((m) => `${m.pronoun}:${m.role}`);
    expect(roles).toEqual(["em:pronoun", "bạn:friend", "em:kin", "cô:title"]);
  });
});

describe("checkPronounPair", () => {
  it("flags a named stand-in the lead never named", () => {
    const result = checkPronounPair("Hàng xóm khoan tường, | em /nhăn_mặt/.", "Bạn ấy đeo /tai_nghe/?");
    expect(result?.grade).toBe("strong");
    expect(result?.lead.pronoun).toBe("em");
    expect(result?.anticipate.phrase).toBe("Bạn ấy");
  });

  it("flags a kin swap as likely and a first-person swap as strong", () => {
    expect(checkPronounPair("Trưa hè, | anh /nhảy_ùm/ | xuống bể.", "Em lặn một hơi?")?.grade).toBe("likely");
    expect(checkPronounPair("Mình kể | /món_phở/.", "Tôi thèm /phở_bò/?")?.grade).toBe("strong");
  });

  it("grades bạn/mình switches and an entering elder as weak", () => {
    expect(checkPronounPair("Gói quà, | mình thắt nơ.", "Bạn nhận chứ?")?.grade).toBe("weak");
    expect(checkPronounPair("Làm slide, | chị thêm ảnh.", "Cô khen /sinh_động/?")?.grade).toBe("weak");
  });

  it("passes clues that keep the same person or follow someone the lead named", () => {
    expect(checkPronounPair("Chị thấy | /nhạc_nhẹ/ dễ chịu.", "Chị bật /âm_nhạc/?")).toBeNull();
    expect(checkPronounPair("Cô giao | em làm lớp phó.", "Em /nhận_lời/?")).toBeNull();
    expect(checkPronounPair("Lên xe, mình | /nhường_ghế/ | cho một bà cụ.", "Bà cụ cảm_ơn?")).toBeNull();
    expect(checkPronounPair("Làm thêm, | chị tới sớm.", "Bà chủ /tăng_lương/?")).toBeNull();
    expect(checkPronounPair("Xem ảnh, | mình tròn mắt.", "Hỏi ông đủ_điều?")).toBeNull();
    expect(checkPronounPair("Bạn /tiếng_anh/ giỏi.", "Học /tiếng_Anh/ mỗi=ngày?")).toBeNull();
  });
});
