import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DIFFICULTY_CHOICE_KEY,
  readDifficultyChoice,
  writeDifficultyChoice,
} from "../difficulty-choice";
import { DIFFICULTY_IDS } from "../difficulty";

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readDifficultyChoice", () => {
  it("returns null when nothing was ever chosen", () => expect(readDifficultyChoice()).toBeNull());
  it("returns the empty string for an all-levels choice", () => {
    store.set(DIFFICULTY_CHOICE_KEY, "");
    expect(readDifficultyChoice()).toBe("");
  });
  it("reads back a single known track", () => {
    store.set(DIFFICULTY_CHOICE_KEY, "co-ban");
    expect(readDifficultyChoice()).toBe("co-ban");
  });
  it("reads back a comma-joined multi-select", () => {
    store.set(DIFFICULTY_CHOICE_KEY, "co-ban,du-lich");
    expect(readDifficultyChoice()).toBe("co-ban,du-lich");
  });
  it("drops track ids the app no longer knows", () => {
    store.set(DIFFICULTY_CHOICE_KEY, "co-ban,retired-track,du-lich");
    expect(readDifficultyChoice()).toBe("co-ban,du-lich");
  });
  it("drops every id when none are known, leaving empty", () => {
    store.set(DIFFICULTY_CHOICE_KEY, "ghost1,ghost2");
    expect(readDifficultyChoice()).toBe("");
  });
  it("trims whitespace around each id", () => {
    store.set(DIFFICULTY_CHOICE_KEY, " co-ban , du-lich ");
    expect(readDifficultyChoice()).toBe("co-ban,du-lich");
  });
  it("returns null when storage is unavailable", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(readDifficultyChoice()).toBeNull();
  });
  it("returns null when storage throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
    });
    expect(readDifficultyChoice()).toBeNull();
  });
  it("recognises every id in DIFFICULTY_IDS", () => {
    for (const id of DIFFICULTY_IDS) {
      store.set(DIFFICULTY_CHOICE_KEY, id);
      expect(readDifficultyChoice()).toBe(id);
    }
  });
});

describe("writeDifficultyChoice", () => {
  it("stores a track id under the shared key", () => {
    writeDifficultyChoice("co-ban");
    expect(store.get(DIFFICULTY_CHOICE_KEY)).toBe("co-ban");
  });
  it("stores the empty string for all levels", () => {
    writeDifficultyChoice("");
    expect(store.get(DIFFICULTY_CHOICE_KEY)).toBe("");
  });
  it("round-trips through read", () => {
    writeDifficultyChoice("du-hoc,nang-cao");
    expect(readDifficultyChoice()).toBe("du-hoc,nang-cao");
  });
  it("never throws when storage is unavailable", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(() => writeDifficultyChoice("co-ban")).not.toThrow();
  });
  it("never throws when setItem throws", () => {
    vi.stubGlobal("localStorage", {
      setItem: () => {
        throw new Error("quota");
      },
    });
    expect(() => writeDifficultyChoice("co-ban")).not.toThrow();
  });
});
