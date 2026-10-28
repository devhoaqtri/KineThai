import { describe, expect, it } from "vitest";
import {
  CEFR_LEVELS,
  HSK_LEVELS,
  LEVELS,
  STYLE_IDS,
  answerPattern,
  levelSystemFor,
  mergeCatalogs,
  normalizeDeck,
} from "../schema";
import { makeCatalog, makeWord } from "./helpers";

/** A minimal valid deck word for normalizeDeck input. */
const deckWord = (overrides: Record<string, unknown> = {}) => ({
  id: "agree",
  word: "agree",
  defVi: "đồng ý với ai",
  ...overrides,
});

describe("level constants", () => {
  it("lists the six CEFR levels", () =>
    expect(CEFR_LEVELS).toEqual(["A1", "A2", "B1", "B2", "C1", "C2"]));
  it("lists the nine HSK levels", () => expect(HSK_LEVELS).toHaveLength(9));
  it("master LEVELS is CEFR then HSK", () =>
    expect(LEVELS).toEqual([...CEFR_LEVELS, ...HSK_LEVELS]));
  it("ships four narrative styles", () =>
    expect(STYLE_IDS).toEqual(["detective", "speed", "confession", "minimal"]));
});

describe("levelSystemFor", () => {
  it("maps Chinese to HSK", () => expect(levelSystemFor("zh")).toBe("hsk"));
  it("maps English to CEFR", () => expect(levelSystemFor("en")).toBe("cefr"));
  it("maps every other locale to CEFR", () => {
    for (const locale of ["ko", "ja", "fr", "de", "es"] as const)
      expect(levelSystemFor(locale)).toBe("cefr");
  });
});

describe("answerPattern", () => {
  it("matches the answer as a whole word", () =>
    expect(answerPattern("agree").test("I agree with you")).toBe(true));
  it("is case-insensitive", () => expect(answerPattern("agree").test("AGREE")).toBe(true));
  it("does not match inside a longer word", () =>
    expect(answerPattern("cat").test("concatenate")).toBe(false));
  it("does not match a prefix", () => expect(answerPattern("agree").test("agreement")).toBe(false));
  it("escapes regex metacharacters in the answer", () =>
    expect(answerPattern("a.b").test("axb")).toBe(false));
  it("matches a hyphenated answer", () =>
    expect(answerPattern("well-known").test("it is well-known")).toBe(true));
  it("is a global regex, so callers must not share one instance across .test calls", () => {
    const pattern = answerPattern("word");
    expect(pattern.global).toBe(true);
    expect(pattern.test("a word here")).toBe(true);
    // Second call resumes from lastIndex and misses — a fresh instance is the fix.
    expect(pattern.test("a word here")).toBe(false);
    expect(answerPattern("word").test("a word here")).toBe(true);
  });
});

describe("normalizeDeck", () => {
  it("accepts a minimal valid deck", () => {
    const result = normalizeDeck({ words: [deckWord()] });
    expect(result.count).toBe(1);
    expect(result.words[0]!.word).toBe("agree");
  });
  it("NFC-normalizes the headword and keeps its case", () => {
    const result = normalizeDeck({ words: [deckWord({ id: "x", word: "Éclair" })] });
    expect(result.words[0]!.word).toBe("Éclair");
  });
  it("rejects a headword repeated in another case", () => {
    expect(() =>
      normalizeDeck({
        words: [deckWord({ id: "a", word: "Buch" }), deckWord({ id: "b", word: "buch" })],
      }),
    ).toThrow(/Duplicate word/);
  });
  it("lowercases the id", () => {
    const result = normalizeDeck({ words: [deckWord({ id: "AgreeMe" })] });
    expect(result.words[0]!.id).toBe("agreeme");
  });
  it("derives chars and initial", () => {
    const result = normalizeDeck({ words: [deckWord()] });
    expect(result.words[0]!.chars).toBe(5);
    expect(result.words[0]!.initial).toBe("A");
  });
  it("lifts a legacy topic into the topics axis", () => {
    const result = normalizeDeck({ words: [deckWord({ topic: "travel" })] });
    expect(result.words[0]!.topics).toEqual(["travel"]);
  });
  it("restates topic as the first entry of topics", () => {
    const result = normalizeDeck({ words: [deckWord({ topic: "a", topics: ["b", "a"] })] });
    expect(result.words[0]!.topic).toBe("b");
    expect(result.words[0]!.topics).toEqual(["b", "a"]);
  });
  it("defaults the topic to general", () => {
    const result = normalizeDeck({ words: [deckWord({ topic: "" })] });
    expect(result.words[0]!.topics).toEqual(["general"]);
  });
  it("names the catalog from meta or the default", () => {
    expect(normalizeDeck({ meta: { name: "Pack X" }, words: [deckWord()] }).name).toBe("Pack X");
    expect(normalizeDeck({ words: [deckWord()] }).name).toBe("WordCrawler vocabulary");
  });
  it("computes the sorted union of topics", () => {
    const result = normalizeDeck({
      words: [
        deckWord({ id: "a", word: "zebra", topic: "zoo" }),
        deckWord({ id: "b", word: "apple", topic: "food" }),
      ],
    });
    expect(result.topics).toEqual(["food", "zoo"]);
  });
  it("lists only the levels present", () => {
    const result = normalizeDeck({
      words: [
        deckWord({ id: "a", word: "one", level: "A1" }),
        deckWord({ id: "b", word: "two", level: "B2" }),
      ],
    });
    expect(result.levels).toEqual(["A1", "B2"]);
  });
  it("normalizes emphasis phrases and dedupes case-insensitively", () => {
    const result = normalizeDeck({
      words: [deckWord({ emphasis: ["  Đồng Ý ", "đồng ý", "khác"] })],
    });
    expect(result.words[0]!.emphasis).toEqual(["Đồng Ý", "khác"]);
  });
  it("collapses inner whitespace in an emphasis phrase", () => {
    const result = normalizeDeck({
      words: [deckWord({ emphasis: ["đồng    ý"] })],
    });
    expect(result.words[0]!.emphasis).toEqual(["đồng ý"]);
  });
  it("rejects an emphasis phrase with no letters at schema time", () =>
    expect(() => normalizeDeck({ words: [deckWord({ emphasis: ["   "] })] })).toThrow(
      /must contain letters|at least 1 character/,
    ));
});

