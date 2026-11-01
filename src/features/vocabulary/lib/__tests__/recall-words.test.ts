import { beforeEach, describe, expect, it } from "vitest";
import { HISTORY_KEY } from "../history";
import {
  RECALL_WORDS_KEY,
  clearRecallWords,
  loadRecallWords,
  recallFallbackLabel,
  recallMeaning,
  rememberRecallWord,
} from "../recall-words";
import type { VocabularyWord } from "../schema";

const store = new Map<string, string>();
const now = 1_800_000_000_000;

const word = (id: string, extra: Partial<VocabularyWord> = {}) =>
  ({
    id,
    word: id,
    meaningVi: "nghĩa",
    defVi: "một câu gợi ý",
    ipa: "",
    pos: "",
    usage: [],
    ...extra,
  }) as unknown as VocabularyWord;

const seen = (...ids: string[]) =>
  store.set(HISTORY_KEY, JSON.stringify(Object.fromEntries(ids.map((id) => [id, [now - 1000]]))));

beforeEach(() => {
  store.clear();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    },
  });
});

describe("rememberRecallWord", () => {
  it("keeps the gloss and one example, never the clues", () => {
    seen("agree");
    rememberRecallWord(
      word("agree", {
        ipa: "/əˈɡriː/",
        pos: "verb",
        leadVi: "manh mối",
        usage: [{ en: "I ____.", vi: "Tôi đồng ý." }],
      }),
      now,
    );
    expect(loadRecallWords().agree).toEqual({
      word: "agree",
      meaning: "nghĩa",
      ipa: "/əˈɡriː/",
      pos: "verb",
      example: "I ____.",
    });
  });
  it("falls back to the definition for a deck with no gloss", () => {
    seen("agree");
    rememberRecallWord(word("agree", { meaningVi: "" }), now);
    expect(loadRecallWords().agree!.meaning).toBe("một câu gợi ý");
  });
  it("drops copies whose word has left the history", () => {
    seen("kept");
    store.set(
      RECALL_WORDS_KEY,
      JSON.stringify({ kept: { word: "kept", meaning: "a" }, old: { word: "old", meaning: "b" } }),
    );
    rememberRecallWord(word("agree"), now);
    expect(Object.keys(loadRecallWords()).sort()).toEqual(["agree", "kept"]);
  });
});

describe("loadRecallWords", () => {
  it("ignores malformed entries and stores", () => {
    store.set(RECALL_WORDS_KEY, JSON.stringify({ good: { word: "a", meaning: "b" }, bad: 1 }));
    expect(Object.keys(loadRecallWords())).toEqual(["good"]);
    store.set(RECALL_WORDS_KEY, "not json");
    expect(loadRecallWords()).toEqual({});
  });
  it("is empty after clearing", () => {
    store.set(RECALL_WORDS_KEY, JSON.stringify({ good: { word: "a", meaning: "b" } }));
    clearRecallWords();
    expect(loadRecallWords()).toEqual({});
  });
});

describe("recallMeaning", () => {
  it("keeps each reader language's gloss, as the UI language can change after the view", () => {
    seen("agree");
    rememberRecallWord(
      word("agree", {
        meaningVi: "đồng ý",
        meaningJP: "同意する",
        localized: { th: { def: "เห็น | ด้วย" } },
      } as Partial<VocabularyWord>),
      now,
    );
    const copy = loadRecallWords().agree!;
    expect(recallMeaning(copy, "ja")).toBe("同意する");
    expect(recallMeaning(copy, "th")).toBe("เห็น ด้วย");
    expect(recallMeaning(copy, "vi")).toBe("đồng ý");
  });

  it("falls back to the Vietnamese base, never storing it under another language", () => {
    seen("agree");
    rememberRecallWord(word("agree"), now);
    const copy = loadRecallWords().agree!;
    expect(copy.meanings).toBeUndefined();
    expect(recallMeaning(copy, "ja")).toBe("nghĩa");
  });
});

describe("recallFallbackLabel", () => {
  it("never shows a Japanese school level", () => {
    for (const level of ["jprim", "jsec", "jhigh", "jcoll"]) {
      expect(recallFallbackLabel(`interested-${level}`)).toBe("interested");
    }
  });
  it("strips the provider prefix from an id", () => {
    expect(recallFallbackLabel("vi-interesting")).toBe("interesting");
    expect(recallFallbackLabel("nachbar")).toBe("nachbar");
  });
});
