import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadRecallMarks, saveRecallMarks } from "../recall-marks";

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("recall marks", () => {
  it("starts empty", () => {
    expect(loadRecallMarks()).toEqual({});
  });

  it("round-trips checks and crosses", () => {
    saveRecallMarks({ apple: "no", agree: "yes" });
    expect(loadRecallMarks()).toEqual({ agree: "yes", apple: "no" });
  });

  it("reads the older list of remembered ids as checks", () => {
    store.set("wordcrawler:recall-marks:v1", JSON.stringify(["agree", "apple"]));
    expect(loadRecallMarks()).toEqual({ agree: "yes", apple: "yes" });
  });

  it("drops a stored value that is neither a check nor a cross", () => {
    store.set("wordcrawler:recall-marks:v1", JSON.stringify({ agree: true }));
    expect(loadRecallMarks()).toEqual({});
  });
});
