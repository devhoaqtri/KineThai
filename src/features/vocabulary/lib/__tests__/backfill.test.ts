import { describe, expect, it } from "vitest";
import {
  VOCAB_MAX_PAGES,
  VOCAB_PAGE_LIMIT,
  canWalkFurther,
  getBlockedRun,
  selectVisibleEntries,
} from "../backfill";
import type { FeedEntry } from "../../types";
import { makeWord } from "./helpers";

const entries = (count: number, from = 0): FeedEntry[] =>
  Array.from({ length: count }, (_, index) => {
    const position = from + index;
    return {
      occurrenceId: `occ${position}`,
      position,
      cycle: 0,
      word: makeWord({ id: `w${position}`, word: `w${position}` }),
    };
  });

const BUFFER = VOCAB_PAGE_LIMIT * VOCAB_MAX_PAGES;

describe("getBlockedRun", () => {
  it("counts the buffered entries after the last visible one", () => {
    const list = entries(10);
    expect(getBlockedRun(list, new Set(["occ0", "occ6"]))).toBe(3);
    expect(getBlockedRun(list, new Set(["occ9"]))).toBe(0);
  });

  it("is the whole buffer when nothing is visible", () =>
    expect(getBlockedRun(entries(10), new Set())).toBe(10));
});

describe("canWalkFurther", () => {
  it("keeps a reader who is reading going far past one buffer of words", () => {
    // Positions 1000+ in a 1000-word level: the stream used to end here because the
    // absolute position passed the buffer size, though every word was showable.
    const list = entries(BUFFER, 1000);
    const run = getBlockedRun(list, new Set(list.map((entry) => entry.occurrenceId)));
    expect(canWalkFurther(1000, run)).toBe(true);
  });

  it("stops once a whole buffer comes back with nothing showable", () => {
    expect(canWalkFurther(1000, BUFFER - 1)).toBe(true);
    expect(canWalkFurther(1000, BUFFER)).toBe(false);
  });

  it("stops after one cycle plus a page for a small pool", () => {
    expect(canWalkFurther(5, 5 + VOCAB_PAGE_LIMIT - 1)).toBe(true);
    expect(canWalkFurther(5, 5 + VOCAB_PAGE_LIMIT)).toBe(false);
  });
});

describe("selectVisibleEntries", () => {
  const seenToday = new Set(["w2", "w3", "w4"]);
  const allowed = (id: string) => !seenToday.has(id);

  it("shows only words the day history allows while pages still load", () => {
    const admitted = new Set<string>();
    const shown = selectVisibleEntries(entries(5), admitted, allowed, false);
    expect(shown.map((entry) => entry.word.id)).toEqual(["w0", "w1"]);
  });

  it("serves words already on the device once loading has stalled", () => {
    const admitted = new Set<string>();
    selectVisibleEntries(entries(5), admitted, allowed, false);
    const shown = selectVisibleEntries(entries(5), admitted, allowed, true);
    expect(shown.map((entry) => entry.word.id)).toEqual(["w0", "w1", "w2", "w3", "w4"]);
  });

  it("only relaxes after the last admitted word, so nothing lands before the card on screen", () => {
    const list = entries(6);
    // w1 is seen and sits between two admitted words; w4 and w5 trail them.
    const seen = new Set(["w1", "w4", "w5"]);
    const admitted = new Set<string>();
    selectVisibleEntries(list, admitted, (id) => !seen.has(id), false);
    const shown = selectVisibleEntries(list, admitted, (id) => !seen.has(id), true);
    expect(shown.map((entry) => entry.word.id)).toEqual(["w0", "w2", "w3", "w4", "w5"]);
  });

  it("keeps an admitted word even after its view is recorded", () => {
    const admitted = new Set<string>();
    selectVisibleEntries(entries(2), admitted, () => true, false);
    const shown = selectVisibleEntries(entries(2), admitted, () => false, false);
    expect(shown).toHaveLength(2);
  });
});
