/**
 * Whether a change of the word on screen has a reason, or is drift to be pulled back.
 *
 * The word on screen may change for three reasons only: the reader moved it, the stream
 * moved it, or the word left the list. A reader's touch, wheel, pointer or key opens a
 * window in which wherever the scroll lands counts as theirs, long enough for momentum to
 * coast to rest. A move the stream makes itself (the answer's clock, a coda tap's advance,
 * a key press) is different: it means exactly ONE row. It used to open the same blanket
 * window, and for its 2.5 s any row the scroll reached was trusted; on a snap container the
 * feed then walked one word per frame on its own (one auto advance → ~30 words passed
 * through and recorded as seen, measured on 96% of auto advances in a 67-minute run).
 * Now a scripted move names its row: until its window ends, only that row is accepted, and
 * anything else is drift.
 *
 * Exports: acceptsWordChange, ScriptedMove
 * Depends on: none
 */

/** A row the stream itself scrolled to, and until when that move vouches for it. */
export type ScriptedMove = { id: string; until: number };

/**
 * @param change.id The word the scroll rests on now.
 * @param change.anchor The word the feed is anchored on (null before the first word).
 * @param change.gliding A swipe's destination is still pending (its glide is in flight).
 * @param change.scripted The stream's own last move, if its window is still open.
 * @param change.lastIntent When the reader last touched, scrolled or pressed a key.
 * @param change.now The current time, on the same clock.
 * @param change.intentWindowMs How long a reader's input vouches for where the scroll lands.
 * @returns True when the change stands; false when it is drift.
 * @pure true
 */
export function acceptsWordChange(change: {
  id: string;
  anchor: string | null;
  gliding: boolean;
  scripted: ScriptedMove | null;
  lastIntent: number;
  now: number;
  intentWindowMs: number;
}): boolean {
  const { id, anchor, gliding, scripted, lastIntent, now, intentWindowMs } = change;
  if (anchor === null || id === anchor || gliding) return true;
  // The stream's own move is the narrower promise, so it wins over the blanket window while
  // it lasts: a coda TAP opens the reader's window just before it asks for one row.
  if (scripted && now < scripted.until) return id === scripted.id;
  return now - lastIntent < intentWindowMs;
}
