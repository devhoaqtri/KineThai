import { describe, expect, it } from "vitest";
import type { VocabularyWord } from "../schema";
import { planRefineryImport, readRefineryExport } from "../refinery-import";

const header = { format: "word-refinery.kinemedia-deck", formatVersion: 1, gloss: "vi", name: "R" };
const word = (head: string, extra: Record<string, unknown> = {}) => ({
  id: head,
  word: head,
  defVi: "x",
  ...extra,
});

describe("readRefineryExport", () => {
  it("accepts a version-1 Vietnamese export", () => {
    expect(readRefineryExport({ meta: header, words: [word("calm")] }).words).toHaveLength(1);
  });
  it.each([
    [{ ...header, format: "other" }, /Not a Word Refinery export/],
    [{ ...header, formatVersion: 2 }, /version 2/],
    [{ ...header, gloss: "ja" }, /Vietnamese only/],
  ])("refuses %o", (meta, message) => {
    expect(() => readRefineryExport({ meta, words: [word("calm")] })).toThrow(message);
  });
});

describe("planRefineryImport", () => {
  const plan = (
    incoming: ReturnType<typeof word>[],
    extra: Partial<Parameters<typeof planRefineryImport>[0]> = {},
  ) =>
    planRefineryImport({
      incoming,
      base: [word("agree", { shareCode: "B74" }) as unknown as VocabularyWord],
      packs: new Map([
        ["en-a1.json", [word("apple", { shareCode: "AAA" }), word("bag", { shareCode: "BBB" })]],
      ]),
      previous: [],
      ledger: {},
      ...extra,
    });

  it("moves a word out of an older pack, keeping its id and share code", () => {
    const result = plan([word("apple", { id: "apple", meaningVi: "táo" })]);
    expect(result.words).toEqual([
      expect.objectContaining({ id: "apple", shareCode: "AAA", meaningVi: "táo" }),
    ]);
    expect(result.trimmed.get("en-a1.json")!.map((w) => w.word)).toEqual(["bag"]);
    expect(result.report.moved).toEqual([{ word: "apple", from: "en-a1.json" }]);
  });

  it("leaves a word the admin base already has", () => {
    const result = plan([word("agree"), word("calm")]);
    expect(result.words.map((w) => w.word)).toEqual(["calm"]);
    expect(result.report.keptBase).toEqual(["agree"]);
  });

  it("updates a refinery word in place and keeps earlier ones absent from the export", () => {
    const result = plan([word("calm", { meaningVi: "bình_tĩnh" })], {
      previous: [
        word("calm", { id: "calm", shareCode: "CCC" }),
        word("brave", { shareCode: "DDD" }),
      ],
    });
    expect(result.words).toEqual([
      expect.objectContaining({ word: "calm", shareCode: "CCC", meaningVi: "bình_tĩnh" }),
      expect.objectContaining({ word: "brave", shareCode: "DDD" }),
    ]);
    expect(result.report).toMatchObject({ updated: ["calm"], keptPrevious: 1 });
  });

  it("gives a returning word its old code and never reuses a taken id", () => {
    const result = plan([word("calm"), word("Apples", { id: "apple" })], {
      ledger: { ZZZ: "calm" },
      packs: new Map([["en-a1.json", [word("apple", { shareCode: "AAA" })]]]),
    });
    expect(result.words).toEqual([
      expect.objectContaining({ id: "calm", shareCode: "ZZZ" }),
      expect.objectContaining({ id: "apple-2", word: "Apples" }),
    ]);
    expect(result.words[1]).not.toHaveProperty("shareCode");
  });
});
