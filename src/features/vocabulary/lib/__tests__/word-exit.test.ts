/**
 * Rewinding off a word's last pages takes the word back: nothing that was about to move the
 * feed on may still do it. The card below is the VocabularyCard's wiring of lib/word-exit
 * around useLearningPlayback's page clock: one timer per page, re-armed on every page change;
 * the last page's clock ends the word; a tap goes through cardTapAction.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cardTapAction, createWordExit, tapZoneAt } from "../word-exit";

const WIDTH = 390;
const REWIND_X = 20;
const PAUSE_X = WIDTH / 2;
const FORWARD_X = WIDTH - 20;
/** The strip's exit (VocabularyCard STRIP_EXIT_MS). */
const EXIT_MS = 548;
/** lead, definition, anticipation, reveal, then the spelling coda. */
const DURATIONS = [4000, 4000, 4000, 6000, 2500];
const REVEAL = 3;
const CODA = 4;

function playCard() {
  const advanced = vi.fn();
  const exit = createWordExit(EXIT_MS);
  let page = 0;
  let clock: ReturnType<typeof setTimeout> | undefined;
  const goTo = (next: number) => {
    page = next;
    exit.follow(`0:${page}`);
    clearTimeout(clock);
    clock = setTimeout(() => {
      if (page === CODA) exit.begin(advanced);
      else goTo(page + 1);
    }, DURATIONS[page]);
  };
  const tap = (x: number) => {
    const action = cardTapAction(tapZoneAt(x, WIDTH), page > REVEAL);
    if (action === "end-word") exit.begin(advanced);
    else if (action === "previous") goTo(Math.max(0, page - 1));
    else if (action === "next") goTo(Math.min(CODA, page + 1));
  };
  goTo(0);
  return { advanced, tap, page: () => page, reveal: () => goTo(REVEAL) };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("tap zones", () => {
  it("splits the card into rewind, pause and forward", () => {
    expect(tapZoneAt(REWIND_X, WIDTH)).toBe("rewind");
    expect(tapZoneAt(PAUSE_X, WIDTH)).toBe("pause");
    expect(tapZoneAt(FORWARD_X, WIDTH)).toBe("forward");
  });

  it("keeps a clue page's taps as they were", () => {
    expect(cardTapAction("rewind", false)).toBe("previous");
    expect(cardTapAction("pause", false)).toBe("toggle-pause");
    expect(cardTapAction("forward", false)).toBe("next");
  });

  it("steps back from the spelling coda in the rewind zone; elsewhere a coda tap ends the word", () => {
    expect(cardTapAction("rewind", true)).toBe("previous");
    expect(cardTapAction("pause", true)).toBe("end-word");
    expect(cardTapAction("forward", true)).toBe("end-word");
  });
});

describe("rewinding off the spelling coda", () => {
  it("stays on the word when the reader taps back two pages from the coda", () => {
    const card = playCard();
    card.reveal();
    card.tap(FORWARD_X);
    expect(card.page()).toBe(CODA);
    card.tap(REWIND_X);
    card.tap(REWIND_X);
    expect(card.page()).toBe(REVEAL - 1);
    // Past the coda's duration and its exit: the old ending must not land.
    vi.advanceTimersByTime(DURATIONS[CODA]! + EXIT_MS + 100);
    expect(card.advanced).not.toHaveBeenCalled();
    expect(card.page()).toBe(REVEAL - 1);
  });

  it("drops the exit when the reader rewinds as the coda's own clock runs out", () => {
    const card = playCard();
    card.reveal();
    vi.advanceTimersByTime(DURATIONS[REVEAL]! + DURATIONS[CODA]!);
    expect(card.page()).toBe(CODA);
    // The strip is leaving; the reader steps back before the stream moves on.
    vi.advanceTimersByTime(EXIT_MS / 2);
    card.tap(REWIND_X);
    expect(card.page()).toBe(REVEAL);
    vi.advanceTimersByTime(EXIT_MS * 2);
    expect(card.advanced).not.toHaveBeenCalled();
    expect(card.page()).toBe(REVEAL);
  });

  it("then plays forward on its own clock and moves on once, at the word's end", () => {
    const card = playCard();
    card.reveal();
    card.tap(FORWARD_X);
    card.tap(REWIND_X);
    card.tap(REWIND_X);
    vi.advanceTimersByTime(DURATIONS[REVEAL - 1]!);
    expect(card.page()).toBe(REVEAL);
    vi.advanceTimersByTime(DURATIONS[REVEAL]!);
    expect(card.page()).toBe(CODA);
    vi.advanceTimersByTime(DURATIONS[CODA]!);
    expect(card.advanced).not.toHaveBeenCalled();
    vi.advanceTimersByTime(EXIT_MS);
    expect(card.advanced).toHaveBeenCalledTimes(1);
  });

  it("still lets a coda tap outside the rewind zone end the word, once", () => {
    const card = playCard();
    card.reveal();
    card.tap(FORWARD_X);
    card.tap(PAUSE_X);
    card.tap(FORWARD_X);
    vi.advanceTimersByTime(EXIT_MS);
    expect(card.advanced).toHaveBeenCalledTimes(1);
    expect(card.page()).toBe(CODA);
  });
});

describe("the word's exit", () => {
  it("is dropped by a page change and by cancel, and never twice", () => {
    const leave = vi.fn();
    const exit = createWordExit(EXIT_MS);
    exit.follow("0:4");
    expect(exit.begin(leave)).toBe(true);
    expect(exit.begin(leave)).toBe(false);
    expect(exit.follow("0:4")).toBe(false);
    expect(exit.follow("0:3")).toBe(true);
    expect(exit.pending()).toBe(false);
    vi.advanceTimersByTime(EXIT_MS * 2);
    expect(leave).not.toHaveBeenCalled();
    exit.begin(leave);
    expect(exit.cancel()).toBe(true);
    expect(exit.cancel()).toBe(false);
    vi.advanceTimersByTime(EXIT_MS * 2);
    expect(leave).not.toHaveBeenCalled();
    exit.begin(leave);
    vi.advanceTimersByTime(EXIT_MS);
    expect(leave).toHaveBeenCalledTimes(1);
    expect(exit.pending()).toBe(false);
  });
});
