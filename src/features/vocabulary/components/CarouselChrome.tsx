/**
 * What a carousel adds to a card: the hook on slide 1, the marker on every slide, and the
 * handle and address on the closing spelling page.
 *
 * Drawn over the card rather than inside it, so a reader's card never carries any of this.
 * The layout is in vocabulary-export.css.
 *
 * Exports: CarouselChrome
 * Depends on: lucide-react, ../lib/carousel, ../lib/carousel-copy, ../lib/presets (type)
 */

import type { CSSProperties } from "react";
import { ArrowRight } from "lucide-react";
import type { CarouselSlide } from "../lib/carousel";
import { CAROUSEL_HOOK, CAROUSEL_SWIPE_CUE } from "../lib/carousel-copy";
import type { SafeInsets } from "../lib/export-presets";
import type { VocabularyTheme } from "../lib/presets";

const DOT_PX = 6;
const DOT_GAP_PX = 11;

/**
 * Where the thread runs. It reaches both edges so it continues across a swipe, except past
 * the ends of the post, where there is nothing to continue to.
 * @param index - this slide's place
 * @param count - slides in the post
 * @returns Left and right ends, as CSS
 * @pure true
 */
function threadEnds(index: number, count: number): { left: string; right: string } {
  const half = (count * DOT_PX + (count - 1) * DOT_GAP_PX) / 2;
  return {
    left: index === 0 ? `calc(50% - ${half}px)` : "0",
    right: index === count - 1 ? `calc(50% - ${half}px)` : "0",
  };
}

/**
 * @param props.slide - what this slide is
 * @param props.index - its place in the post, from 0
 * @param props.count - slides in the post
 * @param props.theme - the card's palette, which this sits on
 * @param props.safe - the format's margins
 * @param props.handle - the account shown on the closing slide, if any
 * @param props.address - the site address shown on the closing slide
 */
export function CarouselChrome({
  slide,
  index,
  count,
  theme,
  safe,
  handle,
  address,
}: {
  slide: CarouselSlide;
  index: number;
  count: number;
  theme: VocabularyTheme;
  safe: SafeInsets;
  handle?: string;
  address: string;
}) {
  const vars = {
    "--vocab-ink": theme.ink,
    "--vocab-accent": theme.accent,
    "--vocab-button-ink": theme.onAccent,
    "--safe-top": `${safe.top * 100}%`,
    "--safe-right": `${safe.right * 100}%`,
    "--safe-bottom": `${safe.bottom * 100}%`,
    "--safe-left": `${safe.left * 100}%`,
    "--thread-dot": `${DOT_PX}px`,
    "--thread-gap": `${DOT_GAP_PX}px`,
  } as CSSProperties;
  const hook = slide.kind === "clue" && slide.hook;
  return (
    <div className="carousel-chrome" style={vars} aria-hidden="true">
      {hook && <p className="carousel-hook">{CAROUSEL_HOOK}</p>}
      {hook && (
        <p className="carousel-swipe">
          {CAROUSEL_SWIPE_CUE}
          <ArrowRight size={15} strokeWidth={2.75} />
        </p>
      )}
      {slide.kind === "closing" && (
        <div className="carousel-closing">
          {handle && <p className="carousel-handle">{handle}</p>}
          <p className="carousel-address">{address}</p>
        </div>
      )}
      <p className="carousel-count">
        {index + 1}/{count}
      </p>
      <div className="carousel-thread">
        <i style={threadEnds(index, count)} />
        <ol>
          {Array.from({ length: count }, (_, dot) => (
            <li key={dot} data-current={dot === index || undefined} />
          ))}
        </ol>
      </div>
    </div>
  );
}
