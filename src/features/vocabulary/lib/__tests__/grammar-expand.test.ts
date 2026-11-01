import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GRAMMAR_EXPAND_KEY,
  readGrammarExpand,
  writeGrammarExpand,
} from "../grammar-expand";

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => void store.clear(),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("grammar-expand", () => {

  it("defaults to false when no preference is saved", () => {
    expect(readGrammarExpand()).toBe(false);
  });

  it("remembers when turned on", () => {
    writeGrammarExpand(true);
    expect(localStorage.getItem(GRAMMAR_EXPAND_KEY)).toBe("1");
    expect(readGrammarExpand()).toBe(true);
  });

  it("clears the key when turned off", () => {
    writeGrammarExpand(true);
    writeGrammarExpand(false);
    expect(localStorage.getItem(GRAMMAR_EXPAND_KEY)).toBeNull();
    expect(readGrammarExpand()).toBe(false);
  });
});
