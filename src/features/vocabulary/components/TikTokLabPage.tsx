/**
 * The TikTok lab: the upload's layout, live, so it can be tuned by eye before it is recorded.
 *
 * The frame is a 9:16 phone screen at 432×768 CSS px (2.5× = 1080×1920). What is read (title,
 * question, text, progress) sits on a 4:5 canvas across the middle (432×540, 2.5× =
 * 1080×1350), which leaves a 114px band above and below it, 14.8% each, where TikTok draws
 * its own buttons and caption. The clip's backdrop runs under the bands, and each band is a
 * black-to-clear gradient over it: solid at the screen's edge, starting to lift `fadeFrom`%
 * of the way in and gone at `fadeTo`% (past 100 it reaches into the canvas). The bands only
 * soften what is behind TikTok's buttons; they are not there to hide it.
 *
 * The clip is /showcase?frame=4x5 in an iframe rather than the card mounted here: the card
 * lays itself out from the viewport (media queries, dvh), and an iframe is the one way to
 * give it a viewport that IS the frame.
 *
 * Exports: TikTokLabPage
 * Depends on: /showcase (frame=4x5), vocabulary-export.css
 */

import { useState, type CSSProperties } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import "../vocabulary-export.css";

/** The frame in CSS px; the recording is 2.5× this. */
const FRAME = { width: 432, height: 768 } as const;
/** The 4:5 canvas across the frame's full width. */
const CANVAS_HEIGHT = (FRAME.width * 5) / 4;
const BAND = (FRAME.height - CANVAS_HEIGHT) / 2;
const DEFAULT_FADE_FROM = 35;
const DEFAULT_FADE_TO = 100;

/** The upload's layout around a live clip, with the controls to tune it. */
export function TikTokLabPage() {
  const search = useSearch({ from: "/tiktok-lab" });
  const navigate = useNavigate({ from: "/tiktok-lab" });
  const [take, setTake] = useState(0);
  const [codeDraft, setCodeDraft] = useState(search.code ?? "");
  const fadeFrom = search.fadeFrom ?? DEFAULT_FADE_FROM;
  const fadeTo = Math.max(fadeFrom, search.fadeTo ?? DEFAULT_FADE_TO);
  const guides = search.guides ?? false;

  const set = (patch: Partial<typeof search>) =>
    void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });

  const params = new URLSearchParams({ frame: "4x5", autostart: "true" });
  if (search.code) params.set("code", search.code);
  else params.set("seed", String(search.seed ?? 0));
  const src = `/showcase?${params}`;

  const frameStyle = {
    "--lab-frame-w": `${FRAME.width}px`,
    "--lab-frame-h": `${FRAME.height}px`,
    "--lab-band": `${BAND}px`,
    // The gradient's box reaches as far as the fade does, past the band when it must.
    "--lab-fade-box": `${(BAND * Math.max(100, fadeTo)) / 100}px`,
    "--lab-fade-from": `${(BAND * fadeFrom) / 100}px`,
    "--lab-fade-to": `${(BAND * fadeTo) / 100}px`,
  } as CSSProperties;

  return (
    <main className="tiktok-lab">
      <aside className="tiktok-lab-panel">
        <h1>TikTok lab</h1>
        <p className="tiktok-lab-note">
          9:16 frame {FRAME.width}×{FRAME.height} (×2.5 = 1080×1920) · 4:5 canvas {FRAME.width}×
          {CANVAS_HEIGHT} · bands {BAND}px ({((BAND / FRAME.height) * 100).toFixed(1)}%) each
        </p>
        <form
          className="tiktok-lab-row"
          onSubmit={(event) => {
            event.preventDefault();
            set({ code: codeDraft.trim() || undefined });
            setTake((n) => n + 1);
          }}
        >
          <label>
            Word code
            <input
              value={codeDraft}
              onChange={(event) => setCodeDraft(event.target.value.toUpperCase())}
              placeholder="random"
              maxLength={16}
            />
          </label>
          <button type="submit">Load</button>
          <button
            type="button"
            onClick={() => {
              setCodeDraft("");
              set({ code: undefined, seed: Math.floor(Math.random() * 1_000_000) });
              setTake((n) => n + 1);
            }}
          >
            Random
          </button>
        </form>
        <label className="tiktok-lab-row">
          Black starts lifting at {fadeFrom}% of the band
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={fadeFrom}
            onChange={(event) => set({ fadeFrom: Number(event.target.value) })}
          />
        </label>
        <label className="tiktok-lab-row">
          Clear at {fadeTo}% of the band{fadeTo > 100 ? " (into the canvas)" : ""}
          <input
            type="range"
            min={0}
            max={160}
            step={5}
            value={fadeTo}
            onChange={(event) => set({ fadeTo: Number(event.target.value) })}
          />
        </label>
        <label className="tiktok-lab-row">
          <input
            type="checkbox"
            checked={guides}
            onChange={(event) => set({ guides: event.target.checked || undefined })}
          />
          Guide lines
        </label>
        <button type="button" className="tiktok-lab-replay" onClick={() => setTake((n) => n + 1)}>
          Replay
        </button>
      </aside>

      <div className="tiktok-lab-stage">
        <div className="tiktok-lab-frame" style={frameStyle} data-guides={guides || undefined}>
          <iframe key={`${src}#${take}`} src={src} title="Clip in the TikTok frame" />
          <div className="tiktok-lab-band" data-edge="top" aria-hidden="true" />
          <div className="tiktok-lab-band" data-edge="bottom" aria-hidden="true" />
          <div className="tiktok-lab-canvas-edge" data-edge="top" aria-hidden="true" />
          <div className="tiktok-lab-canvas-edge" data-edge="bottom" aria-hidden="true" />
        </div>
      </div>
    </main>
  );
}
