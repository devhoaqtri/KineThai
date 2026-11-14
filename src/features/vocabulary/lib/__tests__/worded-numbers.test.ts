import { describe, expect, it } from "vitest";
import { applyDigits, scanCard, type Hit } from "../worded-numbers";

const card = (fields: Record<string, unknown>, meaningVi = "thú_vị") => ({
  id: "vi-test",
  word: "test",
  meaningVi,
  ...fields,
});

/** Each hit in one lead clue as "words:verdict→digits". */
function verdicts(leadVi: string, meaningVi?: string): string[] {
  return scanCard("packs/en-a1.json", card({ leadVi }, meaningVi))
    .filter((hit) => hit.field === "leadVi")
    .map((hit) => `${hit.words}:${hit.verdict}${hit.verdict === "number" ? `→${hit.digits}` : ""}`);
}

const digitsOf = (leadVi: string, meaningVi?: string) => {
  const hits = scanCard("packs/en-a1.json", card({ leadVi }, meaningVi)).filter(
    (hit: Hit) => hit.field === "leadVi",
  );
  return applyDigits(leadVi, hits);
};

describe("worded numbers", () => {
  it("turns a count before a unit into digits", () => {
    expect(digitsOf("Ngồi tàu ba tiếng, | mình đọc hai cuốn.")).toBe(
      "Ngồi tàu 3 tiếng, | mình đọc 2 cuốn.",
    );
    expect(digitsOf("Hẹn nhau lúc bảy giờ, đi mất mười lăm phút.")).toBe(
      "Hẹn nhau lúc 7 giờ, đi mất 15 phút.",
    );
  });

  it("reads compound numerals whole, and the year after them as a unit", () => {
    expect(digitsOf("Bể bơi dài hai mươi lăm mét.")).toBe("Bể bơi dài 25 mét.");
    expect(digitsOf("Mười năm ra trường.")).toBe("10 năm ra trường.");
    expect(digitsOf("Hai trăm linh năm khách.")).toBe("205 khách.");
    expect(digitsOf("Lúc mười giờ ba mươi, | lớp vào học.")).toBe("Lúc 10 giờ 30, | lớp vào học.");
  });

  it("keeps a multiplier's word and leaves longer large numbers to a person", () => {
    expect(digitsOf("Giá ly nước | ba_trăm_nghìn.")).toBe("Giá ly nước | 300_nghìn.");
    expect(digitsOf("Thành phố mười triệu dân.")).toBe("Thành phố 10 triệu dân.");
  });

  it("reads tens counted with chục, and numbers said short, as one number", () => {
    expect(digitsOf("Mỗi tuần em bỏ heo năm chục nghìn.")).toBe("Mỗi tuần em bỏ heo 50 nghìn.");
    expect(digitsOf("Thuê ba chục người.")).toBe("Thuê 30 người.");
    expect(digitsOf("Mượn bạn | hai_chục.")).toBe("Mượn bạn | 20.");
    expect(digitsOf("Phòng máy để hai lăm độ.")).toBe("Phòng máy để 25 độ.");
    expect(digitsOf("Ba tám độ, nóng quá!")).toBe("38 độ, nóng quá!");
    // Approximate tens, a range and a fourth-year student stay words.
    expect(digitsOf("Hàng chục người, mấy chục năm.")).toBe("Hàng chục người, mấy chục năm.");
    expect(verdicts("Hai ba độ thôi.")).toEqual(["Hai ba:unsure"]);
    expect(digitsOf("Sinh viên năm tư.")).toBe("Sinh viên năm tư.");
  });

  it("reads năm before an age as the year, and một after a price as per", () => {
    expect(digitsOf("Cô ấy ra mắt năm mười sáu tuổi.")).toBe("Cô ấy ra mắt năm 16 tuổi.");
    expect(digitsOf("Quán bán ba lăm nghìn một_suất.")).toBe("Quán bán 35 nghìn một_suất.");
    expect(digitsOf("Mình gửi bài lúc mười một giờ năm chín.")).toBe("Mình gửi bài lúc 11 giờ 59.");
    expect(digitsOf("Thành phố /mười_triệu/ dân.", "x").includes("/10_triệu/")).toBe(false);
    expect(
      scanCard("packs/en-a1.json", card({ leadVi: "Lọc dưới /mười_triệu/." }))[0]?.digits,
    ).toBe("10_triệu");
  });

  it("finishes a number a tap left half in digits", () => {
    expect(digitsOf("Em bỏ heo | 5 chục nghìn.")).toBe("Em bỏ heo | 50 nghìn.");
    expect(digitsOf("3 tám độ, liều ra đường?")).toBe("38 độ, liều ra đường?");
  });

  it("never offers half a number: scores, ranges and a number after its unit come whole", () => {
    expect(digitsOf("Đội mình thắng họ ba một.")).toBe("Đội mình thắng họ 3-1.");
    expect(digitsOf("Tỷ_số vẫn là một đều.")).toBe("Tỷ_số vẫn là 1-1.");
    expect(digitsOf("Em đoán đội nhà thắng 2 không.")).toBe("Em đoán đội nhà thắng 2-0.");
    // Not a score: make peace after ten years.
    expect(digitsOf("Hai nhà /làm_hòa/ | sau 10 năm.")).toBe("2 nhà /làm_hòa/ | sau 10 năm.");
    const range = scanCard("packs/en-a1.json", card({ leadVi: "Nghỉ hai ba ngày." }));
    expect(range.map((hit) => [hit.words, hit.verdict, hit.digits])).toEqual([
      ["hai ba", "unsure", "2-3"],
    ]);
    const steps = scanCard("packs/en-a1.json", card({ leadVi: "Nhảy ba bậc một." }));
    expect(steps.map((hit) => [hit.words, hit.digits])).toEqual([["ba bậc một", "3 bậc 1"]]);
  });

  it("writes heights as said and a score's half as a decimal", () => {
    expect(digitsOf("Xà cao một mét sáu.")).toBe("Xà cao 1m6.");
    expect(digitsOf("Anh ấy mét tám, | mình mét bảy=lăm.")).toBe("Anh ấy 1m8, | mình 1m75.");
    expect(digitsOf("Xà cao 1 mét sáu.")).toBe("Xà cao 1m6.");
    expect(digitsOf("Em cần điểm IELTS sáu rưỡi.")).toBe("Em cần điểm IELTS 6.5.");
    // Half past eight, and a length of two and a half metres, stay as they are.
    expect(digitsOf("Giờ học bắt đầu từ tám rưỡi.")).toBe("Giờ học bắt đầu từ tám rưỡi.");
    expect(verdicts("Dây dài hai mét rưỡi.")).toEqual(["hai:unsure", "rưỡi:unsure"]);
  });

  it("keeps the joins around a converted number", () => {
    expect(digitsOf("Anh giảm | năm_cân.")).toBe("Anh giảm | 5_cân.");
    expect(digitsOf("Chia hai=mươi phần.")).toBe("Chia 20 phần.");
  });

  it("leaves words that mean something else", () => {
    expect(verdicts("Ba mẹ ngồi tám chuyện.")).toEqual(["Ba:other-meaning", "tám:other-meaning"]);
    expect(verdicts("Năm nay, quả chín sớm.")).toEqual(["Năm:other-meaning", "chín:other-meaning"]);
    expect(verdicts("Thứ hai, tháng một, tôi về một mình.")).toEqual([
      "hai:other-meaning",
      "một:other-meaning",
      "một:other-meaning",
    ]);
    expect(verdicts("Xách ba_lô, | đi một ngày.")).toEqual([
      "ba:other-meaning",
      "một:other-meaning",
    ]);
    expect(verdicts("Hai bờ sông, | hai mẹ con.")).toEqual([
      "Hai:other-meaning",
      "hai:other-meaning",
    ]);
  });

  it("never changes the answer the card is about", () => {
    expect(verdicts("Tuần này mình bơi hai lần.", "hai lần")).toEqual(["hai:other-meaning"]);
    expect(verdicts("Bàn tay có năm ngón.", "năm")).toEqual(["năm:other-meaning"]);
  });

  it("is unsure where a person must decide", () => {
    // Inside a highlight mark, a range, a label, a lone number.
    expect(verdicts("Chạy /năm_phút/ là tới.")).toEqual(["năm:unsure"]);
    expect(verdicts("Nghỉ hai ba ngày.")).toEqual(["hai ba:unsure"]);
    expect(verdicts("Phòng ở tầng hai.")).toEqual(["hai:unsure"]);
    expect(verdicts("Hai bạn ngồi cạnh nhau.")).toEqual(["Hai:unsure"]);
    expect(verdicts("Đếm một, hai, ba.")).toEqual(["một:other-meaning", "hai:unsure", "ba:unsure"]);
  });

  it("offers digits for an unsure hit, written only by choice", () => {
    const [hit] = scanCard("packs/en-a1.json", card({ leadVi: "Phòng ở tầng hai." }));
    expect(hit?.verdict).toBe("unsure");
    expect(hit?.digits).toBe("2");
    expect(applyDigits("Phòng ở tầng hai.", [hit!])).toBe("Phòng ở tầng hai.");
  });

  it("finds nothing more to do on text it already converted", () => {
    const once = digitsOf("Hai mươi năm ngày cưới, | ba người đến.");
    expect(once).toBe("20 năm ngày cưới, | 3 người đến.");
    const again = scanCard("packs/en-a1.json", card({ leadVi: once }));
    expect(again.filter((hit) => hit.verdict === "number")).toEqual([]);
  });

  it("scans usage lines and grammar notes, and keys each hit to its place", () => {
    const hits = scanCard(
      "zh/hsk1-01.json",
      card({
        usage: [{ en: "x", vi: "Tôi đợi hai tiếng." }],
        grammar: {
          tipVi: "Dùng khi đếm: ba cái.",
          collocations: [{ text: "三天", vi: "ba ngày" }],
        },
      }),
    );
    expect(hits.map((hit) => [hit.field, hit.verdict, hit.digits])).toEqual([
      ["usage[0].vi", "number", "2"],
      ["grammar.tipVi", "number", "3"],
      ["grammar.collocations[0].vi", "number", "3"],
    ]);
    expect(hits[0]!.key).toBe("zh/hsk1-01.json|vi-test|usage[0].vi|đợi[hai]tiếng#0");
  });
});
