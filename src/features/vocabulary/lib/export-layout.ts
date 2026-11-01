/**
 * Place the card's text inside a video frame's clear zone.
 *
 * The kinetic stage reserves room at its own top and bottom for the feed's toolbar
 * and action bar. In an exported clip that chrome is gone and the room that matters
 * is the platform's: the area its buttons and caption do not cover. Rather than
 * teach the text fitter a second set of margins, the stage box is moved and
 * stretched so that the fitter's reserved bands fall exactly outside the clear
 * zone — the text then fills the clear zone using the same rules as the app.
 *
 * Exports: CardExportLayout, getExportStageBox, EXPORT_PROGRESS_BAND_PX, EXPORT_BRAND_BAND_PX
 * Depends on: ./export-presets SafeInsets
 */

import type { SafeInsets } from "./export-presets";

export type CardExportLayout = {
  safe: SafeInsets;
  /** Keep the segmented page progress (drawn at the foot of the clear zone). */
  showProgress: boolean;
  /** Draw the brand tag at the head of the clear zone. */
  showBrand: boolean;
  /** Draw one page finished and hold it, for a still image. See CardStill. */
  still?: CardStill;
};

/** A still image of the card: no entrance, no timer, no burst. */
export type CardStill = {
  /** The card's own page, with the spelling coda last. */
  page: number;
  /** Place in the post. The backdrop moves by this, so neighbouring slides join up. */
  slide: number;
  /** Ceiling on the clue text, so sizes stay close across a word's slides. */
  maxTextSize?: number;
  /** Room kept under the brand tag, for the hook on slide 1. */
  headBand?: number;
  /** Paint only the backdrop, for a slide that brings its own content. */
  backdropOnly?: boolean;
  /** Taken off the foot of the answer's band, in px, where a slide is short. */
  answerBandBottom?: number;
  /** Where the answer sits, as a percentage of its band. */
  revealY?: number;
  /** Where the meaning panel starts, as a percentage of the stage. */
  panelTop?: number;
  /** Family for the glyphs the display face lacks, so CJK text is the same on any machine. */
  fallbackFont?: string;
};

/** Room kept at the foot of the clear zone for the page label and progress bar. */
export const EXPORT_PROGRESS_BAND_PX = 58;
/** Room kept at the head of the clear zone for the brand tag. */
export const EXPORT_BRAND_BAND_PX = 34;

/** The stage's own reserved bands, mirrored from post-player getTextSafeInsets. */
const STAGE_TOP_PX = 72;
const STAGE_TOP_SHARE = 0.09;
const STAGE_BOTTOM_PX = 132;
const STAGE_BOTTOM_SHARE = 0.17;

/**
 * Solve the stage box for a card of the given size.
 * @param width - card width in CSS px
 * @param height - card height in CSS px
 * @param layout - clear-zone margins and which furniture is shown
 * @returns Stage offsets from the card's top and bottom edges (either may be
 *   negative: the stage is only a positioning box and may overhang the card), the
 *   stage's bottom reserved band, and the size of the area text actually gets
 * @pure true
 */
export function getExportStageBox(
  width: number,
  height: number,
  layout: CardExportLayout,
): {
  top: number;
  bottom: number;
  bottomBand: number;
  textWidth: number;
  textHeight: number;
} {
  const { safe } = layout;
  const textTop =
    height * safe.top +
    (layout.showBrand ? EXPORT_BRAND_BAND_PX : 0) +
    (layout.still?.headBand ?? 0);
  const textBottom =
    height * (1 - safe.bottom) - (layout.showProgress ? EXPORT_PROGRESS_BAND_PX : 12);
  const textHeight = Math.max(120, textBottom - textTop);
  // The bands depend on the stage height, which depends on the bands; a few passes
  // settle it (each band is either a constant or a fixed share of the height).
  let stageHeight = textHeight + STAGE_TOP_PX + STAGE_BOTTOM_PX;
  let topBand = STAGE_TOP_PX;
  let bottomBand = STAGE_BOTTOM_PX;
  for (let pass = 0; pass < 6; pass += 1) {
    topBand = Math.max(STAGE_TOP_PX, stageHeight * STAGE_TOP_SHARE);
    bottomBand = Math.max(STAGE_BOTTOM_PX, stageHeight * STAGE_BOTTOM_SHARE);
    stageHeight = textHeight + topBand + bottomBand;
  }
  return {
    top: textTop - topBand,
    bottom: height - textBottom - bottomBand,
    bottomBand,
    textWidth: width * (1 - safe.left - safe.right),
    textHeight,
  };
}
