/** Shared fixtures for vocabulary lib tests: minimal valid words and catalogs. */
import type { Catalog, VocabularyWord } from "../schema";

let counter = 0;

/** Build a schema-shaped word with sensible defaults; override any field. */
export function makeWord(overrides: Partial<VocabularyWord> = {}): VocabularyWord {
  counter += 1;
  const word = overrides.word ?? `word${counter}`;
  return {
    id: word.toLowerCase(),
    word,
    meaningVi: "",
    defVi: "Nghĩa ngắn gọn",
    leadVi: "",
    anticipateVi: "",
    pos: "",
    ipa: "",
    topic: "general",
    usage: [],
    ...overrides,
  } as VocabularyWord;
}

/** Build a catalog whose metadata is recomputed from the given words, like normalizeDeck. */
export function makeCatalog(words: VocabularyWord[], overrides: Partial<Catalog> = {}): Catalog {
  return {
    revision: "a".repeat(24),
    name: "Test catalog",
    count: words.length,
    topics: [...new Set(words.flatMap((word) => word.topics ?? [word.topic]))].sort(),
    levels: [...new Set(words.map((word) => word.level).filter(Boolean))],
    words,
    ...overrides,
  } as Catalog;
}
