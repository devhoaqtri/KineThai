import { describe, expect, it } from "vitest";
import {
  CLITIC_BIND_MARK,
  PHRASE_BREAK_MARK,
  WORD_JOINER_MARK,
  countJoinedUnits,
  encodeWordJoiners,
  splitPhrases,
  splitWordJoiners,
  stripWordJoiners,
  withWordJoiners,
} from "../word-joiner";
import { makeCatalog, makeWord } from "./helpers";

const NBSP = "\u00A0";
const WJ = "\u2060";

describe("marks", () => {
  it("authored join is an underscore", () => expect(WORD_JOINER_MARK).toBe("_"));
  it("clitic bind is an equals sign", () => expect(CLITIC_BIND_MARK).toBe("="));
  it("phrase break is a pipe", () => expect(PHRASE_BREAK_MARK).toBe("|"));
});

describe("encodeWordJoiners", () => {
  it("turns an underscore between syllables into a no-break space", () =>
    expect(encodeWordJoiners("ba_lô")).toBe(`ba${NBSP}lô`));
  it("turns a clitic equals into a no-break space", () =>
    expect(encodeWordJoiners("con=mèo")).toBe(`con${NBSP}mèo`));
  it("binds Han glyphs with a word joiner, not a space", () =>
    expect(encodeWordJoiners("诚_实")).toBe(`诚${WJ}实`));
  it("leaves text without any mark untouched", () => {
    const text = "một câu bình thường";
    expect(encodeWordJoiners(text)).toBe(text);
  });
  it("returns the identical string instance when there is nothing to do", () => {
    const text = "no marks here";
    expect(encodeWordJoiners(text)).toBe(text);
  });
  it("keeps already-encoded text stable (idempotent)", () => {
    const once = encodeWordJoiners("ba_lô");
    expect(encodeWordJoiners(once)).toBe(once);
  });
  it("encodes several joined words in one sentence", () =>
    expect(encodeWordJoiners("tôi_thích ba_lô")).toBe(`tôi${NBSP}thích ba${NBSP}lô`));
  it("does not treat a run of underscores as a join (answer blank)", () => {
    const blank = "____";
    expect(encodeWordJoiners(blank)).toBe(blank);
  });
  it("does not join at a leading or trailing underscore", () => {
    expect(encodeWordJoiners("_đầu")).toBe("_đầu");
    expect(encodeWordJoiners("cuối_")).toBe("cuối_");
  });
  it("replaces a phrase mark with a single space", () =>
    expect(encodeWordJoiners("vế một | vế hai")).toBe("vế một vế hai"));
  it("collapses spaces around the phrase mark", () =>
    expect(encodeWordJoiners("a  |  b")).toBe("a b"));
  it("trims the result when a phrase mark sat at an edge", () =>
    expect(encodeWordJoiners("| đầu câu")).toBe("đầu câu"));
  it("handles digits on either side of a join", () =>
    expect(encodeWordJoiners("2_0")).toBe(`2${NBSP}0`));
  it("leaves an underscore between a letter and punctuation alone", () =>
    expect(encodeWordJoiners("word_!")).toBe("word_!"));
});

describe("stripWordJoiners", () => {
  it("turns an authored join back into a plain space", () =>
    expect(stripWordJoiners("ba_lô")).toBe("ba lô"));
  it("removes an encoded no-break space to a plain space", () =>
    expect(stripWordJoiners(`ba${NBSP}lô`)).toBe("ba lô"));
  it("removes a word joiner between Han glyphs entirely", () =>
    expect(stripWordJoiners(`诚${WJ}实`)).toBe("诚实"));
  it("strips an authored Han join to adjacent glyphs", () =>
    expect(stripWordJoiners("诚_实")).toBe("诚实"));
  it("also drops phrase marks while stripping", () =>
    expect(stripWordJoiners("a |b_c")).toBe("a b c"));
  it("is idempotent", () => {
    const once = stripWordJoiners("quan_trọng");
    expect(stripWordJoiners(once)).toBe(once);
  });
});

describe("splitPhrases", () => {
  it("returns one phrase when there is no mark", () =>
    expect(splitPhrases("một câu đầy đủ")).toEqual(["một câu đầy đủ"]));
  it("splits at each phrase mark", () =>
    expect(splitPhrases("vế một|vế hai|vế ba")).toEqual(["vế một", "vế hai", "vế ba"]));
  it("trims whitespace around edges", () => expect(splitPhrases(" a | b ")).toEqual(["a", "b"]));
  it("drops empty phrases", () => expect(splitPhrases("a||b")).toEqual(["a", "b"]));
  it("returns nothing for an empty text", () => expect(splitPhrases("")).toEqual([]));
  it("strips word joins inside each phrase", () =>
    expect(splitPhrases("ba_lô|tò_mò")).toEqual(["ba lô", "tò mò"]));
});

