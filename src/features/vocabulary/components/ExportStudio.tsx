/**
 * Admin-only export studio, on the dev server: a Video mode and a Carousel mode for the
 * on-screen word.
 *
 * Video previews the word in a social-video layout, then records its whole animation —
 * first clue to spelling — to a video file. The preview IS the recording surface: the stage
 * is the same element at the same size in both, so what is shown is what is captured.
 * Recording shares this tab with itself (the browser asks once per take) and runs in real
 * time. Carousel is in ./CarouselStudio.
 *
 * Exports: ExportStudio
 * Depends on: VocabularyCard, ExportGuides, CarouselStudio, export presets/recorder,
 *   presets THEMES/STYLES
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Circle, Download, RotateCcw, Square, X } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import {
  DEFAULT_EXPORT_PRESET_ID,
  EXPORT_FRAME_RATES,
  EXPORT_PRESETS,
  describeSharpness,
  getExportFileName,
  getExportMimeType,
  getExportPreset,
  type ExportFrameRate,
} from "../lib/export-presets";
import { canRecordStage, startStageRecording, type StageRecording } from "../lib/export-recorder";
import { STYLES, THEMES } from "../lib/presets";
import type { NarrativeStyle } from "../lib/schema";
import type { FeedEntry, Presentation } from "../types";
import { CarouselStudio } from "./CarouselStudio";
import { ExportGuides } from "./ExportGuides";
import { VocabularyCard } from "./VocabularyCard";

/** Backdrop-only frames before the first word, so the clip does not open mid-entrance. */
const LEAD_IN_MS = 700;
/** Held on the finished word before the file is closed. */
const TAIL_MS = 600;
/** Pause between loops of the preview. */
const PREVIEW_GAP_MS = 900;

type Phase = "idle" | "arming" | "recording" | "saving";
type Result = { url: string; name: string; megabytes: number; seconds: number; audio: boolean };

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

const MODES = [
  { id: "video", label: "Video" },
  { id: "carousel", label: "Carousel" },
] as const;

type StudioMode = (typeof MODES)[number]["id"];

/**
 * Full-screen export studio for one word.
 * @param props.entry - the word to export (the one on screen in the feed)
 * @param props.presentation - the feed's current theme/style choice, used as the default look
 * @param props.onClose - leave the studio
 * @returns The mode the studio is in, with its switch
 */
