import { describe, expect, it } from "vitest";
import { fromKoCrawler, isKoCrawlerCards } from "../crawler-ko";
import { normalizeDeck } from "../schema";

const card = (overrides: Record<string, unknown> = {}) => ({
  word: "먹다",
  pos: "verb",
  ipa: "meokda",
  meaningVi: "ăn",
  defVi: "Đưa cơm hay thức_ăn vào miệng, | nhai kỹ rồi nuốt.",
  leadVi: "Bụng réo ùng_ục, | gắp miếng thịt kho bỏ vào miệng.",
  anticipateVi: "Bụng réo ầm_ầm | còn chần_chừ gì?",
  usageEn: "저는 아침에 밥을 _____.",
  usageVi: "Buổi sáng tôi ăn cơm.",
  topics: ["food"],
  exams: [],
  emphasisVi: ["nhai", "gắp", "còn"],
  blankKo: "먹어요",
  pronKo: "[먹따]",
  classKo: "동사",
  politeKo: "먹어요",
  particleKo: "",
  counterKo: "",
  counterNum: "",
  irregularKo: "",
  honorificKo: "드시다",
  banmalKo: "먹어",
  formalKo: "먹습니다",
  registerVi: "",
  originKo: "native",
  pairKo: "",
  hanjaKo: "",
  hanVietVi: "",
  ...overrides,
});

const convert = (...cards: Record<string, unknown>[]) =>
  fromKoCrawler([{ name: "K101.json", cards: cards as never }]);

describe("isKoCrawlerCards", () => {
  it("recognises a card array with Korean keys", () =>
    expect(isKoCrawlerCards([card()])).toBe(true));
  it("rejects a plain deck array", () =>
    expect(isKoCrawlerCards([{ word: "agree", defVi: "đồng ý" }])).toBe(false));
});

describe("fromKoCrawler", () => {
  const [word] = convert(card()).words;

  it("takes the TOPIK level from the batch name", () => expect(word?.level).toBe("TOPIK1"));
  it("marks each highlight in its own clue field", () => {
    expect(word?.defVi).toContain("/nhai/");
    expect(word?.leadVi).toContain("/gắp/");
    expect(word?.anticipateVi).toContain("/còn/");
  });
  it("fills a conjugated blank with its form", () =>
    expect(word?.usage).toEqual([
      { en: "저는 아침에 밥을 _____.", vi: "Buổi sáng tôi ăn cơm.", fill: "먹어요" },
    ]));
  it("keeps the spoken form beside the romanization", () =>
    expect(word?.ipa).toBe("meokda [먹따]"));
  it("folds conjugation into the documented Korean keys", () =>
    expect(word?.verbInfo).toEqual({
      활용: "규칙",
      활용형: { 해요체: "먹어요", 반말: "먹어", 합쇼체: "먹습니다" },
    }));
  it("keeps an honorific form of its own", () =>
    expect(word?.honorific).toEqual({ 높임말: "드시다" }));
  it("drops the regular -(으)시- honorific", () => {
    const regular = (overrides: Record<string, unknown>) =>
      convert(card(overrides)).words[0]?.honorific;
    expect(regular({ word: "알다", honorificKo: "아시다", irregularKo: "ㄹ" })).toBeNull();
    expect(regular({ word: "덥다", honorificKo: "더우시다", irregularKo: "ㅂ" })).toBeNull();
    expect(regular({ word: "없다", honorificKo: "없으시다" })).toBeNull();
    expect(regular({ word: "자다", honorificKo: "주무시다" })).toEqual({ 높임말: "주무시다" });
  });
  it("names an irregular stem", () =>
    expect(convert(card({ word: "덥다", irregularKo: "ㅂ" })).words[0]?.verbInfo).toMatchObject({
      활용: "ㅂ 불규칙",
    }));
  it("reduces a counting phrase to its counter", () =>
    expect(
      convert(card({ word: "사람", classKo: "명사", counterKo: "사람 세 명", honorificKo: "" }))
        .words[0]?.counter,
    ).toBe("명"));
  it("skips an empty card and keeps the first sense of a repeated headword", () => {
    const deck = convert(
      card({ word: "일", classKo: "명사", meaningVi: "việc" }),
      card({ word: "일", classKo: "명사", meaningVi: "ngày" }),
      { word: "우리나라", defVi: null, usageEn: null, classKo: null },
    );
    expect(deck.words.map((w) => w.meaningVi)).toEqual(["việc"]);
    expect(deck.dropped).toEqual(["일 (ngày)"]);
    expect(deck.skipped).toEqual(["우리나라"]);
  });
  it("refuses a file not named for its level", () =>
    expect(() => fromKoCrawler([{ name: "korean.json", cards: [card()] as never }])).toThrow());
  it("produces a deck normalizeDeck accepts", () => {
    const { meta, words } = convert(card());
    expect(normalizeDeck({ meta, words }).words[0]?.grammar).toMatchObject({
      honorific: { 높임말: "드시다" },
    });
  });
});
