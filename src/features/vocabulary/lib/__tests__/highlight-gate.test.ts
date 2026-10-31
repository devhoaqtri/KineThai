import { describe, expect, it } from "vitest";
import { getEmphasizedWordIndexes } from "@/features/post-player/lib/feed-emphasis";
import { getWords } from "@/features/kinetic-text";
import { gateHighlight } from "../highlight-gate";
import { buildStages } from "../stages";
import { withWordJoiners } from "../word-joiner";
import { makeCatalog, makeWord } from "./helpers";

describe("gateHighlight", () => {
  const page = "Cái ba lô để đựng đồ, rất quan trọng khi đi học.";

  it("keeps an author's mark on a two-syllable connected word", () =>
    expect(gateHighlight(page, ["quan trọng"], ["ba lô", "quan trọng"])).toEqual(["quan trọng"]));

  it("grows a mark on half a connected word to the whole word", () =>
    expect(gateHighlight(page, ["trọng"], ["quan trọng"])).toEqual(["quan trọng"]));

  it("refuses a lone-syllable mark and glows a connected word instead", () =>
    expect(gateHighlight(page, ["đựng"], ["ba lô"])).toEqual(["ba lô"]));

  it("refuses two syllables the deck did not connect", () =>
    expect(gateHighlight("Đi dưới nắng gắt cả ngày.", ["nắng gắt"], undefined)).toEqual([]));

  it("never lets three connected syllables glow", () =>
    expect(
      gateHighlight("Dán thời khóa biểu lên tường.", ["thời khóa biểu"], ["thời khóa biểu"]),
    ).toEqual([]));

  it("takes a marked word out of a longer chain", () =>
    expect(gateHighlight("Bạn đã bắt chuyện rồi.", ["bắt chuyện"], ["đã bắt chuyện"])).toEqual([
      "bắt chuyện",
    ]));

  it("leaves a three-syllable chain alone when nothing marks a word in it", () =>
    expect(gateHighlight("Bạn đã bắt chuyện rồi.", undefined, ["đã bắt chuyện"])).toEqual([]));

  it("accepts a = pair when the page has nothing else", () =>
    expect(gateHighlight("Nhìn con mèo kìa!", undefined, ["con mèo"])).toEqual(["con mèo"]));

  it("prefers a real word over one leaning on a function word", () =>
    expect(
      gateHighlight("Đây là của mình, thời gian ơi.", undefined, ["của mình", "thời gian"]),
    ).toEqual(["thời gian"]));

  it("never glows a connected group holding a conjunction", () =>
    expect(gateHighlight("Mua và bán thôi.", undefined, ["và bán"])).toEqual([]));

  it("ignores a connected word that is not on this page", () =>
    expect(gateHighlight("Trang này khác.", ["ba lô"], ["ba lô"])).toEqual([]));

  it("reads a connected word through its trailing punctuation", () =>
    expect(gateHighlight("Sững sờ, ngạc nhiên.", undefined, ["Sững sờ,", "ngạc nhiên."])).toEqual([
      "ngạc nhiên",
    ]));

  it("leaves a page with no connected word dark", () =>
    expect(gateHighlight("Ngủ thêm năm phút nữa thôi?", undefined, undefined)).toEqual([]));
});

describe("the gate in the feed", () => {
  const word = makeWord({
    defVi: "Cái ba_lô /để/ đựng đồ, rất quan_trọng khi đi=học.",
    leadVi: "Ngủ thêm năm phút nữa thôi?",
    anticipateVi: "Bạn đã=/bắt_chuyện/ rồi.",
  });
  const encoded = withWordJoiners(makeCatalog([word])).words[0]!;
  const glowing = (text: string, marks?: string[], bound?: string[]) => {
    const tokens = getWords(text);
    return [...getEmphasizedWordIndexes(tokens, marks, bound)].map((index) => tokens[index]);
  };

  // Raw decks reach the guards and imported packs; served decks arrive with the joins
  // already encoded. Both must answer the same.
  for (const [name, source] of [
    ["raw", word],
    ["encoded", encoded],
  ] as const) {
    const stages = buildStages(source, "detective");
    const stage = (id: string) => stages.find((item) => item.id.startsWith(id))!;

    it(`${name}: glows one connected word in place of a refused mark`, () => {
      const { text, dataEmphasis, boundPhrases } = stage("definition");
      expect(dataEmphasis).toHaveLength(1);
      expect(glowing(text, dataEmphasis, boundPhrases)).toHaveLength(2);
    });

    it(`${name}: a page with no connected word glows nothing, not a guess`, () => {
      const { text, dataEmphasis, boundPhrases } = stage("lead");
      expect(dataEmphasis).toEqual([]);
      expect(glowing(text, dataEmphasis, boundPhrases)).toEqual([]);
    });

    it(`${name}: the word chosen from a chain does not grow back into it`, () => {
      const { text, dataEmphasis, boundPhrases } = stage("anticipation");
      expect(glowing(text, dataEmphasis, boundPhrases)).toEqual(["bắt", "chuyện"]);
    });

    it(`${name}: the composed letters clue keeps its own highlight`, () =>
      expect(stage("letters").dataEmphasis?.length ?? 1).toBeGreaterThan(0));
  }
});
