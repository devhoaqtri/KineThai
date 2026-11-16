/**
 * What a carousel adds to a card: the word's difficulty line under the app's title on
 * every slide, the hook on slide 1, the app's progress bars on every slide, and the handle
 * and the address, as a field to type into a browser, on the closing spelling page.
 *
 * Drawn over the card rather than inside it, so a reader's card never carries any of this.
 * The layout is in vocabulary-export.css.
 *
 * Exports: CarouselChrome
 * Depends on: lucide-react, ../lib/carousel, ../lib/carousel-copy, ../lib/difficulty,
 *   ../lib/target-language, ../lib/presets (type)
 */

import { useContext, type CSSProperties } from "react";
import { ArrowRight, Globe } from "lucide-react";
import { DeckLocaleContext } from "../lib/deck-locale";
import { wordDifficultyLine } from "../lib/difficulty";
import { withScheme } from "../lib/target-language";
import type { VocabularyLevel } from "../lib/schema";
import type { CarouselSlide } from "../lib/carousel";
import { CAROUSEL_HOOK, CAROUSEL_SWIPE_CUE } from "../lib/carousel-copy";
import type { SafeInsets } from "../lib/export-presets";
import type { VocabularyTheme } from "../lib/presets";

/**
 * @param props.slide - what this slide is
 * @param props.index - its place in the post, from 0
 * @param props.count - slides in the post
 * @param props.theme - the card's palette, which this sits on
 * @param props.safe - this slide's margins
 * @param props.edge - the format's side margin, a fraction: the progress bars sit on it on
 *   every slide, so they hold still through a swipe even where slide 1 has wider margins
 * @param props.handle - the account shown on the closing slide, if any
 * @param props.address - the site address shown on the closing slide
 * @param props.level - the word's level, for the difficulty line under the title
 * @param props.wordId - the word, which picks among the tracks that hold its level
 */
export function CarouselChrome({
  slide,
  index,
  count,
  theme,
  safe,
  edge,
  handle,
  address,
  level,
  wordId,
}: {
  slide: CarouselSlide;
  index: number;
  count: number;
  theme: VocabularyTheme;
  safe: SafeInsets;
  edge: number;
  handle?: string;
  address: string;
  level?: VocabularyLevel;
  wordId?: string;
}) {
  const locale = useContext(DeckLocaleContext);
  // The same line the feed's title carries and the clip's header copies ("🌿 du lịch · B1").
  const difficulty = wordDifficultyLine(locale, level, wordId);
  const vars = {
    "--vocab-ink": theme.ink,
    "--vocab-accent": theme.accent,
    "--vocab-button-ink": theme.onAccent,
    "--safe-top": `${safe.top * 100}%`,
    "--safe-right": `${safe.right * 100}%`,
    "--safe-bottom": `${safe.bottom * 100}%`,
    "--safe-left": `${safe.left * 100}%`,
    "--carousel-edge": `${edge * 100}%`,
  } as CSSProperties;
  const hook = slide.kind === "clue" && slide.hook;
  return (
    <div className="carousel-chrome" style={vars} aria-hidden="true">
      {slide.kind !== "grammar" && level && (
        <p className="carousel-level">
          <span>{difficulty.emoji}</span> {difficulty.label}
          <span className="carousel-level-band">· {difficulty.band}</span>
        </p>
      )}
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
          {/* A browser's address field, so it reads as something to type, not a word. */}
          <p className="carousel-address">
            <Globe size={17} strokeWidth={2.25} />
            <span>{withScheme(address)}</span>
          </p>
        </div>
      )}
      <p className="carousel-count">
        {index + 1}/{count}
      </p>
      {/* The card's own bars, filled up to this slide. Each is drawn full rather than
          filling: a still has no page timer. */}
      <div className="vocab-progress">
        {Array.from({ length: count }, (_, slot) => (
          <span key={slot} data-complete={slot <= index} />
        ))}
      </div>
    </div>
  );
}
