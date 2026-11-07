import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DIFFICULTY_CHOICE_KEY,
  DIFFICULTY_CHOICE_PREFIX,
  difficultyChoiceKey,
  readDifficultyChoice,
  writeDifficultyChoice,
} from "../difficulty-choice";
import { DIFFICULTY_IDS } from "../difficulty";

const LEGACY_KEY = DIFFICULTY_CHOICE_KEY;

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

describe("difficultyChoiceKey", () => {
  it("prefixes the locale so each deck keeps its own slot", () => {
    expect(difficultyChoiceKey("es")).toBe(`${DIFFICULTY_CHOICE_PREFIX}es`);
    expect(difficultyChoiceKey("ko")).toBe(`${DIFFICULTY_CHOICE_PREFIX}ko`);
  });
  it("never collides with the pre-scoping device-wide key", () => {
    for (const id of ["en", "es", "ko", "zh", "ja", "de", "fr"] as const) {
      expect(difficultyChoiceKey(id)).not.toBe(LEGACY_KEY);
    }
  });
});

describe("readDifficultyChoice", () => {
  it("returns null when nothing was ever chosen for the locale", () =>
    expect(readDifficultyChoice("es")).toBeNull());
  it("returns the empty string for an all-levels choice", () => {
    store.set(difficultyChoiceKey("es"), "");
    expect(readDifficultyChoice("es")).toBe("");
  });
  it("reads back a single known track", () => {
    store.set(difficultyChoiceKey("es"), "co-ban");
    expect(readDifficultyChoice("es")).toBe("co-ban");
  });
  it("reads back a comma-joined multi-select", () => {
    store.set(difficultyChoiceKey("es"), "co-ban,du-lich");
    expect(readDifficultyChoice("es")).toBe("co-ban,du-lich");
  });
  it("drops track ids the app no longer knows", () => {
    store.set(difficultyChoiceKey("es"), "co-ban,retired-track,du-lich");
    expect(readDifficultyChoice("es")).toBe("co-ban,du-lich");
  });
  it("drops every id when none are known, leaving empty", () => {
    store.set(difficultyChoiceKey("es"), "ghost1,ghost2");
    expect(readDifficultyChoice("es")).toBe("");
  });
  it("trims whitespace around each id", () => {
    store.set(difficultyChoiceKey("es"), " co-ban , du-lich ");
    expect(readDifficultyChoice("es")).toBe("co-ban,du-lich");
  });
  it("returns null when storage is unavailable", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(readDifficultyChoice("es")).toBeNull();
  });
  it("returns null when storage throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {},
      removeItem: () => {},
    });
    expect(readDifficultyChoice("es")).toBeNull();
  });
  it("recognises every id in DIFFICULTY_IDS", () => {
    for (const id of DIFFICULTY_IDS) {
      store.set(difficultyChoiceKey("es"), id);
      expect(readDifficultyChoice("es")).toBe(id);
    }
  });
  it("does not see a value stored under another locale's slot", () => {
    store.set(difficultyChoiceKey("ko"), "co-ban");
    expect(readDifficultyChoice("es")).toBeNull();
  });
});

describe("writeDifficultyChoice", () => {
  it("stores a track id under the locale's key", () => {
    writeDifficultyChoice("es", "co-ban");
    expect(store.get(difficultyChoiceKey("es"))).toBe("co-ban");
  });
  it("stores the empty string for all levels", () => {
    writeDifficultyChoice("es", "");
    expect(store.get(difficultyChoiceKey("es"))).toBe("");
  });
  it("round-trips through read", () => {
    writeDifficultyChoice("es", "du-hoc,nang-cao");
    expect(readDifficultyChoice("es")).toBe("du-hoc,nang-cao");
  });
  it("writes for one locale never leak into another", () => {
    writeDifficultyChoice("es", "co-ban");
    writeDifficultyChoice("ko", "du-hoc");
    writeDifficultyChoice("zh", "nang-cao");
    expect(readDifficultyChoice("es")).toBe("co-ban");
    expect(readDifficultyChoice("ko")).toBe("du-hoc");
    expect(readDifficultyChoice("zh")).toBe("nang-cao");
    expect(readDifficultyChoice("ja")).toBeNull();
  });
  it("never throws when storage is unavailable", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(() => writeDifficultyChoice("es", "co-ban")).not.toThrow();
  });
  it("never throws when setItem throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {},
    });
    expect(() => writeDifficultyChoice("es", "co-ban")).not.toThrow();
  });
});

describe("legacy migration", () => {
  it("carries a device-wide pick into the current locale on first read", () => {
    store.set(LEGACY_KEY, "co-ban");
    expect(readDifficultyChoice("es")).toBe("co-ban");
    expect(store.get(difficultyChoiceKey("es"))).toBe("co-ban");
    expect(store.has(LEGACY_KEY)).toBe(false);
  });
  it("deletes the legacy key even when the value is the empty string", () => {
    store.set(LEGACY_KEY, "");
    expect(readDifficultyChoice("es")).toBe("");
    expect(store.has(LEGACY_KEY)).toBe(false);
    expect(store.get(difficultyChoiceKey("es"))).toBe("");
  });
  it("only migrates into the locale the reader is on, not every locale", () => {
    store.set(LEGACY_KEY, "co-ban");
    expect(readDifficultyChoice("es")).toBe("co-ban");
    expect(readDifficultyChoice("ko")).toBeNull();
    expect(readDifficultyChoice("zh")).toBeNull();
  });
  it("does not overwrite a locale slot that already has a value", () => {
    store.set(difficultyChoiceKey("es"), "du-hoc");
    store.set(LEGACY_KEY, "co-ban");
    expect(readDifficultyChoice("es")).toBe("du-hoc");
    expect(store.get(LEGACY_KEY)).toBe("co-ban");
  });
  it("leaves every locale null when nothing was ever stored", () => {
    expect(readDifficultyChoice("es")).toBeNull();
    expect(readDifficultyChoice("ko")).toBeNull();
    expect(readDifficultyChoice("en")).toBeNull();
  });
});
