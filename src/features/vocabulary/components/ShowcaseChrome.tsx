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
import { siteBrand } from "../lib/target-language";

/**
 * @param hidden - true while the intro's badge is up, so the bar can slide in afterwards
 *   rather than being there from the first frame
 */
export function ShowcaseChrome({ hidden }: { hidden: boolean }) {
  const brand = siteBrand(useContext(DeckLocaleContext));
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
            <span aria-hidden="true">🤯</span> tất cả
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
