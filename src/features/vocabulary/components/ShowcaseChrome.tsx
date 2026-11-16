/**
 * The feed's top bar, drawn as scenery for a clip.
 *
 * Not the real toolbar. That one carries a difficulty dropdown, a settings sheet, an
 * ecosystem menu and the focus handling they need — all of it for a reader who can tap,
 * and none of which a video has any use for. Rendering it here would mean mounting that
 * machinery, then suppressing it, and keeping the suppression working.
 *
 * So this draws what the bar LOOKS like and nothing it does: the wordmark, the difficulty
 * line, and the transport icons held back at the opacity the recorded frame wants, as
 * inert glyphs. Everything is `pointer-events: none` by virtue of having no handlers at
 * all, which is the strongest form of "not interactive" available.
 *
 * Exports: ShowcaseChrome
 * Depends on: vocabulary.css (.vocab-toolbar and friends)
 */

import { useContext } from "react";
import { Pause, Settings, Shuffle, VolumeX } from "lucide-react";
import { DeckLocaleContext } from "../lib/deck-locale";
import { formatLevelBand, trackCeiling, tracksFor } from "../lib/difficulty";
import { siteBrand } from "../lib/target-language";
import { LEVELS, type VocabularyLevel } from "../lib/schema";

/**
 * @param hidden - true while the intro's badge is up, so the bar can slide in afterwards
 *   rather than being there from the first frame
 * @param level - the showcased word's level, so the subtitle mirrors the feed's track line
 */
export function ShowcaseChrome({ hidden, level }: { hidden: boolean; level?: VocabularyLevel }) {
  const locale = useContext(DeckLocaleContext);
  const brand = siteBrand(locale);
  const tracks = tracksFor(locale);
  // The track a reader of this word would most likely be on: its own single-level track,
  // the track it samples, the narrowest track that starts at it (B1 → đọc hiểu, not the
  // A2–B1 du lịch), then the narrowest that ends at it, then any that holds it.
  const span = (t: (typeof tracks)[number]) => {
    const at = LEVELS.filter((l) => t.levels.includes(l)).map((l) => LEVELS.indexOf(l));
    return Math.max(...at) - Math.min(...at);
  };
  const narrowest = (list: (typeof tracks)[number][]) => [...list].sort((a, b) => span(a) - span(b))[0];
  const floor = (t: (typeof tracks)[number]) => LEVELS.find((l) => t.levels.includes(l));
  const track = level
    ? (tracks.find((t) => t.levels.length === 1 && t.levels[0] === level) ??
      tracks.find((t) => t.sampleLevel === level) ??
      narrowest(tracks.filter((t) => floor(t) === level)) ??
      narrowest(tracks.filter((t) => trackCeiling(t) === level)) ??
      tracks.find((t) => t.levels.includes(level)))
    : undefined;
  const filter = track ? { emoji: track.emoji, label: track.label } : { emoji: "🤯", label: "tất cả" };
  // The app's title line reads "🍃 đọc hiểu · B1–B2" with a dropdown arrow; a clip shows the
  // word's own level in that slot, and no arrow, since nothing here can be opened.
  const band = level ? formatLevelBand([level]) : "";
  return (
    <header className="vocab-toolbar" data-showcase-chrome="" data-hidden={hidden || undefined}>
      <div className="vocab-toolbar-row">
        {/* Source order is title, controls, corner — the recorded stylesheet reorders them
            so the title takes the right corner and the gear the left. */}
        <div className="vocab-toolbar-left">
          <div className="vocab-showcase-brand">
            {brand.lead}
            <span>{brand.accent}</span>
          </div>
          <div className="vocab-showcase-filter">
            <span aria-hidden="true">{filter.emoji}</span> {filter.label}
            {/* A flex item: the row's gap is the space before the dot. */}
            {band ? <span className="vocab-showcase-filter-band">· {band}</span> : null}
          </div>
        </div>
        <div className="vocab-player-controls">
          <span className="vocab-icon-button">
            <Pause size={19} fill="currentColor" />
          </span>
          <span className="vocab-control-sep" aria-hidden="true" />
          <span className="vocab-icon-button">
            <VolumeX size={19} />
          </span>
          <span className="vocab-control-sep" aria-hidden="true" />
          <span className="vocab-icon-button">
            <Shuffle size={19} />
          </span>
        </div>
        {/* The same icon the real corner button uses, so the scenery and the thing it
            stands in for cannot drift apart visually. */}
        <span className="vocab-icon-button vocab-corner-button" aria-hidden="true">
          <Settings size={19} />
        </span>
      </div>
    </header>
  );
}
