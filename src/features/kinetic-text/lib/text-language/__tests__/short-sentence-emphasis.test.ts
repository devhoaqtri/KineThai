import { describe, expect, it } from "vitest";
import {
  SHORT_SENTENCE_MAX_WORDS,
  countSentenceWords,
  limitShortSentenceEmphasis,
} from "../short-sentence-emphasis";

const toSortedArray = (set: Set<number>) => [...set].sort((left, right) => left - right);

describe("SHORT_SENTENCE_MAX_WORDS", () => {
  it("caps a short page at four words", () => expect(SHORT_SENTENCE_MAX_WORDS).toBe(4));
});

describe("countSentenceWords", () => {
  it("counts plain words", () => expect(countSentenceWords(["a", "b", "c"])).toBe(3));
  it("ignores an em dash", () => expect(countSentenceWords(["—"])).toBe(0));
  it("ignores an ellipsis", () => expect(countSentenceWords(["…"])).toBe(0));
  it("counts words around punctuation-only tokens", () =>
    expect(countSentenceWords(["—", "hello", "…"])).toBe(1));
  it("counts a numeric token", () => expect(countSentenceWords(["123"])).toBe(1));
  it("returns zero for an empty page", () => expect(countSentenceWords([])).toBe(0));
  it("counts Vietnamese syllables", () => expect(countSentenceWords(["im", "lặng", "nhé"])).toBe(3));
});

describe("limitShortSentenceEmphasis", () => {
  it("returns a longer page unchanged", () =>
    expect(toSortedArray(limitShortSentenceEmphasis(["a", "b", "c", "d", "e"], [0, 1, 2]))).toEqual([
      0, 1, 2,
    ]));
  it("keeps a single emphasis as-is", () =>
    expect(toSortedArray(limitShortSentenceEmphasis(["the", "quick", "brown", "fox"], [2]))).toEqual([
      2,
    ]));
  it("returns an empty set for no emphasis", () =>
    expect(limitShortSentenceEmphasis(["the", "quick"], []).size).toBe(0));
  it("collapses an English run to its longest word", () =>
    expect(toSortedArray(limitShortSentenceEmphasis(["the", "quick", "brown", "fox"], [0, 1, 2, 3]))).toEqual([1]));
  it("keeps only the first run when the selection is split", () =>
    expect(toSortedArray(limitShortSentenceEmphasis(["the", "quick", "brown", "fox"], [0, 2]))).toEqual([0]));
  it("prefers a whole bound phrase over the anchor alone", () =>
    expect(toSortedArray(limitShortSentenceEmphasis(["im", "lặng", "nhé"], [1, 2]))).toEqual([0, 1]));
  it("pairs an anchor with its compound neighbour in Vietnamese", () =>
    expect(toSortedArray(limitShortSentenceEmphasis(["học", "sinh", "giỏi"], [0, 1, 2]))).toEqual([0, 1]));
  it("deduplicates the incoming indexes", () =>
    expect(toSortedArray(limitShortSentenceEmphasis(["a", "b", "c", "d", "e"], [1, 1, 1]))).toEqual([1]));
  it("never returns more than one word on a short page", () => {
    const result = limitShortSentenceEmphasis(["the", "quick", "brown", "fox"], [0, 1, 2, 3]);
    expect(result.size).toBeLessThanOrEqual(2);
  });
  it("is deterministic", () =>
    expect(
      toSortedArray(limitShortSentenceEmphasis(["im", "lặng", "nhé"], [1, 2])),
    ).toEqual(toSortedArray(limitShortSentenceEmphasis(["im", "lặng", "nhé"], [1, 2]))));
});
