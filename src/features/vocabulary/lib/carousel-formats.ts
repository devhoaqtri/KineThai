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
 * Exports: CarouselFormat, CAROUSEL_FORMATS, DEFAULT_CAROUSEL_FORMAT_ID, SLIDE_SCALE,
 *   getCarouselFormat, getSlideLayoutSize
 * Depends on: ./export-presets SafeInsets (type only)
 */

import type { SafeInsets } from "./export-presets";

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
};

export const CAROUSEL_FORMATS: readonly CarouselFormat[] = [
  {
    id: "4x5",
    label: "4:5",
    summary: "The tallest shape the feed shows whole. The grid trims 34 px from each side.",
    width: 1080,
    height: 1350,
    safe: { top: 0.06, right: 0.07, bottom: 0.07, left: 0.07 },
  },
];

export const DEFAULT_CAROUSEL_FORMAT_ID = "4x5";

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
