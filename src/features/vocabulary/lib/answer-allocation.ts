/**
 * How a portrait answer page shares its height between the word and the meaning panel when
 * the two do not both fit as laid out. Exports: ANSWER_HEAD_PX, ANSWER_SEAM_PX,
 * MIN_WORD_PX, MIN_WORD_SHARE, MIN_PANEL_SCALE, allocateAnswer. Depends on: landscape-geometry.
 *
 * A phone-shaped card never needs this: the word is fitted around the 34% line and the panel
 * has the lower half. A short card (an Android split-screen half, 360 × 365) or a wide,
 * short one (a folded iPhone Duo) does: the word alone can reach the midline and the panel's
 * cap then stops it short of its own text. Here the panel is given the height its text
 * needs, the word is fitted into what is left between the toolbar and the panel, and when
 * that would leave the word smaller than MIN_WORD_PX (or MIN_WORD_SHARE of the room), the
 * panel's text is set smaller instead, down to MIN_PANEL_SCALE.
 */
import { LANDSCAPE_GEOMETRY } from "./landscape-geometry";

/** The toolbar's share of the top of the card: the word is never fitted above this. */
export const ANSWER_HEAD_PX = LANDSCAPE_GEOMETRY.head;
/** Clearance between the word's box and the panel (the landscape seam, too). */
export const ANSWER_SEAM_PX = 16;
/** The word keeps at least this much height, however much text the panel holds ... */
export const MIN_WORD_PX = 56;
/** ... and at least this share of the room the two divide. */
export const MIN_WORD_SHARE = 0.3;
/** The panel's text is never set below this share of its own size. */
export const MIN_PANEL_SCALE = 0.78;

export type AnswerAllocation = {
  /** Where the word's box must end (px from the card's top), or null: it already fits. */
  wordFoot: number | null;
  /** The panel's text size as a share of its own, 1 when it is not shrunk. */
  panelScale: number;
};

/**
 * Share the answer page's height, or return null when the layout already fits.
 * All lengths are px in the card's coordinates.
 */
export function allocateAnswer({
  capBottom,
  panelTop,
  panelFixed,
  panelContent,
  wordBottom,
}: {
  /** The lowest the panel may reach: its top plus its max-height. */
  capBottom: number;
  /** Where the panel starts as laid out (under the word, or the midline). */
  panelTop: number;
  /** The panel's height that does not scale with its text: padding, border, margins. */
  panelFixed: number;
  /** The panel's text height at its own size (scale 1). */
  panelContent: number;
  /** The bottom of the word's box as fitted. */
  wordBottom: number;
}): AnswerAllocation | null {
  const need = panelFixed + panelContent;
  const fits = panelTop + need <= capBottom + 0.5 && wordBottom + ANSWER_SEAM_PX <= panelTop + 0.5;
  if (fits) return null;

  const room = capBottom - ANSWER_HEAD_PX - ANSWER_SEAM_PX;
  const wordMin = Math.max(MIN_WORD_PX, room * MIN_WORD_SHARE);
  let panelScale = 1;
  if (room - need < wordMin && panelContent > 0) {
    panelScale = Math.min(
      1,
      Math.max(MIN_PANEL_SCALE, (room - wordMin - panelFixed) / panelContent),
    );
  }
  const panel = panelFixed + panelContent * panelScale;
  // Never squeeze the word to nothing: past this the panel's own scroller is the last resort.
  const wordFoot = Math.max(ANSWER_HEAD_PX + MIN_WORD_PX * 0.5, capBottom - panel - ANSWER_SEAM_PX);
  return { wordFoot: wordBottom > wordFoot + 0.5 ? wordFoot : null, panelScale };
}
