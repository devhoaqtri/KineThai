/**
 * The studio's Carousel mode: choose a shape, a look, a handle and an address, see every
 * slide, and press Export.
 *
 * The filmstrip is /carousel/$code in frames, the same page headless Chrome captures, so the
 * preview and the file cannot disagree. Each frame reports through the page's own contract,
 * which is how a slide with a problem blocks the export. The images are made by this
 * machine's Chrome, through the dev-only /api/dev/carousel.
 *
 * Exports: CarouselStudio
 * Depends on: carousel formats and contract, presets, /carousel/$code, /api/dev/carousel
 */

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Check, FolderOpen, ImageDown, TriangleAlert, X } from "lucide-react";
import {
  CAROUSEL_FORMATS,
  DEFAULT_CAROUSEL_FORMAT_ID,
  getCarouselFormat,
  getSlideLayoutSize,
} from "../lib/carousel-formats";
import { DeckLocaleContext } from "../lib/deck-locale";
import { STYLES, THEMES } from "../lib/presets";
import { TARGET_LOCALES, siteAddress } from "../lib/target-language";
import type { NarrativeStyle } from "../lib/schema";
import type { FeedEntry, Presentation } from "../types";
import { InstagramGuide } from "./ExportGuides";

/** Handles are remembered per address, on this machine only. */
const HANDLES_KEY = "kinetic.carousel.handles";
const HANDLE = /^@?[\w.]{1,30}$/;
/** How often a frame's page is asked how it is doing. */
const POLL_MS = 250;
/** Typing a handle reloads every frame, so wait until the typing stops. */
const HANDLE_SETTLE_MS = 500;

type SlideStatus = { phase: string; problem?: string; count?: number; warning?: string };
type Run =
  | { state: "idle" }
  | { state: "running"; slide: number; count: number }
  | { state: "done"; folder: string; slides: number; warning?: string }
  | { state: "failed"; message: string };

