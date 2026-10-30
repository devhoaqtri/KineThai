/**
 * One word, rendered for a recorder and nothing else.
 *
 * Export Studio is an overlay inside the feed: to reach it something has to load /feed,
 * find the right word, open a panel and press buttons. That is a fine thing for a person
 * and a bad thing for a daily job, which would be driving UI internals and would break
 * silently the next time the panel changed.
 *
 * This page is the stable surface instead: one URL per word, nothing on screen but the
 * card at the preset's exact aspect, and a small contract a recorder can wait on. The
 * CONTRACT is the point of the file — see EXPORT_CONTRACT below. Treat it as published:
 * changing an attribute or a phase name breaks whatever is recording, and
 * scripts/check-export-frame.ts is what says so.
 *
 * It renders the same VocabularyCard with the same exportLayout Export Studio uses, so
 * what a job captures here is what a reader sees there.
 *
 * Exports: ExportFramePage
 * Depends on: VocabularyCard, export presets, useServedWord (share-code lookup), vocabulary.css
 */

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useLoaderData, useParams, useSearch } from "@tanstack/react-router";
import { VocabularyCard } from "./VocabularyCard";
import { DeckLocaleContext } from "../lib/deck-locale";
import { getExportPreset } from "../lib/export-presets";
import { useServedWord } from "../hooks/useServedWord";
import { EXPORT_CONTRACT, type ExportPhase } from "../lib/export-contract";
// Each page component brings the card's stylesheet in; this is a page like any other.
// Without it the card renders with no rules at all — content height inside the frame,
// text small and left, chrome stacked in a corner — which looks like a layout bug and is
// really a missing import.
import "../vocabulary.css";
import "../vocabulary-export.css";
import type { FeedEntry, Presentation } from "../types";

/** How long to wait for a paint before declaring readiness anyway. See the effect below. */
const READY_BACKSTOP_MS = 400;

function setPhase(phase: ExportPhase) {
  if (typeof document !== "undefined") document.body.dataset.exportPhase = phase;
}

/** One word, at one preset, ready to be recorded. */
export function ExportFramePage() {
  const { code } = useParams({ from: "/export/$code" });
  const search = useSearch({ from: "/export/$code" });
  const { locale } = useLoaderData({ from: "/export/$code" });
  const preset = getExportPreset(search.preset);
  // undefined while the lookup is in flight: the phase stays "loading" until it lands.
  const { word } = useServedWord(useMemo(() => ({ code }), [code]));
  // Held until a driver asks, so the first frame is a still the recorder can start on
  // rather than a card already a third of the way through its entrance.
  const [playing, setPlaying] = useState(search.autostart === true);

  useEffect(() => {
    if (word === undefined) return;
    if (!word) {
      setPhase("missing");
      return;
    }
    document.body.dataset.exportWord = word.word;
    document.body.dataset.exportSize = `${preset.width}x${preset.height}`;
    // Two frames: one for the card to mount, one for it to have painted. A recorder that
    // starts on "ready" must get a complete first frame, not a half-laid-out one.
    //
    // The timeout is not belt and braces, it is the point: a renderer driving this page in
    // a background or headless tab may have rAF throttled to nothing, and a readiness
    // signal that only ever arrives on a frame would leave such a job waiting forever.
    // Whichever arrives first wins, and the phase is only ever set once.
    let settled = false;
    const announce = () => {
      if (settled) return;
      settled = true;
      setPhase(playing ? "playing" : "ready");
    };
    const frame = requestAnimationFrame(() => requestAnimationFrame(announce));
    const backstop = setTimeout(announce, READY_BACKSTOP_MS);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(backstop);
    };
  }, [word, preset.width, preset.height, playing]);

  // The driver's way in. An event rather than a query parameter so one loaded page can be
  // recorded more than once without a reload.
  useEffect(() => {
    const start = () => setPlaying(true);
    window.addEventListener(EXPORT_CONTRACT.startEvent, start);
    return () => window.removeEventListener(EXPORT_CONTRACT.startEvent, start);
  }, []);

  const entry = useMemo<FeedEntry | null>(
    () => (word ? { occurrenceId: `export-${code}`, position: 0, cycle: 0, word } : null),
    [word, code],
  );
  const exportLayout = useMemo(
    () => ({
      safe: preset.safe,
      showProgress: search.progress === true,
      showBrand: search.brand !== false,
    }),
    [preset.safe, search.progress, search.brand],
  );
  const presentation = useMemo<Presentation>(
    () => ({
      theme: search.theme ?? "mix",
      // The route validates this against STYLE_IDS, so the cast narrows a checked value.
      style: (search.style ?? "mix") as Presentation["style"],
      autoplay: true,
      dialect: search.dialect,
    }),
    [search.theme, search.style, search.dialect],
  );

  if (word === undefined) return <main className="vocab-export-frame" aria-busy="true" />;
  if (!entry) {
    return (
      <main className="vocab-export-frame" data-missing="">
        <p>No word has the share code “{code}”.</p>
      </main>
    );
  }

  return (
    <DeckLocaleContext.Provider value={locale}>
      <main className="vocab-export-frame">
        <div
          {...{ [EXPORT_CONTRACT.stageAttribute]: "" }}
          className="vocab-export-stage"
          style={
            {
              "--export-ratio": preset.height / preset.width,
              aspectRatio: `${preset.width} / ${preset.height}`,
            } as CSSProperties
          }
        >
          <VocabularyCard
            entry={entry}
            presentation={presentation}
            active={playing}
            reducedMotion={false}
            matching={0}
            canAdvance
            onAdvance={() => setPhase("done")}
            exportLayout={exportLayout}
          />
        </div>
      </main>
    </DeckLocaleContext.Provider>
  );
}
