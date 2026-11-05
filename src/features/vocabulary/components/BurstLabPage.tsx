/**
 * /burst-lab: every reveal-burst design side by side, on mock reveal cards, so an admin can
 * watch them and pick which ones the reader keeps.
 *
 * Development only (the route answers 404 in a production build). Each frame plays a clue,
 * then reveals a word and throws its burst; a tap on a frame throws it again. The "Giữ" marks
 * are remembered in this browser only, as a shortlist to report back.
 *
 * The burst is pure CSS, so there is no per-card clock to drive: "Chậm" scales every
 * animation's duration through --burst-dur-scale and "Tạm dừng" freezes them all through
 * --burst-play, both set on the grid root and inherited by every burst.
 *
 * Exports: BurstLabPage
 * Depends on: ./RevealBurst, ../lib/burst-variants, ../lib/presets
 */

import { useEffect, useState } from "react";
import { THEMES, type VocabularyTheme } from "../lib/presets";
import {
  BURST_CONFIG,
  BURST_INFO,
  BURST_VARIANTS,
  type BurstVariant,
} from "../lib/burst-variants";
import { RevealBurst } from "./RevealBurst";
import "../vocabulary.css"; // the burst atoms are styled there; this page mounts them without the feed
import "./burst-lab.css";

const FRAME_W = 288;
const FRAME_H = 512;
/** Where the reader's reveal word (and so the burst) sits, as a share of the card's height. */
const WORD_Y = 0.34;
/** The clue shows this long before the word is revealed. */
const CLUE_MS = 650;
const KEPT_KEY = "kinemedia.burst-lab.kept";

const SAMPLES = [
  { word: "backpack", clue: "Túi đeo sau lưng khi đi học, đi phượt" },
  { word: "serendipity", clue: "Tình cờ gặp được điều tốt đẹp" },
  { word: "开心", clue: "Vui vẻ, phấn khởi" },
  { word: "사랑", clue: "Tình yêu" },
];

/** Party colours for the burst to read when it is not following the card's own palette. */
const FESTIVE = { accent: "#ffd23d", accentAlt: "#ff5d8f", ink: "#4dabff" };

type PaletteMode = "festive" | "theme";

export function BurstLabPage() {
  const [run, setRun] = useState(0);
  const [mode, setMode] = useState<PaletteMode>("theme");
  const [themeIndex, setThemeIndex] = useState(0);
  const [slow, setSlow] = useState(false);
  const [paused, setPaused] = useState(false);
  const [kept, setKept] = useState<BurstVariant[]>([]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEPT_KEY) ?? "[]") as string[];
      setKept(BURST_VARIANTS.filter((variant) => saved.includes(variant)));
    } catch {
      // A bad entry just starts the shortlist empty.
    }
  }, []);

  const toggleKept = (variant: BurstVariant) => {
    setKept((current) => {
      const next = current.includes(variant)
        ? current.filter((entry) => entry !== variant)
        : BURST_VARIANTS.filter((entry) => entry === variant || current.includes(entry));
      localStorage.setItem(KEPT_KEY, JSON.stringify(next));
      return next;
    });
  };

  const theme = THEMES[themeIndex % THEMES.length]!;

  return (
    <main className="burst-lab">
      <header className="burst-lab-head">
        <div>
          <h1>Hiệu ứng lộ từ (reveal burst)</h1>
          <p>Chạm vào một thẻ để xem lại. Đánh dấu “Giữ” những kiểu bạn muốn dùng.</p>
        </div>
        <div className="burst-lab-controls">
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
        <p className="burst-lab-kept">
          Giữ lại:{" "}
          {kept.length ? (
            <strong>{kept.map((variant) => `${BURST_INFO[variant].label} (${variant})`).join(", ")}</strong>
          ) : (
            <em>chưa chọn</em>
          )}
        </p>
      </header>
      <ul
        className="burst-lab-grid"
        style={{
          ["--burst-dur-scale" as string]: slow ? 1 / 0.3 : 1,
          ["--burst-play" as string]: paused ? "paused" : "running",
        }}
      >
        {BURST_VARIANTS.map((variant, index) => (
          <LabFrame
            key={variant}
            number={index + 1}
            variant={variant}
            run={run}
            theme={theme}
            festive={mode === "festive"}
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
  festive,
  kept,
  onToggleKept,
}: {
  number: number;
  variant: BurstVariant;
  run: number;
  theme: VocabularyTheme;
  festive: boolean;
  kept: boolean;
  onToggleKept: () => void;
}) {
  const [shot, setShot] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const sample = SAMPLES[(shot + number) % SAMPLES.length]!;

  useEffect(() => {
    setRevealed(false);
    const timer = window.setTimeout(() => setRevealed(true), CLUE_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shot, run]);

  const colours = festive ? FESTIVE : { accent: theme.accent, accentAlt: theme.accentAlt, ink: theme.ink };
  const info = BURST_INFO[variant];
  const cfg = BURST_CONFIG[variant];
  return (
    <li className="burst-lab-item" data-kept={kept || undefined}>
      <button
        type="button"
        className="burst-lab-frame"
        data-tone={theme.tone}
        style={
          {
            width: FRAME_W,
            height: FRAME_H,
            background: theme.paint,
            color: theme.ink,
            fontFamily: theme.font,
            ["--vocab-accent" as string]: colours.accent,
            ["--vocab-accent-alt" as string]: colours.accentAlt,
            ["--vocab-ink" as string]: colours.ink,
            ["--lab-accent" as string]: theme.accent,
          } as React.CSSProperties
        }
        onClick={() => setShot((n) => n + 1)}
        aria-label={`Xem lại ${info.label}`}
      >
        <span className="burst-lab-word" data-revealed={revealed || undefined}>
          {revealed ? sample.word : sample.clue}
        </span>
        {revealed && <RevealBurst key={`${shot}:${run}`} variant={variant} />}
        <span className="burst-lab-pill">Ê, từ này biết nè</span>
      </button>
      <div className="burst-lab-caption">
        <div>
          <strong>
            {number}. {info.label}
          </strong>
          <code>{variant}</code>
          <p>{info.blurb}</p>
          <p>
            <code>
              {cfg.flash} · {cfg.rings}vòng · {cfg.sparks}tia {cfg.sparkShape} · {cfg.motion}
            </code>
          </p>
        </div>
        <label className="burst-lab-keep">
          <input type="checkbox" checked={kept} onChange={onToggleKept} />
          Giữ
        </label>
      </div>
    </li>
  );
}
