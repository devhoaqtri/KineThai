/**
 * How a vocabulary card leaves its word: what a tap on the card asks for, and the exit that
 * plays before the stream moves on.
 *
 * Ending a word plays the answer strip's exit first and moves the stream on when it has
 * passed. That exit belongs to the page it began on (the spelling coda): a reader who steps
 * back while it plays has taken the word back, so a page change drops it. Nothing here moves
 * a page or ends a word by itself (AGENTS.md, a scene is skipped only by a tap or swipe); a
 * rewind is the reader's own gesture, and a timer outliving it was the bug.
 *
 * Exports: TAP_REWIND_EDGE, TAP_FORWARD_EDGE, tapZoneAt, cardTapAction, createWordExit,
 *   TapZone, CardTapAction, WordExit
 * Depends on: nothing (the exit runs on setTimeout, so it plays under fake timers)
 */

/** Share of the card's width, from its left edge, that is the rewind zone. */
export const TAP_REWIND_EDGE = 0.35;
/** Share of the card's width past which a tap is the forward zone. */
export const TAP_FORWARD_EDGE = 0.65;

/** The three tap zones: left steps back, the centre pauses or plays, right steps on. */
export type TapZone = "rewind" | "pause" | "forward";

/**
 * Which zone a tap landed in.
 * @param x Tap position from the card's left edge, in px.
 * @param width The card's width, in px.
 */
export function tapZoneAt(x: number, width: number): TapZone {
  if (x < width * TAP_REWIND_EDGE) return "rewind";
  if (x > width * TAP_FORWARD_EDGE) return "forward";
  return "pause";
}

/** What a tap asks the card to do. */
export type CardTapAction = "end-word" | "previous" | "next" | "toggle-pause";

/**
 * What a tap in `zone` asks for.
 * @param zone Where the tap landed (tapZoneAt).
 * @param onCoda The card is on its spelling coda, after the answer.
 */
export function cardTapAction(zone: TapZone, onCoda: boolean): CardTapAction {
  // The rewind zone steps back on every page, the coda included: it used to end the word
  // there like any other coda tap, so a reader stepping back to the answer was sent on.
  if (zone === "rewind") return "previous";
  // During the spelling coda any other tap means "I have it": the word ends.
  if (onCoda) return "end-word";
  if (zone === "forward") return "next";
  return "toggle-pause";
}

/** The exit a card plays before the stream moves on. */
export type WordExit = {
  /**
   * The card is now on this page (any key that changes when the page does, such as
   * `replay:page`). Called on every page change.
   * @returns True when it dropped an exit that was under way.
   */
  follow: (page: string) => boolean;
  /**
   * Start leaving: `leave` runs once the exit has played, unless the exit is dropped first.
   * @returns False when an exit is already under way (that one stands).
   */
  begin: (leave: () => void) => boolean;
  /**
   * Drop an exit that is under way: an overlay came up, the word left the screen, or the
   * card unmounted. The feed stays on the word.
   * @returns True when there was one to drop.
   */
  cancel: () => boolean;
  /** An exit is under way. */
  pending: () => boolean;
};

/**
 * The card's exit clock.
 * @param delayMs How long the exit plays before `leave` runs.
 */
export function createWordExit(delayMs: number): WordExit {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let page: string | undefined;
  const cancel = () => {
    if (timer === undefined) return false;
    clearTimeout(timer);
    timer = undefined;
    return true;
  };
  return {
    follow(next) {
      const moved = next !== page;
      page = next;
      // The page moved while the strip was leaving: the reader stepped back (a rewind tap or
      // swipe) and has the word back. The page they are on plays out on its own clock, and
      // the word ends again only from its end.
      return moved && cancel();
    },
    begin(leave) {
      if (timer !== undefined) return false;
      timer = setTimeout(() => {
        timer = undefined;
        leave();
      }, delayMs);
      return true;
    },
    cancel,
    pending: () => timer !== undefined,
  };
}
