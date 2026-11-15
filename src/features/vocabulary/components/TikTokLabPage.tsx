/**
 * The TikTok lab: the upload's layout, live, so it can be tuned by eye before it is recorded.
 *
 * The frame is a 9:16 phone screen at 432×768 CSS px (2.5× = 1080×1920). TikTok draws its
 * own buttons and caption over the top and bottom of a post, so those parts are black
 * bands, and the clip plays on a 4:5 canvas between them (432×540, 2.5× = 1080×1350),
 * which leaves 114px bands, 14.8% each. The canvas fades in from the bands: a black-to-clear
 * gradient over its top and bottom edges, `fade`% of its height deep.
 *
 * The canvas is /showcase?frame=4x5 in an iframe rather than the card mounted here: the card
 * lays itself out from the viewport (media queries, dvh), and an iframe is the one way to
 * give it a viewport that IS the 4:5 canvas.
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
const DEFAULT_FADE = 12;

/** The upload's layout around a live clip, with the controls to tune it. */
export function TikTokLabPage() {
  const search = useSearch({ from: "/tiktok-lab" });
  const navigate = useNavigate({ from: "/tiktok-lab" });
  const [take, setTake] = useState(0);
  const [codeDraft, setCodeDraft] = useState(search.code ?? "");
  const fade = search.fade ?? DEFAULT_FADE;
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
    "--lab-canvas-h": `${CANVAS_HEIGHT}px`,
    "--lab-fade": `${fade}%`,
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
          Fade {fade}% of the canvas
          <input
            type="range"
            min={0}
            max={40}
            step={1}
            value={fade}
            onChange={(event) => set({ fade: Number(event.target.value) })}
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
          <div className="tiktok-lab-canvas">
            <iframe key={`${src}#${take}`} src={src} title="Clip on the 4:5 canvas" />
            <div className="tiktok-lab-fade" data-edge="top" aria-hidden="true" />
            <div className="tiktok-lab-fade" data-edge="bottom" aria-hidden="true" />
          </div>
          <div className="tiktok-lab-band" data-edge="top" aria-hidden="true" />
          <div className="tiktok-lab-band" data-edge="bottom" aria-hidden="true" />
        </div>
      </div>
    </main>
  );
}
