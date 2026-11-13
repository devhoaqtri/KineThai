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
    expect(digitsOf("Giá ly nước | ba_trăm_nghìn.")).toBe("Giá ly nước | 300 nghìn.");
    expect(digitsOf("Thành phố mười triệu dân.")).toBe("Thành phố 10 triệu dân.");
    expect(verdicts("Mỗi tuần em bỏ heo năm chục nghìn.")).toEqual([
      "năm:unsure",
      "nghìn:other-meaning",
    ]);
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
    expect(verdicts("Nghỉ hai ba ngày.")).toEqual(["hai:unsure", "ba:unsure"]);
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
