import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_PREFS,
  PREF_KEY,
  readPreferences,
  writePreferences,
  type Preferences,
} from "../lib/preferences";

function createStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
    setItem: (key: string, value: string) => void map.set(key, String(value)),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
    key: (index: number) => [...map.keys()][index] ?? null,
    get length() {
      return map.size;
    },
  } as unknown as Storage;
}

beforeEach(() => {
  vi.stubGlobal("window", { localStorage: createStorage() });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readPreferences", () => {
  it("returns the defaults when nothing is stored", () => expect(readPreferences()).toEqual(DEFAULT_PREFS));
  it("merges a stored partial over the defaults", () => {
    window.localStorage.setItem(PREF_KEY, JSON.stringify({ dataSaver: true }));
    const prefs = readPreferences();
    expect(prefs.dataSaver).toBe(true);
    expect(prefs.audience).toBe(DEFAULT_PREFS.audience);
  });
  it("falls back to the defaults on malformed JSON", () => {
    window.localStorage.setItem(PREF_KEY, "{nope");
    expect(readPreferences()).toEqual(DEFAULT_PREFS);
  });
  it("honours a stored audience override", () => {
    window.localStorage.setItem(PREF_KEY, JSON.stringify({ audience: "followers" }));
    expect(readPreferences().audience).toBe("followers");
  });
});

describe("writePreferences", () => {
  it("persists a full preference object", () => {
    const next: Preferences = { ...DEFAULT_PREFS, audience: "private", reducedMotion: true };
    writePreferences(next);
    expect(readPreferences()).toEqual(next);
  });
  it("writes valid JSON under the known key", () => {
    writePreferences({ ...DEFAULT_PREFS, pushOn: false });
    const raw = window.localStorage.getItem(PREF_KEY);
    expect(raw && JSON.parse(raw).pushOn).toBe(false);
  });
});

describe("default preferences", () => {
  it("starts public with push on", () => {
    expect(DEFAULT_PREFS.audience).toBe("public");
    expect(DEFAULT_PREFS.pushOn).toBe(true);
  });
  it("starts with motion and data-saver off", () => {
    expect(DEFAULT_PREFS.reducedMotion).toBe(false);
    expect(DEFAULT_PREFS.dataSaver).toBe(false);
  });
});
