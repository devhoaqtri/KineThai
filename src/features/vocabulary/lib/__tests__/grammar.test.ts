import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCustomPack } from "../custom-pack";
import { foldGrammar, grammarHint, grammarRows } from "../grammar";
import { normalizeDeck } from "../schema";
import { withWordJoiners } from "../word-joiner";

const sample = JSON.parse(
  readFileSync(resolve(__dirname, "../../../../../docs/word-grammar-sample.json"), "utf8"),
) as Record<string, Record<string, unknown>[]>;
const LANGS = ["de", "fr", "es", "ko", "ja", "zh"] as const;

const deckWord = (overrides: Record<string, unknown> = {}) => ({
  id: "w",
  word: "wort",
  defVi: "một từ",
  ...overrides,
});

describe("foldGrammar", () => {
  it("drops nulls, empty strings and emptied objects", () => {
    expect(
      foldGrammar({
        gender: "n",
        plural: null,
        tipVi: "",
        verbInfo: { trennbar: null } as never,
      } as never),
    ).toEqual({ gender: "n" });
  });
  it("returns undefined when nothing applies", () => {
    expect(foldGrammar({ plural: null, governs: undefined } as never)).toBeUndefined();
  });
  it("lets a flat field correct the compiled object", () => {
    expect(foldGrammar({ grammar: { plural: "die Büche" }, plural: "die Bücher" })).toEqual({
      plural: "die Bücher",
    });
  });
});

describe("normalizeDeck", () => {
  it("folds flat grammar fields into word.grammar", () => {
    const [word] = normalizeDeck({
      words: [deckWord({ gender: "n", article: "das", plural: "die Wörter", verbInfo: null })],
    }).words;
    expect(word!.grammar).toEqual({ gender: "n", article: "das", plural: "die Wörter" });
    expect(word).not.toHaveProperty("plural");
    expect(word).not.toHaveProperty("verbInfo");
  });
  it("leaves a word without grammar without the key", () => {
    const [word] = normalizeDeck({ words: [deckWord()] }).words;
    expect(word!.grammar).toBeUndefined();
  });
  it("rejects a gender outside m / f / n", () => {
    expect(() => normalizeDeck({ words: [deckWord({ gender: "x" })] })).toThrow(/gender/);
  });
  it("re-imports its own compiled output unchanged", () => {
    const first = normalizeDeck({ words: [deckWord({ plural: "die Wörter" })] });
    expect(normalizeDeck({ words: first.words }).words[0]!.grammar).toEqual({
      plural: "die Wörter",
    });
  });
});

describe("the sample deck", () => {
  for (const lang of LANGS) {
    it(`imports every ${lang} card with grammar and lays it out`, () => {
      const pack = parseCustomPack(JSON.stringify(sample[lang]), `grammar-${lang}.json`);
      const words = withWordJoiners(pack.catalog).words;
      expect(words).toHaveLength(sample[lang]!.length);
      for (const word of words) {
        expect(word.grammar, word.word).toBeDefined();
        const rows = grammarRows(word.grammar!, lang);
        expect(rows.length, word.word).toBeGreaterThan(0);
        expect(grammarHint(rows), word.word).not.toBe("");
        // Vietnamese notes reach the panel with their marks turned into joins.
        expect(word.grammar!.tipVi ?? "", word.word).not.toMatch(/[_|]|\S=\S/u);
      }
    });
  }
});

describe("grammarRows", () => {
  it("shows gender with its article and native labels", () => {
    const rows = grammarRows({ gender: "m", article: "der", plural: "die Kollegen" }, "de");
    expect(rows[0]).toMatchObject({
      label: "Genus",
      gloss: "giống",
      value: "der",
      valueGloss: "giống đực",
    });
    expect(rows[1]).toMatchObject({ label: "Plural", gloss: "số nhiều", value: "die Kollegen" });
  });
  it("splits verbInfo into its terms and a paradigm table", () => {
    const rows = grammarRows(
      {
        verbInfo: {
          Konjugation: "stark",
          Hilfsverb: "sein",
          Stammformen: { Präsens: "er kommt an", Perfekt: "er ist angekommen" },
        },
        governs: "jemandem (Dativ) etwas (Akkusativ)",
      },
      "de",
    );
    expect(rows.map((row) => row.label)).toEqual([
      "Konjugation",
      "Hilfsverb",
      "Stammformen",
      "Rektion",
    ]);
    expect(rows[0]).toMatchObject({ valueGloss: "mạnh (đổi nguyên âm)" });
    expect(rows[2]).toMatchObject({
      kind: "table",
      forms: [{ label: "Präsens", gloss: "hiện tại" }, { label: "Perfekt" }],
    });
    expect(rows[3]).toMatchObject({ valueGloss: "cách 3 · cách 4" });
  });
  it("glosses a value by its leading term", () => {
    const [row] = grammarRows({ verbInfo: { 自他: "他動詞 ↔ 開く" } }, "ja");
    expect(row).toMatchObject({
      label: "自他",
      value: "他動詞 ↔ 開く",
      valueGloss: "ngoại động từ",
    });
  });
  it("falls back to the Vietnamese name where a language has no native one", () => {
    const [row] = grammarRows({ hanViet: "học hiệu" }, "ko");
    expect(row).toMatchObject({ label: "âm Hán Việt", value: "học hiệu" });
    expect(row).not.toHaveProperty("gloss", expect.anything());
  });
  it("puts the trap note last", () => {
    const rows = grammarRows({ tipVi: "lưu ý", plural: "les chevaux" }, "fr");
    expect(rows.at(-1)).toMatchObject({ kind: "tip", label: "attention" });
  });
});