export function ExportStudio({
  entry,
  presentation,
  onClose,
}: {
  entry: FeedEntry;
  presentation: Presentation;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<StudioMode>("video");
  const modeSwitch = (
    <div className="vocab-export-rates" role="radiogroup" aria-label="What to export">
      {MODES.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={option.id === mode}
          data-active={option.id === mode || undefined}
          onClick={() => setMode(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
  const Studio = mode === "video" ? VideoStudio : CarouselStudio;
  return (
    <Studio entry={entry} presentation={presentation} modeSwitch={modeSwitch} onClose={onClose} />
  );
}

/** Video mode. @param props See ExportStudio; `modeSwitch` is the Video | Carousel control. */
function VideoStudio({
  entry,
  presentation,
  modeSwitch,
  onClose,
}: {
  entry: FeedEntry;
  presentation: Presentation;
  modeSwitch: ReactNode;
  onClose: () => void;
}) {
  const [presetId, setPresetId] = useState(DEFAULT_EXPORT_PRESET_ID);
  const [theme, setTheme] = useState(presentation.theme);
  const [style, setStyle] = useState<NarrativeStyle | "mix">(presentation.style);
  const [showProgress, setShowProgress] = useState(true);
  const [showBrand, setShowBrand] = useState(true);
  const [showGuide, setShowGuide] = useState(true);
  const [withAudio, setWithAudio] = useState(false);
  const [fps, setFps] = useState<ExportFrameRate>(30);

  const [phase, setPhase] = useState<Phase>("idle");
  const [take, setTake] = useState(0);
  const [cardActive, setCardActive] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [stageHeight, setStageHeight] = useState(0);

  const preset = getExportPreset(presetId);
  const mimeType = useMemo(() => getExportMimeType(), []);
  const supported = useMemo(() => canRecordStage() && mimeType !== null, [mimeType]);
  const stageRef = useRef<HTMLDivElement>(null);
  const recording = useRef<StageRecording | null>(null);
  const startedAt = useRef(0);
  const phaseRef = useRef<Phase>("idle");
  phaseRef.current = phase;

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => setStageHeight(stage.clientHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  // Release the capture and the last file's object URL when the studio closes.
  const resultUrl = result?.url;
  useEffect(() => () => recording.current?.cancel(), []);
  useEffect(
    () => () => {
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    },
    [resultUrl],
  );

  useEffect(() => {
    if (phase !== "recording") return;
    const timer = window.setInterval(
      () => setElapsed(Math.round((performance.now() - startedAt.current) / 100) / 10),
      200,
    );
    return () => window.clearInterval(timer);
  }, [phase]);

  /** Close the file, hand it to the browser as a download and return to preview. */
  const finish = useCallback(async () => {
    const active = recording.current;
    if (!active || phaseRef.current !== "recording") return;
    recording.current = null;
    setPhase("saving");
    const seconds = (performance.now() - startedAt.current) / 1000;
    try {
      await wait(TAIL_MS);
      const blob = await active.stop();
      const name = getExportFileName(entry.word.word, preset.id, blob.type);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setResult({
        url,
        name,
        megabytes: blob.size / 1_048_576,
        seconds: seconds + TAIL_MS / 1000,
        audio: active.hasAudio,
      });
      setNotice(null);
    } catch {
      setNotice("The recording could not be saved. Try another take.");
    } finally {
      setPhase("idle");
      setCardActive(true);
      setTake((value) => value + 1);
    }
  }, [entry.word.word, preset.id]);

  const record = useCallback(async () => {
    const stage = stageRef.current;
    if (!stage || !mimeType || phaseRef.current !== "idle") return;
    setNotice(null);
    setResult(null);
    setPhase("arming");
    // Remount the card parked on its backdrop; it only starts once frames are flowing.
    setCardActive(false);
    setTake((value) => value + 1);
    try {
      const started = await startStageRecording({
        stage,
        width: preset.width,
        height: preset.height,
        fps,
        mimeType,
        withAudio,
        onInterrupted: () => void finish(),
      });
      recording.current = started;
      if (withAudio && !started.hasAudio) {
        setNotice("No tab audio was shared, so this take is silent.");
      }
      await wait(LEAD_IN_MS);
      startedAt.current = performance.now();
      setElapsed(0);
      setCardActive(true);
      setPhase("recording");
    } catch (error) {
      recording.current?.cancel();
      recording.current = null;
      const name = (error as Error | undefined)?.name;
      // Dismissing the browser's share prompt is a decision, not a failure.
      if (name !== "NotAllowedError" && name !== "AbortError") {
        setNotice("This browser could not start a tab recording.");
      }
      setPhase("idle");
      setCardActive(true);
      setTake((value) => value + 1);
    }
  }, [finish, fps, mimeType, preset.height, preset.width, withAudio]);

  /** The card played through: end the take, or loop the preview. */
  const handleCardFinished = useCallback(() => {
    if (phaseRef.current === "recording") {
      void finish();
      return;
    }
    if (phaseRef.current !== "idle") return;
    window.setTimeout(() => {
      if (phaseRef.current === "idle") setTake((value) => value + 1);
    }, PREVIEW_GAP_MS);
  }, [finish]);

  const busy = phase !== "idle";
  const close = useCallback(() => {
    recording.current?.cancel();
    recording.current = null;
    onClose();
  }, [onClose]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (phaseRef.current === "recording") void finish();
      else if (phaseRef.current === "idle") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, finish]);

  const sharpness = describeSharpness(
    stageHeight,
    typeof window === "undefined" ? 1 : window.devicePixelRatio,
    preset.height,
  );
  const container = mimeType?.includes("mp4") ? "MP4 (H.264)" : "WebM";
  const exportLayout = useMemo(
    () => ({ safe: preset.safe, showProgress, showBrand }),
    [preset.safe, showProgress, showBrand],
  );
  const dialect = presentation.dialect;
  const cardPresentation = useMemo(
    () => ({ theme, style, autoplay: true, dialect }),
    [theme, style, dialect],
  );

  return (
    <div
      className="vocab-export"
      role="dialog"
      aria-modal="true"
      aria-label="Export this word as a video"
      data-phase={phase}
    >
      <aside className="vocab-export-panel">
        <header className="vocab-export-head">
          <div>
            <p className="vocab-group-label">Admin · export</p>
            <h2>{entry.word.word}</h2>
          </div>
          <button
            type="button"
            className="vocab-icon-button"
            onClick={close}
            disabled={phase === "saving"}
            aria-label="Close export studio"
          >
            <X size={18} />
          </button>
        </header>

        {!busy && modeSwitch}
        {busy ? (
          <div className="vocab-export-live" role="status">
            <p className="vocab-export-live-title">
              <i />
              {phase === "arming"
                ? "Waiting for the browser's share prompt…"
                : phase === "saving"
                  ? "Saving the file…"
                  : `Recording · ${elapsed.toFixed(1)}s`}
            </p>
            <p className="vocab-options-summary">
              {phase === "arming"
                ? "Choose “This tab” and allow it. Recording starts as soon as you do."
                : "Keep this tab in front and leave the pointer off the video. It stops by itself when the word has been spelled."}
            </p>
            {phase === "recording" && (
              <button type="button" className="vocab-export-stop" onClick={() => void finish()}>
                <Square size={14} fill="currentColor" /> Stop and save now
              </button>
            )}
          </div>
        ) : (
          <>
            <fieldset className="vocab-export-group">
              <legend className="vocab-group-label">Layout</legend>
              {EXPORT_PRESETS.map((option) => (
                <label
                  key={option.id}
                  className="vocab-export-preset"
                  data-active={option.id === presetId || undefined}
                >
                  <input
                    type="radio"
                    name="export-preset"
                    value={option.id}
                    checked={option.id === presetId}
                    onChange={() => setPresetId(option.id)}
                  />
                  <span
                    className="vocab-export-shape"
                    style={{ aspectRatio: `${option.width} / ${option.height}` } as CSSProperties}
                  >
                    <i
                      style={{
                        top: `${option.safe.top * 100}%`,
                        right: `${option.safe.right * 100}%`,
                        bottom: `${option.safe.bottom * 100}%`,
                        left: `${option.safe.left * 100}%`,
                      }}
                    />
                  </span>
                  <span className="vocab-export-preset-text">
                    <strong>{option.label}</strong>
                    <small>{option.summary}</small>
                  </span>
                </label>
              ))}
            </fieldset>

            <div className="vocab-export-group">
              <span className="vocab-group-label">Look</span>
              <div className="vocab-select-grid vocab-export-selects">
                <label>
                  Theme
                  <select
                    // The feed picker stores an allow-list; a joined set has no row
                    // here, so it displays as "as picked" while the preview keeps
                    // rotating inside exactly those themes.
                    value={theme.includes(",") ? "mix" : theme}
                    onChange={(event) => setTheme(event.target.value)}
                  >
                    <option value="mix">As picked for this word</option>
                    {THEMES.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Reveal style
                  <select
                    value={style}
                    onChange={(event) => setStyle(event.target.value as NarrativeStyle | "mix")}
                  >
                    <option value="mix">As picked for this word</option>
                    {STYLES.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            <div className="vocab-export-group">
              <span className="vocab-group-label">In the frame</span>
              <label className="vocab-autoplay vocab-export-toggle">
                <input
                  type="checkbox"
                  checked={showBrand}
                  onChange={(event) => setShowBrand(event.target.checked)}
                />
                Brand tag
              </label>
              <label className="vocab-autoplay vocab-export-toggle">
                <input
                  type="checkbox"
                  checked={showProgress}
                  onChange={(event) => setShowProgress(event.target.checked)}
                />
                Page label and progress
              </label>
              <label className="vocab-autoplay vocab-export-toggle">
                <input
                  type="checkbox"
                  checked={withAudio}
                  onChange={(event) => setWithAudio(event.target.checked)}
                />
                Record the feed music
              </label>
              {withAudio && (
                <p className="vocab-options-summary">
                  Switch the music on in the feed first, and tick “Also share tab audio” in the
                  prompt. Check each track's licence before publishing it — adding a sound inside
                  TikTok is usually the safer route.
                </p>
              )}
            </div>

            <div className="vocab-export-group">
              <span className="vocab-group-label">Preview and file</span>
              <label className="vocab-autoplay vocab-export-toggle">
                <input
                  type="checkbox"
                  checked={showGuide}
                  disabled={preset.guide === "none"}
                  onChange={(event) => setShowGuide(event.target.checked)}
                />
                Show the app's buttons over the preview
              </label>
              <div className="vocab-export-rates" role="radiogroup" aria-label="Frame rate">
                {EXPORT_FRAME_RATES.map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    role="radio"
                    aria-checked={rate === fps}
                    data-active={rate === fps || undefined}
                    onClick={() => setFps(rate)}
                  >
                    {rate} fps
                  </button>
                ))}
              </div>
              <p className="vocab-options-summary">
                {preset.width}×{preset.height} · {container}. Captured at {sharpness.capturedHeight}{" "}
                px tall
                {sharpness.verdict === "full"
                  ? ", full sharpness."
                  : sharpness.verdict === "good"
                    ? `, scaled up ${Math.round((1 / sharpness.ratio) * 100 - 100)}% to fit.`
                    : " — soft. A taller window or a high-density display gives a sharper file."}
              </p>
            </div>

            {notice && (
              <p className="vocab-export-notice" role="alert">
                {notice}
              </p>
            )}
            {result && (
              <p className="vocab-export-result" role="status">
                Saved <strong>{result.name}</strong> — {result.seconds.toFixed(1)}s,{" "}
                {result.megabytes.toFixed(1)} MB, {result.audio ? "with sound" : "silent"}.{" "}
                <a href={result.url} download={result.name}>
                  <Download size={13} /> Download again
                </a>
              </p>
            )}

            <div className="vocab-export-actions">
              <button
                type="button"
                className="vocab-export-record"
                onClick={() => void record()}
                disabled={!supported}
              >
                <Circle size={14} fill="currentColor" /> Record video
              </button>
              <button
                type="button"
                className="vocab-export-replay"
                onClick={() => setTake((value) => value + 1)}
              >
                <RotateCcw size={15} /> Replay
              </button>
            </div>
            {!supported && (
              <p className="vocab-export-notice">
                This browser cannot record a tab. Open the feed in desktop Chrome or Edge.
              </p>
            )}
          </>
        )}
      </aside>

      <div className="vocab-export-viewport">
        <div
          ref={stageRef}
          className="vocab-export-stage"
          style={
            {
              "--export-ratio": preset.height / preset.width,
              aspectRatio: `${preset.width} / ${preset.height}`,
            } as CSSProperties
          }
        >
          <VocabularyCard
            key={`${take}:${preset.id}:${theme}:${style}:${showProgress}:${showBrand}`}
            entry={entry}
            presentation={cardPresentation}
            active={cardActive}
            reducedMotion={false}
            matching={0}
            canAdvance
            onAdvance={handleCardFinished}
            exportLayout={exportLayout}
          />
          {!busy && showGuide && preset.guide !== "none" && <ExportGuides preset={preset} />}
        </div>
      </div>
    </div>
  );
}
