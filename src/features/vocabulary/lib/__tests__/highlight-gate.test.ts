import { describe, expect, it } from "vitest";
import { getEmphasizedWordIndexes } from "@/features/post-player/lib/feed-emphasis";
import { getWords } from "@/features/kinetic-text";
import { gateHighlight } from "../highlight-gate";
import { markPhrase } from "../crawler-shared";
import { toDeck } from "../custom-pack";
import { buildStages } from "../stages";
import { withWordJoiners } from "../word-joiner";
import { makeCatalog, makeWord } from "./helpers";

describe("gateHighlight", () => {
  const page = "Cái ba lô để đựng đồ, rất quan trọng khi đi học.";

  it("keeps an author's mark on a two-syllable connected word", () =>
    expect(gateHighlight(page, ["quan trọng"], ["ba lô", "quan trọng"])).toEqual(["quan trọng"]));

  it("never picks a joined word nobody marked", () =>
    expect(gateHighlight(page, undefined, ["ba lô", "quan trọng"])).toEqual([]));

  it("refuses a lone-syllable mark that is not a pivot, even with joined words beside it", () =>
    expect(gateHighlight(page, ["đựng"], ["ba lô"])).toEqual([]));

  it("lets a pivot syllable glow alone", () =>
    expect(gateHighlight(page, ["rất"], ["ba lô", "quan trọng"])).toEqual(["rất"]));

  it("reads a capitalised pivot at the start of a sentence", () =>
    expect(gateHighlight("Không ai đến cả.", ["Không"], undefined)).toEqual(["không"]));

  it("refuses a pivot that is half of a joined word", () =>
    expect(gateHighlight("Hít thở không khí trong lành.", ["không"], ["không khí"])).toEqual([]));

  it("ignores a pivot that is not on this page", () =>
    expect(gateHighlight("Trang này khác.", ["không"], undefined)).toEqual([]));

  it("does not grow a mark on half a joined word", () =>
    expect(gateHighlight(page, ["trọng"], ["quan trọng"])).toEqual([]));

  it("falls through a refused mark to the next one that passes", () =>
    expect(gateHighlight(page, ["đựng", "ba lô"], ["ba lô"])).toEqual(["ba lô"]));

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

  it("accepts a mark on a = pair", () =>
    expect(gateHighlight("Nhìn con mèo kìa!", ["con mèo"], ["con mèo"])).toEqual(["con mèo"]));

  it("never glows a mark holding a conjunction", () =>
    expect(gateHighlight("Mua và bán thôi.", ["và bán"], ["và bán"])).toEqual([]));

  it("ignores a mark that is not on this page", () =>
    expect(gateHighlight("Trang này khác.", ["ba lô"], ["ba lô"])).toEqual([]));

  it("reads a marked word through its trailing punctuation", () =>
    expect(gateHighlight("Sững sờ, ngạc nhiên.", ["ngạc nhiên"], ["ngạc nhiên."])).toEqual([
      "ngạc nhiên",
    ]));

  it("leaves a page with no mark dark", () =>
    expect(gateHighlight("Ngủ thêm năm phút nữa thôi?", undefined, undefined)).toEqual([]));
});

describe("a flat batch's emphasisVi", () => {
  const clues = (fields: Record<string, unknown>) =>
    toDeck([{ word: "water", usageEn: "Drink _____.", usageVi: "Uống nước.", ...fields }], "test")
      .words[0]!;

  it("reaches the text as an inline mark, because the feed reads nothing else", () =>
    expect(clues({ defVi: "Rất quan_trọng lắm.", emphasisVi: ["quan trọng"] }).defVi).toBe(
      "Rất /quan_trọng/ lắm.",
    ));

  it("gives each phrase the field that holds it", () => {
    const word = clues({
      defVi: "Một ba_lô nhỏ.",
      leadVi: "Rất quan_trọng lắm.",
      emphasisVi: ["quan trọng", "ba lô"],
    });
    expect([word.defVi, word.leadVi]).toEqual(["Một /ba_lô/ nhỏ.", "Rất /quan_trọng/ lắm."]);
  });

  it("leaves a phrase the text did not join unmarked", () =>
    expect(clues({ defVi: "Rất quan trọng lắm.", emphasisVi: ["quan trọng"] }).defVi).toBe(
      "Rất quan trọng lắm.",
    ));

  it("never marks an inline mark twice", () =>
    expect(markPhrase("Rất /quan_trọng/ lắm.", "quan trọng")).toBeNull());
});

describe("the gate in the feed", () => {
  const word = makeWord({
    defVi: "Cái /ba_lô/ để đựng đồ, rất quan_trọng khi đi=học.",
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

    it(`${name}: glows the marked word and no other joined word`, () => {
      const { text, dataEmphasis, boundPhrases } = stage("definition");
      expect(dataEmphasis).toEqual(["ba lô"]);
      expect(glowing(text, dataEmphasis, boundPhrases)).toEqual(["ba", "lô"]);
    });

    it(`${name}: a page with no mark glows nothing, not a guess`, () => {
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

describe("a pivot in the feed", () => {
  const word = makeWord({ leadVi: "Mưa to thế mà nó /vẫn/ đi học=đúng giờ." });
  const stages = buildStages(withWordJoiners(makeCatalog([word])).words[0]!, "detective");
  const lead = stages.find((item) => item.id.startsWith("lead"))!;

  it("glows that one syllable and nothing beside it", () => {
    const tokens = getWords(lead.text);
    const lit = [...getEmphasizedWordIndexes(tokens, lead.dataEmphasis, lead.boundPhrases)];
    expect(lead.dataEmphasis).toEqual(["vẫn"]);
    expect(lit.map((index) => tokens[index])).toEqual(["vẫn"]);
  });
});
