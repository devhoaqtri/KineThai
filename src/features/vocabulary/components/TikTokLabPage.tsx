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

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { BADGE_INFO, BADGE_ROTATION, DEMO_BADGE_VARIANT } from "../lib/badge-variants";
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

  const look = search.look ?? DEMO_BADGE_VARIANT;
  // The clip's address carries the fades it starts with (a recording reads them from it),
  // but it is fixed for a take: a slider must not restart the clip, so moving one restates
  // them on the running page instead (below).
  const src = useMemo(() => {
    const params = new URLSearchParams({ frame: "4x5", autostart: "true", look });
    if (search.code) params.set("code", search.code);
    else params.set("seed", String(search.seed ?? 0));
    params.set("fadeFrom", String(fadeFrom));
    params.set("fadeTo", String(fadeTo));
    return `/showcase?${params}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fades follow live, not per take
  }, [take, look, search.code, search.seed]);
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const bands =
      frame.current?.contentDocument?.querySelector<HTMLElement>(".vocab-showcase-bands");
    bands?.style.setProperty("--band-fade-from", String(fadeFrom / 100));
    bands?.style.setProperty("--band-fade-to", String(fadeTo / 100));
  }, [fadeFrom, fadeTo]);

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
          Badge look
          <select
            value={look}
            onChange={(event) => {
              set({ look: event.target.value as typeof search.look });
              setTake((n) => n + 1);
            }}
          >
            {BADGE_ROTATION.map((variant) => (
              <option key={variant} value={variant}>
                {BADGE_INFO[variant].name}
              </option>
            ))}
          </select>
        </label>
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
        <ExportButton
          codeOf={() =>
            search.code ?? frame.current?.contentDocument?.body.dataset.showcaseCode ?? ""
          }
          look={look}
          fadeFrom={fadeFrom}
          fadeTo={fadeTo}
        />
      </aside>

      <div className="tiktok-lab-stage">
        <div className="tiktok-lab-frame" style={frameStyle} data-guides={guides || undefined}>
          <iframe ref={frame} key={`${src}#${take}`} src={src} title="Clip in the TikTok frame" />
          <div className="tiktok-lab-band" data-edge="top" aria-hidden="true" />
          <div className="tiktok-lab-band" data-edge="bottom" aria-hidden="true" />
          <div className="tiktok-lab-canvas-edge" data-edge="top" aria-hidden="true" />
          <div className="tiktok-lab-canvas-edge" data-edge="bottom" aria-hidden="true" />
        </div>
      </div>
    </main>
  );
}

type ExportState =
  | { status: "idle" }
  | { status: "recording" | "done" | "failed"; out: string; log: string[] }
  | { status: "error"; message: string };

/**
 * Record the lab's current clip (its word, look and band fades) to an MP4 on this machine
 * (/api/dev/tiktok-clip, scripts/render-export-clip.ts --frame 4x5). It records in real
 * time, about a minute a word, so the button starts it and then asks how it is going.
 */
function ExportButton({
  codeOf,
  look,
  fadeFrom,
  fadeTo,
}: {
  codeOf: () => string;
  look: string;
  fadeFrom: number;
  fadeTo: number;
}) {
  const [state, setState] = useState<ExportState>({ status: "idle" });
  const out = state.status === "recording" ? state.out : null;
  useEffect(() => {
    if (!out) return;
    const timer = setInterval(async () => {
      const answer = await fetch(`/api/dev/tiktok-clip?out=${encodeURIComponent(out)}`);
      const job = (await answer.json()) as {
        status: "recording" | "done" | "failed";
        log: string[];
      };
      if (job.status !== "recording") setState({ status: job.status, out, log: job.log });
    }, 2000);
    return () => clearInterval(timer);
  }, [out]);

  const start = async () => {
    const code = codeOf();
    if (!code) {
      setState({ status: "error", message: "No word yet: wait for the clip to load." });
      return;
    }
    setState({ status: "recording", out: "", log: [] });
    const answer = await fetch("/api/dev/tiktok-clip", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, look, fadeFrom, fadeTo }),
    });
    const job = (await answer.json()) as { status?: "recording"; out?: string; error?: string };
    if (!answer.ok || !job.out) {
      setState({ status: "error", message: job.error ?? `HTTP ${answer.status}` });
      return;
    }
    setState({ status: "recording", out: job.out, log: [] });
  };

  return (
    <div className="tiktok-lab-export">
      <button type="button" onClick={start} disabled={state.status === "recording"}>
        {state.status === "recording" ? "Recording… (about a minute)" : "Export MP4"}
      </button>
      {state.status === "done" && (
        <p className="tiktok-lab-note">
          Saved {state.out.split("/").pop()}{" "}
          <button
            type="button"
            onClick={() => void fetch(`/api/dev/tiktok-clip?open=${encodeURIComponent(state.out)}`)}
          >
            Show in Finder
          </button>
        </p>
      )}
      {state.status === "failed" && (
        <p className="tiktok-lab-note">
          Recording failed: {state.log.at(-1) ?? "see the dev server log"}
        </p>
      )}
      {state.status === "error" && <p className="tiktok-lab-note">{state.message}</p>}
    </div>
  );
}