describe("splitWordJoiners", () => {
  it("reports no bound words for plain text", () =>
    expect(splitWordJoiners("hai từ rời")).toEqual({ text: "hai từ rời", bound: [] }));
  it("reports a joined Vietnamese word as one bound unit", () => {
    const { text, bound } = splitWordJoiners("chiếc ba_lô đẹp");
    expect(text).toBe("chiếc ba lô đẹp");
    expect(bound).toEqual(["ba lô"]);
  });
  it("reports an encoded no-break-space run the same way", () => {
    const { bound } = splitWordJoiners(`chiếc ba${NBSP}lô đẹp`);
    expect(bound).toEqual(["ba lô"]);
  });
  it("reports Han glyphs as adjacent bound units", () => {
    const { text, bound } = splitWordJoiners("诚_实");
    expect(text).toBe("诚实");
    expect(bound).toEqual(["诚实"]);
  });
  it("collects every distinct joined word once", () => {
    const { bound } = splitWordJoiners("ba_lô và tò_mò xanh");
    expect(bound).toEqual(["ba lô", "tò mò"]);
  });
  it("dedupes a word joined twice in the same text", () => {
    const { bound } = splitWordJoiners("ba_lô ba_lô");
    expect(bound).toEqual(["ba lô"]);
  });
});

describe("countJoinedUnits", () => {
  it("counts plain syllables", () => expect(countJoinedUnits("một hai ba")).toBe(3));
  it("counts a joined word as its syllables", () => expect(countJoinedUnits("ba_lô")).toBe(2));
  it("counts a mixed sentence", () => expect(countJoinedUnits("chiếc ba_lô màu đỏ")).toBe(5));
  it("counts nothing in an empty string", () => expect(countJoinedUnits("")).toBe(0));
  it("ignores extra whitespace", () => expect(countJoinedUnits("  a   b ")).toBe(2));
  it("counts Han glyphs bound by a joiner as adjacent units", () =>
    expect(countJoinedUnits("诚_实")).toBe(1));
});

describe("withWordJoiners", () => {
  it("returns the same catalog instance when nothing is joined", () => {
    const catalog = makeCatalog([makeWord({ word: "plain", defVi: "không có nối" })]);
    expect(withWordJoiners(catalog)).toBe(catalog);
  });
  it("encodes the definition of a joined word", () => {
    const catalog = makeCatalog([makeWord({ word: "backpack", defVi: "chiếc ba_lô" })]);
    const [word] = withWordJoiners(catalog).words;
    expect(word.defVi).toBe(`chiếc ba${NBSP}lô`);
  });
  it("encodes meaningVi, leadVi and anticipateVi", () => {
    const catalog = makeCatalog([
      makeWord({
        word: "curious",
        meaningVi: "tò_mò",
        leadVi: "một người tò_mò",
        anticipateVi: "hay hỏi_vì sao",
      }),
    ]);
    const [word] = withWordJoiners(catalog).words;
    expect(word.meaningVi).toBe(`tò${NBSP}mò`);
    expect(word.leadVi).toBe(`một người tò${NBSP}mò`);
    expect(word.anticipateVi).toBe(`hay hỏi${NBSP}vì sao`);
  });
  it("leaves meaningVi undefined when the deck omits it", () => {
    const word = makeWord({ defVi: "ổn" });
    delete (word as { meaningVi?: string }).meaningVi;
    const catalog = makeCatalog([word]);
    const [encoded] = withWordJoiners(catalog).words;
    expect(encoded.meaningVi).toBeUndefined();
  });
  it("encodes both sides of a usage example", () => {
    const catalog = makeCatalog([
      makeWord({ word: "backpack", usage: [{ en: "my back_pack", vi: "ba_lô của tôi" }] }),
    ]);
    const [word] = withWordJoiners(catalog).words;
    expect(word.usage[0]!.en).toBe(`my back${NBSP}pack`);
    expect(word.usage[0]!.vi).toBe(`ba${NBSP}lô của tôi`);
  });
  it("strips joins from emphasis phrases so they match joined-out text", () => {
    const catalog = makeCatalog([makeWord({ word: "x", emphasis: ["ba_lô"] })]);
    const [word] = withWordJoiners(catalog).words;
    expect(word.emphasis).toEqual(["ba lô"]);
  });
  it("keeps an untouched word referentially identical", () => {
    const plain = makeWord({ word: "plain", defVi: "không nối" });
    const joined = makeWord({ word: "backpack", defVi: "ba_lô" });
    const catalog = makeCatalog([plain, joined]);
    const merged = withWordJoiners(catalog);
    expect(merged.words[0]).toBe(plain);
    expect(merged.words[1]).not.toBe(joined);
  });
});
