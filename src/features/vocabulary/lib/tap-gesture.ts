/**
 * One physical tap is one gesture. A touch screen reports a tap twice: the touch events, and
 * then the browser's compatibility mouse events (mousedown, mouseup, click) at the same spot,
 * a moment after the finger lifts. A card that reads both as taps moves on twice for one
 * touch: a tap on a clue page skips two pages, and each tap spends two of the skip limiter's
 * tokens. Emulated mouse events that follow a touch are therefore ignored; a real mouse
 * click, with no touch just before it, is a gesture of its own.
 *
 * Exports: createTapGesture, EMULATED_MOUSE_WINDOW_MS, TapGesture, TapSource, TapStart, TapEnd
 * Depends on: nothing (time and coordinates are passed in, so the logic runs under test)
 */

/**
 * How long after a touch ends its compatibility mouse events are still the same tap. Browsers
 * send them within a few hundred milliseconds; a second real mouse click is never this soon
 * after a touch on the same screen.
 */
export const EMULATED_MOUSE_WINDOW_MS = 1000;

export type TapSource = "touch" | "mouse";

export type TapStart = { x: number; y: number; t: number };

/** A gesture that has ended: where it began, and where and when it lifted. */
export type TapEnd = { start: TapStart; x: number; y: number; t: number };

export type TapGesture = {
  /** A finger or button went down. Ignored when it is a touch's emulated mouse event. */
  begin: (source: TapSource, x: number, y: number, t: number) => void;
  /**
   * A finger or button came up. Returns the gesture it completes, or null when there is none
   * to complete: nothing began, or the event is a touch's emulated mouse event.
   */
  end: (source: TapSource, x: number, y: number, t: number) => TapEnd | null;
  /** Forget the gesture in progress (a touch that was cancelled, or one that began on a control). */
  cancel: () => void;
  /** The gesture in progress, if any (a drag reads where it started). */
  current: () => TapStart | null;
};

/**
 * Build a gesture tracker for one card.
 * @param windowMs How long a touch's emulated mouse events are folded into that touch
 * @returns The tracker
 */
export function createTapGesture(windowMs: number = EMULATED_MOUSE_WINDOW_MS): TapGesture {
  let start: TapStart | null = null;
  let touchEndedAt = Number.NEGATIVE_INFINITY;
  const emulated = (source: TapSource, t: number) =>
    source === "mouse" && t - touchEndedAt < windowMs;
  return {
    begin(source, x, y, t) {
      if (emulated(source, t)) return;
      start = { x, y, t };
    },
    end(source, x, y, t) {
      if (source === "touch") touchEndedAt = t;
      else if (emulated(source, t)) return null;
      const began = start;
      start = null;
      return began ? { start: began, x, y, t } : null;
    },
    cancel() {
      start = null;
    },
    current: () => start,
  };
}
