import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GRAMMAR_EXPAND_KEY, readGrammarExpand, writeGrammarExpand } from "../grammar-expand";

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("grammar expand choice", () => {
  it("is off until the reader turns it on", () => expect(readGrammarExpand()).toBe(false));
  it("reads back a choice and forgets it when turned off", () => {
    writeGrammarExpand(true);
    expect(readGrammarExpand()).toBe(true);
    writeGrammarExpand(false);
    expect(store.has(GRAMMAR_EXPAND_KEY)).toBe(false);
    expect(readGrammarExpand()).toBe(false);
  });
  it("does not inherit the old remembered open state", () => {
    store.set("kinetic.vocab.grammar-open", "1");
    expect(readGrammarExpand()).toBe(false);
  });
  it("reads off when storage throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
    });
    expect(readGrammarExpand()).toBe(false);
  });
});
