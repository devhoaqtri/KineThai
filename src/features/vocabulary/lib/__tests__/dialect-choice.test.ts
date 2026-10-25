import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DIALECT_CHOICE_KEY, readDialectChoice, writeDialectChoice } from "../dialect-choice";

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

describe("readDialectChoice", () => {
  it("defaults to the standard visuals", () => expect(readDialectChoice()).toBe("default"));
  it("reads back a stored douyin choice", () => {
    store.set(DIALECT_CHOICE_KEY, "douyin");
    expect(readDialectChoice()).toBe("douyin");
  });
  it("reads back a stored default choice", () => {
    store.set(DIALECT_CHOICE_KEY, "default");
    expect(readDialectChoice()).toBe("default");
  });
  it("falls back quietly on an unknown value", () => {
    store.set(DIALECT_CHOICE_KEY, "tiktok");
    expect(readDialectChoice()).toBe("default");
  });
  it("falls back when storage is unavailable", () => {
    vi.unstubAllGlobals();
    vi.stubGlobal("localStorage", undefined);
    expect(readDialectChoice()).toBe("default");
  });
  it("falls back when storage throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
    });
    expect(readDialectChoice()).toBe("default");
  });
});

describe("writeDialectChoice", () => {
  it("stores douyin under the shared key", () => {
    writeDialectChoice("douyin");
    expect(store.get(DIALECT_CHOICE_KEY)).toBe("douyin");
  });
  it("round-trips through read", () => {
    writeDialectChoice("douyin");
    expect(readDialectChoice()).toBe("douyin");
    writeDialectChoice("default");
    expect(readDialectChoice()).toBe("default");
  });
  it("never throws when storage is unavailable", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(() => writeDialectChoice("douyin")).not.toThrow();
  });
  it("never throws when setItem throws", () => {
    vi.stubGlobal("localStorage", {
      setItem: () => {
        throw new Error("quota");
      },
    });
    expect(() => writeDialectChoice("douyin")).not.toThrow();
  });
});
