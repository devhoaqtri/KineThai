import { describe, expect, it } from "vitest";
import {
  VOCAB_MAX_PAGES,
  VOCAB_PAGE_LIMIT,
  canWalkFurther,
  getBlockedRun,
  holdAnchorRows,
  selectVisibleEntries,
  wantsWordsAhead,
} from "../backfill";
import type { FeedEntry } from "../../types";
import { makeWord } from "./helpers";

const entry = (position: number, wordId = `w${position}`): FeedEntry => ({
  occurrenceId: `occ${position}`,
  position,
  cycle: 0,
  word: makeWord({ id: wordId, word: wordId }),
});
const range = (from: number, to: number) =>
  Array.from({ length: to - from }, (_, index) => entry(from + index));
const ids = (list: readonly FeedEntry[]) => list.map((item) => item.occurrenceId);

describe("holdAnchorRows", () => {
  it("returns the new list untouched while it still holds the anchor", () => {
    const next = range(12, 36);
    expect(holdAnchorRows(range(0, 36), next, "occ20")).toBe(next);
  });

  it("keeps the anchor and the rows after it when their page is dropped", () => {
    // Page 0-11 is dropped while the reader is on 9: 9, 10, 11 stay, 0-8 go.
    const out = holdAnchorRows(range(0, 36), range(12, 48), "occ9");
    expect(ids(out)).toEqual(ids([...range(9, 12), ...range(12, 48)]));
  });

  it("keeps holding the rows on later changes until the reader moves past them", () => {
    const first = holdAnchorRows(range(0, 36), range(12, 48), "occ9");
    const second = holdAnchorRows(first, range(24, 60), "occ10");
    expect(ids(second)[0]).toBe("occ10");
    expect(ids(second)).toContain("occ11");
    expect(ids(second)).not.toContain("occ9");
    // The reader is now on a row the query still has: the held rows behind them go.
    expect(holdAnchorRows(second, range(24, 60), "occ30")).toEqual(range(24, 60));
  });

  it("puts the kept rows after a lead word that is still there, not before it", () => {
    const lead: FeedEntry = { ...entry(-1, "shared"), occurrenceId: "shared:x" };
    const previous = [lead, ...range(0, 6)];
    const fresh = [lead, ...range(500, 506)];
    const out = holdAnchorRows(previous, fresh, "occ3");
    expect(ids(out)).toEqual(["shared:x", "occ3", "occ4", "occ5", ...ids(range(500, 506))]);
  });

  it("does nothing without an anchor or for an anchor it never had", () => {
    const next = range(12, 24);
    expect(holdAnchorRows(range(0, 24), next, null)).toBe(next);
    expect(holdAnchorRows(range(0, 24), next, "elsewhere")).toBe(next);
  });
});

describe("wantsWordsAhead", () => {
  it("keeps a lookahead while the buffer has room", () => {
    expect(wantsWordsAhead(3, false)).toBe(true);
    expect(wantsWordsAhead(4, false)).toBe(false);
  });

  it("asks a full buffer for a page only when nothing is left ahead", () => {
    expect(wantsWordsAhead(0, true)).toBe(true);
    expect(wantsWordsAhead(1, true)).toBe(false);
  });
});

/**
 * The stream's paging loop over a pool the day history has nearly emptied: the query keeps
 * VOCAB_MAX_PAGES pages and drops the oldest as one arrives, and the reader moves on one word
 * at a time. Reproduces the flash: with the old rules (lookahead of 4 on a full buffer, no
 * hold) the page under the reader was dropped and the screen jumped to another word.
 */
function simulate(options: { hold: boolean; fullBufferAhead: boolean; words: number }) {
  const pool = 400;
  // One showable word in 40: the shape of a level whose words are almost all in a history
  // several views share.
  const allowed = (wordId: string) => (Number(wordId.slice(1)) % pool) % 40 === 7;
  let pages: FeedEntry[][] = [];
  let nextPosition = 0;
  const admitted = new Set<string>();
  let rows: readonly FeedEntry[] = [];
  let anchor: string | null = null;
  let fetches = 0;
  let lostAnchor = 0;
  const wordsShown: string[] = [];
  const fetchPage = () => {
    fetches += 1;
    pages = [
      ...pages,
      Array.from({ length: VOCAB_PAGE_LIMIT }, (_, index) => {
        const position = nextPosition + index;
        return entry(position, `w${position % pool}`);
      }),
    ];
    nextPosition += VOCAB_PAGE_LIMIT;
    if (pages.length > VOCAB_MAX_PAGES) pages = pages.slice(1);
  };
  const refresh = () => {
    const flat = pages.flat();
    rows = options.hold ? holdAnchorRows(rows, flat, anchor) : flat;
    const visible = selectVisibleEntries(rows, admitted, allowed, false);
    let index = anchor === null ? 0 : visible.findIndex((row) => row.occurrenceId === anchor);
    if (anchor !== null && index < 0) {
      lostAnchor += 1;
      index = 0;
    }
    if (visible[index]) anchor = visible[index].occurrenceId;
    return { visible, index, flat };
  };
  fetchPage();
  for (let read = 0; read < options.words; read += 1) {
    // Fetch the way the stream does, until it stops asking.
    for (let guard = 0; guard < 200; guard += 1) {
      const { visible, index, flat } = refresh();
      const ahead = visible.length - 1 - index;
      const full = pages.length >= VOCAB_MAX_PAGES;
      const want = options.fullBufferAhead ? wantsWordsAhead(ahead, full) : ahead < 4;
      const visibleIds = new Set(visible.map((row) => row.occurrenceId));
      if (!want || !canWalkFurther(pool, getBlockedRun(flat, visibleIds))) break;
      fetchPage();
    }
    const { visible, index } = refresh();
    if (anchor) wordsShown.push(anchor);
    // The word plays out and the stream moves on to the next showable row, if any.
    const next = visible[index + 1];
    if (!next) break;
    anchor = next.occurrenceId;
  }
  return { fetches, lostAnchor, wordsShown };
}

describe("paging a nearly blocked level", () => {
  it("lost the word on screen under the old rules (the flash)", () => {
    const old = simulate({ hold: false, fullBufferAhead: false, words: 40 });
    expect(old.lostAnchor).toBeGreaterThan(0);
  });

  it("never loses the word on screen, and fetches only to find the next word", () => {
    const run = simulate({ hold: true, fullBufferAhead: true, words: 40 });
    expect(run.lostAnchor).toBe(0);
    expect(run.wordsShown).toHaveLength(40);
    expect(new Set(run.wordsShown).size).toBe(40);
    // One showable word in 40 positions is about 3.3 pages a word; the lookahead chain asked
    // for far more than the words it found.
    expect(run.fetches / run.wordsShown.length).toBeLessThan(4.5);
  });
});
