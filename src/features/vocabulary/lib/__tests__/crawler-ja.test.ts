import { describe, expect, it } from "vitest";
import { fromJaCrawler, isJaCrawlerBatch } from "../crawler-ja";
import { normalizeDeck } from "../schema";

const card = (overrides: Record<string, unknown> = {}) => ({
  word: "開く",
  pos: "verb",
  ipa: "aku",
  kana: "あく",
  meaningVi: "mở",
  defVi: "Cửa hay nắp | tự chuyển | sang trạng_thái không còn đóng.",
  leadVi: "Mười giờ sáng, | cửa tiệm | kéo lên.",
  anticipateVi: "Cửa tiệm chào khách!",
  usageEn: "このみせは十時に_____。",
  usageVi: "Cửa hàng này mở cửa lúc mười giờ.",
  usageForm: "開きます",
  emphasisVi: ["trạng thái"],
  verbGroup: "五段",
  adjType: "",
  transitivity: "自",
  transPair: "開ける",
  keigo: { sonkei: "", kenjou: "" },
  counter: "",
  hanViet: "khai",
  register: "neutral",
  pitchAccent: [0],
  kanjiReadings: [],
  topics: ["daily"],
  exams: [],
  ...overrides,
});

describe("isJaCrawlerBatch", () => {
  it("recognises batches keyed by JLPT batch name", () =>
    expect(isJaCrawlerBatch({ N501: [], N502: [] })).toBe(true));
  it("rejects a deck or a bare array", () => {
    expect(isJaCrawlerBatch({ words: [] })).toBe(false);
    expect(isJaCrawlerBatch([])).toBe(false);
  });
});

describe("fromJaCrawler", () => {
  const [word] = fromJaCrawler({ N501: [card()] }).words;

  it("takes the level from the batch name", () => expect(word?.level).toBe("N5"));
  it("reads a kanji word in hiragana", () => expect(word?.ipa).toBe("あく"));
  it("keeps romaji for a word already written in kana", () =>
    expect(fromJaCrawler({ N501: [card({ word: "テレビ", ipa: "terebi" })] }).words[0]?.ipa).toBe(
      "terebi",
    ));
  it("fills a conjugated blank with its form", () =>
    expect(word?.usage).toEqual([
      { en: "このみせは十時に_____。", vi: "Cửa hàng này mở cửa lúc mười giờ.", fill: "開きます" },
    ]));
  it("marks the highlight where it is one written word", () =>
    expect(word?.defVi).toBe("Cửa hay nắp | tự chuyển | sang /trạng_thái/ không còn đóng."));
  it("folds the grammar into the documented Japanese keys", () => {
    expect(word?.verbInfo).toEqual({ 種類: "五段動詞", 自他: "自動詞 ↔ 開ける" });
    expect(word?.honorific).toBeNull();
    expect(word?.hanViet).toBe("khai");
  });
  it("gives homophones different ids", () => {
    const { words } = fromJaCrawler({
      N501: [card({ word: "橋", ipa: "hashi" }), card({ word: "箸", ipa: "hashi" })],
    });
    expect(words[0]?.id).not.toBe(words[1]?.id);
  });
  it("produces a deck normalizeDeck accepts", () =>
    expect(normalizeDeck(fromJaCrawler({ N501: [card()] })).words[0]?.grammar).toMatchObject({
      verbInfo: { 種類: "五段動詞" },
    }));
});
