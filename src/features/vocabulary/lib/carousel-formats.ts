/**
 * The shapes a carousel can be exported in.
 *
 * Every shape is laid out at one phone-sized width and captured at SLIDE_SCALE. An image
 * fills a phone's width on Instagram, where a layout pixel lands close to one point, so the
 * type reads at the size it reads in the app. Laying a card out at 1080 CSS pixels instead
 * caps the meaning panel's text at about half the size it needs.
 *
 * Kept apart from export-presets: routes and the video recorder read that table, and a slide
 * is a different thing from a clip's frame.
 *
 * Exports: CarouselFormat, CAROUSEL_FORMATS, CJK_FONTS, DEFAULT_CAROUSEL_FORMAT_ID, SLIDE_SCALE,
 *   getCarouselFormat, getSlideLayoutSize
 * Depends on: ./export-presets SafeInsets (type only)
 */

import type { SafeInsets } from "./export-presets";
import type { TargetLocale } from "./target-language";

/** Layout pixels to output pixels. Gives whole layout pixels at every output size. */
export const SLIDE_SCALE = 2.5;

export type CarouselFormat = {
  id: string;
  label: string;
  /** One line on what this shape is for, shown under the label. */
  summary: string;
  /** Output image in pixels. */
  width: number;
  height: number;
  /** Margins every slide keeps. */
  safe: SafeInsets;
  /** Slide 1's margins, where the profile grid's crop takes more than the slide's own. */
  gridSafe?: SafeInsets;
  /**
   * The answer slide. A single word grows to fill its band, so the band stops short of the panel
   * (`bandBottom`, in layout pixels), which keeps even a one-letter word clear of it. `wordY` is the
   * word's place in that band and `panelTop` the panel's place on the stage, both percentages.
   */
  reveal: { bandBottom: number; wordY: number; panelTop: number };
};

export const CAROUSEL_FORMATS: readonly CarouselFormat[] = [
  {
    id: "4x5",
    label: "4:5",
    summary: "The tallest shape the feed shows whole. The grid trims 34 px from each side.",
    width: 1080,
    height: 1350,
    safe: { top: 0.06, right: 0.07, bottom: 0.07, left: 0.07 },
    reveal: { bandBottom: 154, wordY: 47, panelTop: 53 },
  },
  {
    id: "1x1",
    label: "Square",
    summary: "Fills less of the feed. The grid crops 135 px from each side of slide 1.",
    width: 1080,
    height: 1080,
    safe: { top: 0.06, right: 0.07, bottom: 0.07, left: 0.07 },
    gridSafe: { top: 0.06, right: 0.135, bottom: 0.07, left: 0.135 },
    reveal: { bandBottom: 148, wordY: 41, panelTop: 44 },
  },
];

export const DEFAULT_CAROUSEL_FORMAT_ID = "4x5";

/**
 * The face that draws each CJK deck. The system's own differs by machine, and a slide has
 * to come out the same wherever it is made. Export pages only: readers never fetch these.
 */
export const CJK_FONTS: Partial<Record<TargetLocale, string>> = {
  zh: "Noto Sans SC",
  ja: "Noto Sans JP",
  ko: "Noto Sans KR",
};

/** Look a format up by id, falling back to the default. @pure true */
export function getCarouselFormat(id: string | null | undefined): CarouselFormat {
  return (
    CAROUSEL_FORMATS.find((format) => format.id === id) ??
    CAROUSEL_FORMATS.find((format) => format.id === DEFAULT_CAROUSEL_FORMAT_ID)!
  );
}

/** @param format - a carousel format. @returns Its size in layout pixels. @pure true */
export function getSlideLayoutSize(format: CarouselFormat): { width: number; height: number } {
  return { width: format.width / SLIDE_SCALE, height: format.height / SLIDE_SCALE };
}
