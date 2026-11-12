import { describe, expect, it } from "vitest";
import { acceptsWordChange } from "../feed-intent";

const base = {
  id: "b",
  anchor: "a",
  gliding: false,
  scripted: null,
  lastIntent: -Infinity,
  now: 10_000,
  intentWindowMs: 2500,
};

describe("acceptsWordChange", () => {
  it("rejects a change nobody asked for", () => {
    expect(acceptsWordChange(base)).toBe(false);
  });

  it("accepts staying on the anchor, the first word, and a swipe's glide", () => {
    expect(acceptsWordChange({ ...base, id: "a" })).toBe(true);
    expect(acceptsWordChange({ ...base, anchor: null })).toBe(true);
    expect(acceptsWordChange({ ...base, gliding: true })).toBe(true);
  });

  it("accepts wherever the scroll lands shortly after the reader's own input", () => {
    expect(acceptsWordChange({ ...base, lastIntent: 9_000 })).toBe(true);
    expect(acceptsWordChange({ ...base, id: "z", lastIntent: 9_000 })).toBe(true);
    expect(acceptsWordChange({ ...base, lastIntent: 7_000 })).toBe(false);
  });

  it("accepts an auto advance's own row only, not the rows the feed walks on to", () => {
    const scripted = { id: "b", until: 12_500 };
    expect(acceptsWordChange({ ...base, scripted })).toBe(true);
    // The runaway: one advance, then the next word, and the next, each a frame later.
    for (const id of ["c", "d", "e", "f"]) {
      expect(acceptsWordChange({ ...base, anchor: "b", id, scripted })).toBe(false);
    }
  });

  it("keeps the advance's promise narrow even right after a coda tap", () => {
    // The tap's pointerdown opened the reader's window, then the advance named row b.
    const scripted = { id: "b", until: 12_500 };
    expect(acceptsWordChange({ ...base, anchor: "b", id: "c", scripted, lastIntent: 9_990 })).toBe(false);
  });

  it("returns to the reader's window once the advance's own has ended", () => {
    const scripted = { id: "b", until: 9_000 };
    expect(acceptsWordChange({ ...base, id: "c", scripted, lastIntent: 9_500 })).toBe(true);
    expect(acceptsWordChange({ ...base, id: "c", scripted })).toBe(false);
  });
});
