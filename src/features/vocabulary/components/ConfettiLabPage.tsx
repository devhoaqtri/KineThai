/**
 * /confetti-lab: every reveal confetti candidate side by side, on mock reveal cards, so an
 * admin can watch them and pick which to keep.
 *
 * Development only (the route answers 404 in a production build). Each frame plays a
 * clue, then reveals a word and throws its burst; a tap on a frame throws it again. The
 * "Giữ" marks are remembered in this browser only, as a shortlist to report back.
 *
 * Exports: ConfettiLabPage
 * Depends on: ./RevealConfetti, ../lib/reveal-confetti, ../lib/presets
 */

import { useEffect, useMemo, useState } from "react";
import { THEMES, type VocabularyTheme } from "../lib/presets";
import {
  CONFETTI_INFO,
  CONFETTI_VARIANTS,
  FESTIVE_PALETTE,
  type ConfettiVariant,
} from "../lib/reveal-confetti";
import { RevealConfetti } from "./RevealConfetti";
import "./confetti-lab.css";

const FRAME_W = 288;
const FRAME_H = 512;
/** Where the reader's reveal word sits, as a share of the card's height. */
const WORD_Y = 0.34;
/** The clue shows this long before the word is revealed. */
const CLUE_MS = 650;
const KEPT_KEY = "kinemedia.confetti-lab.kept";

const SAMPLES = [
  { word: "backpack", clue: "Túi đeo sau lưng khi đi học, đi phượt" },
  { word: "serendipity", clue: "Tình cờ gặp được điều tốt đẹp" },
  { word: "开心", clue: "Vui vẻ, phấn khởi" },
  { word: "사랑", clue: "Tình yêu" },
];

type PaletteMode = "festive" | "theme";

function themePalette(theme: VocabularyTheme): string[] {
  return [theme.accent, theme.accentAlt, theme.ink, FESTIVE_PALETTE[0], FESTIVE_PALETTE[1]];
}

export function ConfettiLabPage() {
  const [run, setRun] = useState(0);
  const [mode, setMode] = useState<PaletteMode>("festive");
  const [themeIndex, setThemeIndex] = useState(0);
  const [slow, setSlow] = useState(false);
  const [paused, setPaused] = useState(false);
  const [kept, setKept] = useState<ConfettiVariant[]>([]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEPT_KEY) ?? "[]") as string[];
      setKept(CONFETTI_VARIANTS.filter((variant) => saved.includes(variant)));
    } catch {
      // A bad entry just starts the shortlist empty.
    }
  }, []);

  const toggleKept = (variant: ConfettiVariant) => {
    setKept((current) => {
      const next = current.includes(variant)
        ? current.filter((entry) => entry !== variant)
        : CONFETTI_VARIANTS.filter((entry) => entry === variant || current.includes(entry));
      localStorage.setItem(KEPT_KEY, JSON.stringify(next));
      return next;
    });
  };

  const theme = THEMES[themeIndex % THEMES.length]!;
  const palette = useMemo(
    () => (mode === "festive" ? [...FESTIVE_PALETTE] : themePalette(theme)),
    [mode, theme],
  );

  return (
    <main className="confetti-lab">
      <header className="confetti-lab-head">
        <div>
          <h1>Hiệu ứng confetti khi lộ từ</h1>
          <p>Chạm vào một thẻ để xem lại. Đánh dấu “Giữ” những kiểu bạn muốn dùng.</p>
        </div>
        <div className="confetti-lab-controls">
          <button type="button" onClick={() => setRun((n) => n + 1)}>
            ↻ Phát lại tất cả
          </button>
          <button type="button" onClick={() => setMode(mode === "festive" ? "theme" : "festive")}>
            Màu: {mode === "festive" ? "lễ hội" : "theo thẻ"}
          </button>
          <button type="button" onClick={() => setThemeIndex((n) => n + 1)}>
            Đổi nền ({theme.label})
          </button>
          <button type="button" aria-pressed={slow} onClick={() => setSlow(!slow)}>
            Chậm ×0.3
          </button>
          <button type="button" aria-pressed={paused} onClick={() => setPaused(!paused)}>
            {paused ? "▶ Tiếp tục" : "❚❚ Tạm dừng"}
          </button>
        </div>
        <p className="confetti-lab-kept">
          Giữ lại:{" "}
          {kept.length ? (
            <strong>
              {kept.map((variant) => `${CONFETTI_INFO[variant].label} (${variant})`).join(", ")}
            </strong>
          ) : (
            <em>chưa chọn</em>
          )}
        </p>
      </header>
      <ul className="confetti-lab-grid">
        {CONFETTI_VARIANTS.map((variant, index) => (
          <LabFrame
            key={variant}
            number={index + 1}
            variant={variant}
            run={run}
            theme={theme}
            palette={palette}
            timeScale={slow ? 0.3 : 1}
            paused={paused}
            kept={kept.includes(variant)}
            onToggleKept={() => toggleKept(variant)}
          />
        ))}
      </ul>
    </main>
  );
}

function LabFrame({
  number,
  variant,
  run,
  theme,
  palette,
  timeScale,
  paused,
  kept,
  onToggleKept,
}: {
  number: number;
  variant: ConfettiVariant;
  run: number;
  theme: VocabularyTheme;
  palette: readonly string[];
  timeScale: number;
  paused: boolean;
  kept: boolean;
  onToggleKept: () => void;
}) {
  const [shot, setShot] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const sample = SAMPLES[(shot + number) % SAMPLES.length]!;

  useEffect(() => {
    setRevealed(false);
    const timer = window.setTimeout(() => setRevealed(true), CLUE_MS / timeScale);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shot, run]);

  const info = CONFETTI_INFO[variant];
  return (
    <li className="confetti-lab-item" data-kept={kept || undefined}>
      <button
        type="button"
        className="confetti-lab-frame"
        data-tone={theme.tone}
        style={{
          width: FRAME_W,
          height: FRAME_H,
          background: theme.paint,
          color: theme.ink,
          fontFamily: theme.font,
          ["--lab-accent" as string]: theme.accent,
        }}
        onClick={() => setShot((n) => n + 1)}
        aria-label={`Xem lại ${info.label}`}
      >
        <span
          className="confetti-lab-word"
          data-revealed={revealed || undefined}
          style={{ top: `${WORD_Y * 100}%` }}
        >
          {revealed ? sample.word : sample.clue}
        </span>
        {revealed && (
          <RevealConfetti
            key={`${shot}:${run}:${palette.join()}`}
            variant={variant}
            width={FRAME_W}
            height={FRAME_H}
            originX={FRAME_W / 2}
            originY={FRAME_H * WORD_Y}
            palette={palette}
            seed={`${shot}:${run}`}
            paused={paused}
            timeScale={timeScale}
          />
        )}
        <span className="confetti-lab-pill">Ê, từ này biết nè</span>
      </button>
      <div className="confetti-lab-caption">
        <div>
          <strong>
            {number}. {info.label}
          </strong>
          <code>{variant}</code>
          <p>{info.blurb}</p>
        </div>
        <label className="confetti-lab-keep">
          <input type="checkbox" checked={kept} onChange={onToggleKept} />
          Giữ
        </label>
      </div>
    </li>
  );
}