describe("normalizeDeck rejections", () => {
  it("rejects an empty deck", () =>
    expect(() => normalizeDeck({ words: [] })).toThrow(/at least one word/));
  it("rejects a duplicate id", () =>
    expect(() =>
      normalizeDeck({
        words: [deckWord({ id: "dup", word: "one" }), deckWord({ id: "dup", word: "two" })],
      }),
    ).toThrow(/Duplicate ID/));
  it("rejects a duplicate headword (case-insensitive)", () =>
    expect(() =>
      normalizeDeck({
        words: [deckWord({ id: "a", word: "Same" }), deckWord({ id: "b", word: "same" })],
      }),
    ).toThrow(/Duplicate word/));
  it("rejects an anticipateVi that leaks the answer", () =>
    expect(() =>
      normalizeDeck({ words: [deckWord({ anticipateVi: "you should agree here" })] }),
    ).toThrow(/Contains the English answer/));
  it("rejects a bad id character set", () =>
    expect(() => normalizeDeck({ words: [deckWord({ id: "has space" })] })).toThrow());
  it("rejects an unknown level", () =>
    expect(() => normalizeDeck({ words: [deckWord({ level: "Z9" })] })).toThrow());
  it("rejects a single-letter non-Han headword", () =>
    expect(() => normalizeDeck({ words: [deckWord({ id: "a", word: "a" })] })).toThrow());
});

describe("mergeCatalogs", () => {
  it("passes a single catalog through, recomputing the revision", () => {
    const base = makeCatalog([makeWord({ word: "one" })], { revision: "r1" });
    const merged = mergeCatalogs(base);
    expect(merged.count).toBe(1);
    expect(merged.revision).not.toBe("r1");
    expect(merged.revision).toMatch(/^[0-9a-f]{24}$/);
  });
  it("deduplicates by headword, first catalog winning", () => {
    const base = makeCatalog([makeWord({ id: "x", word: "shared", defVi: "base" })]);
    const pack = makeCatalog([makeWord({ id: "y", word: "shared", defVi: "pack" })]);
    const merged = mergeCatalogs(base, pack);
    expect(merged.count).toBe(1);
    expect(merged.words[0]!.defVi).toBe("base");
  });
  it("deduplicates by id even when the headwords differ", () => {
    const base = makeCatalog([makeWord({ id: "same", word: "alpha" })]);
    const pack = makeCatalog([makeWord({ id: "same", word: "beta" })]);
    expect(mergeCatalogs(base, pack).count).toBe(1);
  });
  it("keeps distinct words from both catalogs", () => {
    const base = makeCatalog([makeWord({ word: "alpha" })]);
    const pack = makeCatalog([makeWord({ word: "beta" })]);
    expect(mergeCatalogs(base, pack).count).toBe(2);
  });
  it("names a merge after the base plus a pack count", () => {
    const base = makeCatalog([makeWord({ word: "alpha" })], { name: "Base" });
    const pack = makeCatalog([makeWord({ word: "beta" })], { name: "Pack" });
    expect(mergeCatalogs(base, pack).name).toBe("Base + 1 pack");
  });
  it("pluralises packs beyond one", () => {
    const a = makeCatalog([makeWord({ word: "a" })], { name: "Base" });
    const b = makeCatalog([makeWord({ word: "b" })]);
    const c = makeCatalog([makeWord({ word: "c" })]);
    expect(mergeCatalogs(a, b, c).name).toBe("Base + 2 packs");
  });
  it("unions and sorts topics across catalogs", () => {
    const base = makeCatalog([makeWord({ word: "a", topic: "zoo", topics: ["zoo"] })]);
    const pack = makeCatalog([makeWord({ word: "b", topic: "art", topics: ["art"] })]);
    expect(mergeCatalogs(base, pack).topics).toEqual(["art", "zoo"]);
  });
  it("is deterministic: same inputs, same revision", () => {
    const make = () => makeCatalog([makeWord({ word: "stable" })], { revision: "rev" });
    expect(mergeCatalogs(make()).revision).toBe(mergeCatalogs(make()).revision);
  });
  it("changes the revision when an input revision changes", () => {
    const a = mergeCatalogs(makeCatalog([makeWord({ word: "w" })], { revision: "r1" }));
    const b = mergeCatalogs(makeCatalog([makeWord({ word: "w" })], { revision: "r2" }));
    expect(a.revision).not.toBe(b.revision);
  });
  it("recomputes levels from the merged words", () => {
    const base = makeCatalog([makeWord({ word: "a", level: "A1" })]);
    const pack = makeCatalog([makeWord({ word: "b", level: "C1" })]);
    expect(mergeCatalogs(base, pack).levels).toEqual(["A1", "C1"]);
  });
});