function readHandles(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(HANDLES_KEY) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

function writeHandle(address: string, handle: string) {
  try {
    localStorage.setItem(HANDLES_KEY, JSON.stringify({ ...readHandles(), [address]: handle }));
  } catch {
    // A private window keeps no memory; the field still works for this export.
  }
}

/** One slide in a frame, reporting its phase upward. */
function SlideFrame({
  url,
  scale,
  width,
  height,
  onStatus,
  children,
}: {
  url: string;
  scale: number;
  width: number;
  height: number;
  onStatus: (status: SlideStatus) => void;
  children: ReactNode;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const report = useRef(onStatus);
  report.current = onStatus;
  useEffect(() => {
    report.current({ phase: "loading" });
    const timer = window.setInterval(() => {
      const data = frame.current?.contentDocument?.body?.dataset;
      if (!data?.slidePhase) return;
      report.current({
        phase: data.slidePhase,
        problem: data.slideProblem,
        count: Number(data.slideCount) || undefined,
        warning: data.slideWarning,
      });
      if (["settled", "failed", "missing"].includes(data.slidePhase)) {
        window.clearInterval(timer);
      }
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [url]);
  return (
    <div
      className="carousel-studio-frame"
      style={{ width: width * scale, height: height * scale } as CSSProperties}
    >
      <iframe
        ref={frame}
        src={url}
        title="Slide preview"
        tabIndex={-1}
        style={{ width, height, transform: `scale(${scale})` } as CSSProperties}
      />
      {children}
    </div>
  );
}

/**
 * Carousel mode for one word.
 * @param props.entry - the word on screen
 * @param props.presentation - the feed's look, used as the default
 * @param props.modeSwitch - the Video | Carousel control
 * @param props.onClose - leave the studio
 */
export function CarouselStudio({
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
  const locale = useContext(DeckLocaleContext);
  const code = entry.word.shareCode;
  const [formatId, setFormatId] = useState(DEFAULT_CAROUSEL_FORMAT_ID);
  const [theme, setTheme] = useState(presentation.theme);
  const [style, setStyle] = useState<NarrativeStyle | "mix">(presentation.style);
  const [address, setAddress] = useState(() => siteAddress(locale));
  const [handle, setHandle] = useState(() => readHandles()[siteAddress(locale)] ?? "");
  const [settledHandle, setSettledHandle] = useState(handle);
  const [showGuide, setShowGuide] = useState(true);
  const [allowProblems, setAllowProblems] = useState(false);
  const [statuses, setStatuses] = useState<Record<number, SlideStatus>>({});
  const [run, setRun] = useState<Run>({ state: "idle" });
  const [viewportHeight, setViewportHeight] = useState(0);
  const viewport = useRef<HTMLDivElement>(null);

  const format = getCarouselFormat(formatId);
  const layout = getSlideLayoutSize(format);
  const handleValid = !handle || HANDLE.test(handle);
  const dialect = presentation.dialect;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (HANDLE.test(handle) || !handle) setSettledHandle(handle);
    }, HANDLE_SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [handle]);

  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const measure = () => setViewportHeight(node.clientHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const query = useMemo(() => {
    const params = new URLSearchParams({ format: format.id, url: address });
    if (theme !== "mix") params.set("theme", theme);
    if (style !== "mix") params.set("style", style);
    if (dialect) params.set("dialect", dialect);
    if (settledHandle) params.set("handle", settledHandle);
    return params.toString();
  }, [format.id, address, theme, style, dialect, settledHandle]);
  useEffect(() => setStatuses({}), [query]);

  const count = statuses[0]?.count ?? 1;
  const slides = Array.from({ length: count }, (_, index) => index);
  const scale = viewportHeight ? Math.min(1, (viewportHeight - 44) / layout.height) : 0.5;
  const setStatus = useCallback((index: number, status: SlideStatus) => {
    setStatuses((current) => ({ ...current, [index]: status }));
  }, []);

  const settled = slides.filter((index) => statuses[index]?.phase === "settled").length;
  const problems = slides.flatMap((index) => {
    const status = statuses[index];
    return status?.phase === "failed" || status?.phase === "missing"
      ? [{ index, problem: status.problem ?? "This slide failed." }]
      : [];
  });
  const checking = settled + problems.length < count;
  const warning = statuses[0]?.warning;
  const busy = run.state === "running";
  const canExport =
    !!code && !busy && !checking && handleValid && (!problems.length || allowProblems);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const post = (body: unknown) =>
    fetch("/api/dev/carousel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  const exportSlides = async () => {
    if (!code) return;
    if (handle) writeHandle(address, handle);
    setRun({ state: "running", slide: 0, count });
    try {
      const response = await post({
        action: "render",
        code,
        format: format.id,
        theme: theme === "mix" ? undefined : theme,
        style: style === "mix" ? undefined : style,
        dialect,
        handle: handle || undefined,
        url: address,
        allowProblems,
      });
      if (!response.ok || !response.body)
        throw new Error(`The render failed (${response.status}).`);
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const message = JSON.parse(line) as {
            slide?: number;
            count?: number;
            done?: boolean;
            folder?: string;
            slides?: number;
            warning?: string;
            error?: string;
          };
          if (message.error) throw new Error(message.error);
          if (message.done) {
            setRun({
              state: "done",
              folder: message.folder!,
              slides: message.slides!,
              warning: message.warning,
            });
          } else if (message.slide) {
            setRun({ state: "running", slide: message.slide, count: message.count! });
          }
        }
      }
    } catch (error) {
      setRun({ state: "failed", message: (error as Error).message });
    }
  };

  return (
    <div className="vocab-export" role="dialog" aria-modal="true" aria-label="Export this word">
      <aside className="vocab-export-panel">
        <header className="vocab-export-head">
          <div>
            <p className="vocab-group-label">Admin · export</p>
            <h2>{entry.word.word}</h2>
          </div>
          <button
            type="button"
            className="vocab-icon-button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close export studio"
          >
            <X size={18} />
          </button>
        </header>
        {modeSwitch}

        <fieldset className="vocab-export-group">
          <legend className="vocab-group-label">Shape</legend>
          {CAROUSEL_FORMATS.map((option) => (
            <label
              key={option.id}
              className="vocab-export-preset"
              data-active={option.id === format.id || undefined}
            >
              <input
                type="radio"
                name="carousel-format"
                value={option.id}
                checked={option.id === format.id}
                onChange={() => setFormatId(option.id)}
              />
              <span
                className="vocab-export-shape"
                style={{ aspectRatio: `${option.width} / ${option.height}` } as CSSProperties}
              />
              <span className="vocab-export-preset-text">
                <strong>
                  {option.label} · {option.width}×{option.height}
                </strong>
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
          <span className="vocab-group-label">Closing slide</span>
          <div className="vocab-select-grid carousel-studio-fields">
            <label>
              Address
              <select
                value={address}
                onChange={(event) => {
                  setAddress(event.target.value);
                  const saved = readHandles()[event.target.value];
                  if (saved !== undefined) setHandle(saved);
                }}
              >
                {TARGET_LOCALES.map((option) => (
                  <option key={option} value={siteAddress(option)}>
                    {siteAddress(option)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Instagram handle
              <input
                className="carousel-studio-input"
                value={handle}
                onChange={(event) => setHandle(event.target.value.trim())}
                placeholder="@yourname"
                spellCheck={false}
                autoComplete="off"
                aria-invalid={!handleValid || undefined}
              />
            </label>
          </div>
          {!handleValid && (
            <p className="vocab-export-notice">
              A handle is up to 30 letters, numbers, dots or underscores.
            </p>
          )}
        </div>

        <div className="vocab-export-group">
          <span className="vocab-group-label">Slides</span>
          <label className="vocab-autoplay vocab-export-toggle">
            <input
              type="checkbox"
              checked={showGuide}
              onChange={(event) => setShowGuide(event.target.checked)}
            />
            Show Instagram's crop and count
          </label>
          {!code && (
            <p className="vocab-export-notice">
              This word has no share code, so it cannot be rendered. Imported packs have none.
            </p>
          )}
          {warning && <p className="vocab-export-notice">{warning}</p>}
          {problems.map(({ index, problem }) => (
            <p key={index} className="vocab-export-notice">
              Slide {index + 1}: {problem}
            </p>
          ))}
          {problems.length > 0 && (
            <label className="vocab-autoplay vocab-export-toggle">
              <input
                type="checkbox"
                checked={allowProblems}
                onChange={(event) => setAllowProblems(event.target.checked)}
              />
              Export anyway
            </label>
          )}
          <p className="vocab-options-summary">
            {checking
              ? `Checking ${Math.min(settled + problems.length + 1, count)} of ${count}…`
              : `${count} slides · ${format.width}×${format.height} · JPEG`}
          </p>
        </div>

        {run.state === "done" && (
          <p className="vocab-export-result" role="status">
            Saved {run.slides} slides, caption and alt text.{" "}
            <button
              type="button"
              className="carousel-studio-link"
              onClick={() => void post({ action: "open", folder: run.folder })}
            >
              <FolderOpen size={13} /> Open folder
            </button>
          </p>
        )}
        {run.state === "done" && run.warning && (
          <p className="vocab-export-notice">{run.warning}</p>
        )}
        {run.state === "failed" && (
          <p className="vocab-export-notice" role="alert">
            {run.message}
          </p>
        )}

        <div className="vocab-export-actions">
          <button
            type="button"
            className="vocab-export-record"
            onClick={() => void exportSlides()}
            disabled={!canExport}
          >
            <ImageDown size={16} />
            {run.state === "running"
              ? `Rendering ${run.slide}/${run.count}…`
              : `Export ${count} images`}
          </button>
        </div>
      </aside>

      <div ref={viewport} className="vocab-export-viewport carousel-studio-viewport">
        {code && (
          <div className="carousel-studio-strip">
            {slides.map((index) => {
              const status = statuses[index];
              const failed = status?.phase === "failed";
              return (
                <SlideFrame
                  key={`${index}:${query}`}
                  url={`/carousel/${code}?${query}&slide=${index}`}
                  scale={scale}
                  width={layout.width}
                  height={layout.height}
                  onStatus={(next) => setStatus(index, next)}
                >
                  {showGuide && <InstagramGuide format={format} index={index} count={count} />}
                  <span
                    className="carousel-studio-badge"
                    data-state={status?.phase === "settled" ? "ok" : failed ? "bad" : undefined}
                    title={status?.problem}
                  >
                    {index + 1}
                    {status?.phase === "settled" && <Check size={12} strokeWidth={3} />}
                    {failed && <TriangleAlert size={12} strokeWidth={2.5} />}
                  </span>
                </SlideFrame>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
