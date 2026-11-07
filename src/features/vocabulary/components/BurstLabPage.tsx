/**
 * /burst-lab: the reveal-burst designs side by side on mock reveal cards, with the tools to
 * judge them — replay, slow motion, pause, frame-by-frame stepping and a scrubber, each
 * design on a deep and a pale card at once, a phone-sized close-up, the calm
 * (reduced-motion) form, and a frame-rate readout.
 *
 * Development only (the route answers 404 in a production build). Everything runs off one
 * lab clock: the bursts draw any moment as a pure function of time (lib/burst-engine), so
 * slow motion, pausing and scrubbing are exact, and every card on the page shows the same
 * instant. A card's clue shows during a short pre-roll, then the word lands and the burst
 * fires at t = 0. A tap on a card replays just that card. The "Giữ" marks are remembered in
 * this browser only, as a shortlist to report back.
 *
 * window.__burstLab (seek / pause / play / replay) lets a headless capture step frames.
 *
 * Exports: BurstLabPage
 * Depends on: ./RevealBurst, ../lib/burst-variants, ../lib/burst-engine, ../lib/presets
 */

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { THEMES, type VocabularyTheme } from "../lib/presets";
import {
  BURST_CONFIG,
  BURST_INFO,
  BURST_ROTATION,
  BURST_VARIANTS,
  DEFAULT_BURST_VARIANT,
  type BurstConfig,
  type BurstVariant,
} from "../lib/burst-variants";
import { buildScene } from "../lib/burst-engine";
import { RevealBurst } from "./RevealBurst";
import "../vocabulary.css"; // the burst canvas is styled there; this page mounts it without the feed
import "./burst-lab.css";

/** The clue holds this long before the word lands and the burst fires, s. */
const PREROLL = 0.55;
/** After the longest design has settled, the loop rests this long before replaying, s. */
const REST = 0.7;
const STEP = 1 / 60;
const SPEEDS = [1, 0.5, 0.25, 0.1] as const;
const KEPT_KEY = "kinemedia.burst-lab.kept";

const SAMPLES = [
  {
    word: "backpack",
    clue: "Túi đeo sau lưng khi đi học, đi phượt",
    meaning: "ba lô",
    example: "I packed my backpack for the trip.",
  },
  {
    word: "serendipity",
    clue: "Tình cờ gặp được điều tốt đẹp",
    meaning: "sự tình cờ may mắn",
    example: "Meeting her was pure serendipity.",
  },
  { word: "开心", clue: "Vui vẻ, phấn khởi", meaning: "vui vẻ", example: "今天我很开心。" },
  { word: "사랑", clue: "Tình yêu", meaning: "tình yêu", example: "사랑해요." },
];

const DARK_THEMES = THEMES.filter((theme) => theme.tone === "dark");
const LIGHT_THEMES = THEMES.filter((theme) => theme.tone === "light");

type ToneMode = "both" | "dark" | "light";
type View = "grid" | "focus";

/** The scene length of a design, s (the same for every seed). */
const durationOf = (config: BurstConfig, calm: boolean) => buildScene(config, 1, calm).duration;

/** A card the lab clock paints; `calm` lands its word without a pop, as reduced motion does. */
type CardHandle = { word: HTMLElement; clue: HTMLElement; offset: number; calm: boolean };

const easeOutBack = (u: number) => 1 + 2.7 * (u - 1) ** 3 + 1.7 * (u - 1) ** 2;

/** The mock word's own entrance, driven by the lab clock so slow motion slows it too. */
function paintCard(card: CardHandle, t: number) {
  if (t < 0) {
    card.clue.style.opacity = "1";
    card.word.style.opacity = "0";
    card.word.style.transform = "translate(-50%, -50%) scale(0.6)";
    return;
  }
  const u = card.calm ? 1 : Math.min(1, t / 0.42);
  card.clue.style.opacity = String(Math.max(0, 1 - t / 0.06));
  card.word.style.opacity = String(Math.min(1, t / 0.14));
  card.word.style.transform = `translate(-50%, -50%) scale(${0.6 + 0.4 * easeOutBack(u)})`;
}

export function BurstLabPage() {
  const [view, setView] = useState<View>("grid");
  const [focus, setFocus] = useState<BurstVariant>(DEFAULT_BURST_VARIANT);
  const [toneMode, setToneMode] = useState<ToneMode>("both");
  const [darkIndex, setDarkIndex] = useState(0);
  const [lightIndex, setLightIndex] = useState(0);
  const [sampleIndex, setSampleIndex] = useState(0);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [paused, setPaused] = useState(false);
  const [loop, setLoop] = useState(true);
  const [calm, setCalm] = useState(false);
  const [seed, setSeed] = useState(1);
  const [kept, setKept] = useState<BurstVariant[]>([]);

  const variants = useMemo(() => (view === "focus" ? [focus] : BURST_VARIANTS), [view, focus]);
  const period = useMemo(
    () => Math.max(...variants.map((variant) => durationOf(BURST_CONFIG[variant], calm))),
    [variants, calm],
  );

  // One clock for the page; cards register so the loop can paint their word entrance.
  const clock = useRef({ t: -PREROLL, speed: 1 as number, paused: false, loop: true, period: 2 });
  const cards = useRef(new Map<string, CardHandle>());
  const scrubber = useRef<HTMLInputElement>(null);
  const readout = useRef<HTMLSpanElement>(null);
  const fpsOut = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    clock.current.speed = speed;
    clock.current.paused = paused;
    clock.current.loop = loop;
    clock.current.period = period;
  }, [speed, paused, loop, period]);

  const replay = useCallback(() => {
    clock.current.t = -PREROLL;
    for (const card of cards.current.values()) card.offset = 0;
  }, []);
  const seek = useCallback((t: number) => {
    clock.current.t = t;
    for (const card of cards.current.values()) card.offset = 0;
    setPaused(true);
    clock.current.paused = true;
  }, []);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const intervals: number[] = [];
    let drops = 0;
    let shownAt = 0;
    const tick = (now: number) => {
      const ms = now - last;
      last = now;
      const c = clock.current;
      if (!c.paused) {
        c.t += (Math.min(ms, 100) / 1000) * c.speed;
        intervals.push(ms);
        if (intervals.length > 90) intervals.shift();
        if (ms > 16.7 * 1.5 && c.t > 0 && c.t < c.period) drops += 1;
        if (c.loop && c.t > c.period + REST) {
          c.t = -PREROLL;
          for (const card of cards.current.values()) card.offset = 0;
          drops = 0;
        }
      }
      for (const card of cards.current.values()) paintCard(card, c.t - card.offset);
      if (scrubber.current && document.activeElement !== scrubber.current) {
        scrubber.current.value = String(Math.max(-PREROLL, Math.min(c.t, c.period)));
      }
      if (readout.current)
        readout.current.textContent = `${c.t >= 0 ? "+" : ""}${c.t.toFixed(3)} s`;
      if (fpsOut.current && now - shownAt > 250 && intervals.length > 10) {
        shownAt = now;
        const sorted = [...intervals].sort((a, b) => a - b);
        const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const worst = sorted[sorted.length - 1]!;
        fpsOut.current.textContent = `${Math.round(1000 / avg)} fps · chậm nhất ${worst.toFixed(0)} ms · rớt ${drops} khung`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Headless captures step the clock directly.
  useEffect(() => {
    const api = {
      seek,
      pause: () => setPaused(true),
      play: () => setPaused(false),
      replay,
    };
    (window as unknown as { __burstLab?: typeof api }).__burstLab = api;
    return () => {
      delete (window as unknown as { __burstLab?: typeof api }).__burstLab;
    };
  }, [seek, replay]);

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
      try {
        localStorage.setItem(KEPT_KEY, JSON.stringify(next));
      } catch {
        // The shortlist is a convenience; it simply is not remembered.
      }
      return next;
    });
  };

  const stepBy = useCallback(
    (frames: number) => {
      seek(clock.current.t + frames * STEP);
    },
    [seek],
  );
  const moveFocus = useCallback((by: number) => {
    setFocus((current) => {
      const at = BURST_VARIANTS.indexOf(current);
      return BURST_VARIANTS[(at + by + BURST_VARIANTS.length) % BURST_VARIANTS.length]!;
    });
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement && event.target.type !== "range") return;
      if (event.key === " ") {
        event.preventDefault();
        setPaused((value) => !value);
      } else if (event.key === "r" || event.key === "R") {
        replay();
      } else if (event.key === "," || event.key === ".") {
        stepBy(event.key === "," ? -1 : 1);
      } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        if (view === "focus") moveFocus(event.key === "ArrowLeft" ? -1 : 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [replay, stepBy, moveFocus, view]);

  // Changing what is on screen starts it from the top, so every card is in step.
  useEffect(() => {
    replay();
  }, [view, focus, calm, seed, darkIndex, lightIndex, sampleIndex, toneMode, replay]);

  const dark = DARK_THEMES[darkIndex % DARK_THEMES.length]!;
  const light = LIGHT_THEMES[lightIndex % LIGHT_THEMES.length]!;
  const tones: VocabularyTheme[] =
    toneMode === "both" ? [dark, light] : toneMode === "dark" ? [dark] : [light];
  const register = useCallback((id: string, handle: CardHandle | null) => {
    if (handle) cards.current.set(id, handle);
    else cards.current.delete(id);
  }, []);
  const timeFor = useCallback(
    (id: string) => () => clock.current.t - (cards.current.get(id)?.offset ?? 0),
    [],
  );
  const replayCard = useCallback((id: string) => {
    const card = cards.current.get(id);
    if (card) card.offset = clock.current.t + PREROLL;
  }, []);

  return (
    <main className="burst-lab" data-view={view}>
      <header className="burst-lab-head">
        <div className="burst-lab-title">
          <h1>Hiệu ứng lộ từ</h1>
          <p>
            Mỗi kiểu chạy trên nền tối và nền sáng cùng lúc, chung một đồng hồ. Chạm vào thẻ để xem
            lại riêng thẻ đó. Phím: Space dừng/chạy · R phát lại · , . lùi/tiến 1 khung
            {view === "focus" ? " · ← → đổi kiểu" : ""}.
          </p>
        </div>
        <div className="burst-lab-bar" role="toolbar" aria-label="Điều khiển">
          <div className="burst-lab-group">
            <button type="button" onClick={replay} title="R">
              ↻ Phát lại
            </button>
            <button
              type="button"
              aria-pressed={paused}
              onClick={() => setPaused(!paused)}
              title="Space"
            >
              {paused ? "▶ Chạy" : "❚❚ Dừng"}
            </button>
            <button type="button" onClick={() => stepBy(-1)} aria-label="Lùi 1 khung" title=",">
              ◀︎ 1
            </button>
            <button type="button" onClick={() => stepBy(1)} aria-label="Tiến 1 khung" title=".">
              1 ▶︎
            </button>
            <button type="button" aria-pressed={loop} onClick={() => setLoop(!loop)}>
              Lặp
            </button>
          </div>
          <div className="burst-lab-group" aria-label="Tốc độ">
            {SPEEDS.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={speed === value}
                onClick={() => setSpeed(value)}
              >
                {value === 1 ? "1×" : value === 0.5 ? "½×" : value === 0.25 ? "¼×" : "⅒×"}
              </button>
            ))}
          </div>
          <div className="burst-lab-group" aria-label="Nền">
            {(["both", "dark", "light"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={toneMode === mode}
                onClick={() => setToneMode(mode)}
              >
                {mode === "both" ? "Tối + sáng" : mode === "dark" ? "Tối" : "Sáng"}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setDarkIndex((n) => n + 1)}
              title="Đổi bảng màu nền tối"
            >
              ◐ {dark.label}
            </button>
            <button
              type="button"
              onClick={() => setLightIndex((n) => n + 1)}
              title="Đổi bảng màu nền sáng"
            >
              ◑ {light.label}
            </button>
          </div>
          <div className="burst-lab-group">
            <button
              type="button"
              aria-pressed={view === "focus"}
              onClick={() => setView(view === "grid" ? "focus" : "grid")}
            >
              {view === "grid" ? "⤢ Cỡ điện thoại" : "▦ Lưới"}
            </button>
            <button
              type="button"
              aria-pressed={calm}
              onClick={() => setCalm(!calm)}
              title="Bản thay thế khi bật giảm chuyển động"
            >
              Giảm chuyển động
            </button>
            <button type="button" onClick={() => setSampleIndex((n) => n + 1)}>
              Từ: {SAMPLES[sampleIndex % SAMPLES.length]!.word}
            </button>
            <button
              type="button"
              onClick={() => setSeed((n) => n + 1)}
              title="Ném lại với hạt ngẫu nhiên khác"
            >
              🎲 Hạt #{seed}
            </button>
          </div>
        </div>
        <div className="burst-lab-timeline">
          <input
            ref={scrubber}
            type="range"
            min={-PREROLL}
            max={period}
            step={0.001}
            defaultValue={-PREROLL}
            aria-label="Tua"
            onInput={(event) => seek(Number(event.currentTarget.value))}
          />
          <span ref={readout} className="burst-lab-time" />
          <span ref={fpsOut} className="burst-lab-fps" />
        </div>
        <p className="burst-lab-kept">
          Giữ lại:{" "}
          {kept.length ? (
            <strong>
              {kept.map((variant) => `${BURST_INFO[variant].label} (${variant})`).join(", ")}
            </strong>
          ) : (
            <em>chưa chọn</em>
          )}
        </p>
      </header>

      {view === "focus" && (
        <nav className="burst-lab-tabs" aria-label="Kiểu">
          {BURST_VARIANTS.map((variant, index) => (
            <button
              key={variant}
              type="button"
              aria-pressed={focus === variant}
              onClick={() => setFocus(variant)}
            >
              {index + 1}. {BURST_INFO[variant].label}
            </button>
          ))}
        </nav>
      )}

      <ul className="burst-lab-grid">
        {variants.map((variant) => {
          const number = BURST_VARIANTS.indexOf(variant) + 1;
          const sample =
            SAMPLES[(sampleIndex + (view === "grid" ? number - 1 : 0)) % SAMPLES.length]!;
          return (
            <li
              key={variant}
              className="burst-lab-item"
              data-kept={kept.includes(variant) || undefined}
            >
              <div className="burst-lab-pair">
                {tones.map((theme) => {
                  const id = `${variant}:${theme.tone}`;
                  return (
                    <LabCard
                      key={`${id}:${theme.id}:${calm}:${seed}:${sample.word}`}
                      id={id}
                      variant={variant}
                      theme={theme}
                      sample={sample}
                      calm={calm}
                      seed={seed}
                      time={timeFor(id)}
                      register={register}
                      onReplay={() => replayCard(id)}
                    />
                  );
                })}
              </div>
              <Caption
                number={number}
                variant={variant}
                calm={calm}
                kept={kept.includes(variant)}
                onToggleKept={() => toggleKept(variant)}
                onFocus={
                  view === "grid"
                    ? () => {
                        setFocus(variant);
                        setView("focus");
                      }
                    : undefined
                }
              />
            </li>
          );
        })}
      </ul>
    </main>
  );
}

function LabCard({
  id,
  variant,
  theme,
  sample,
  calm,
  seed,
  time,
  register,
  onReplay,
}: {
  id: string;
  variant: BurstVariant;
  theme: VocabularyTheme;
  sample: (typeof SAMPLES)[number];
  calm: boolean;
  seed: number;
  time: () => number;
  register: (id: string, handle: CardHandle | null) => void;
  onReplay: () => void;
}) {
  const word = useRef<HTMLSpanElement>(null);
  const clue = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!word.current || !clue.current) return;
    register(id, { word: word.current, clue: clue.current, offset: 0, calm });
    return () => register(id, null);
  }, [id, register, calm]);

  const chars = [...sample.word].length;
  // CJK and Hangul glyphs are about twice as wide as Latin letters.
  const wide = [...sample.word].some((ch) => {
    const code = ch.codePointAt(0) ?? 0;
    return (code >= 0x3000 && code <= 0x9fff) || (code >= 0xac00 && code <= 0xd7af);
  });
  return (
    <button
      type="button"
      className="burst-lab-card"
      data-tone={theme.tone}
      style={
        {
          background: theme.paint,
          color: theme.ink,
          fontFamily: theme.font,
          "--vocab-accent": theme.accent,
          "--vocab-accent-alt": theme.accentAlt,
          "--vocab-ink": theme.ink,
          "--lab-accent": theme.accent,
          "--lab-on-accent": theme.onAccent,
          "--lab-word-size": `min(17cqw, ${(wide ? 80 : 150) / chars}cqw)`,
        } as CSSProperties
      }
      onClick={onReplay}
      aria-label={`Xem lại ${BURST_INFO[variant].label} trên nền ${theme.tone === "dark" ? "tối" : "sáng"}`}
    >
      <RevealBurst variant={variant} reducedMotion={calm} seed={seed} time={time} />
      <span ref={clue} className="burst-lab-clue">
        {sample.clue}
      </span>
      <span ref={word} className="burst-lab-word" data-burst-word="">
        {sample.word}
      </span>
      <span className="burst-lab-details" data-burst-floor="">
        <strong>{sample.meaning}</strong>
        <em>{sample.example}</em>
      </span>
      <span className="burst-lab-pill">Ê, từ này biết nè</span>
    </button>
  );
}

function Caption({
  number,
  variant,
  calm,
  kept,
  onToggleKept,
  onFocus,
}: {
  number: number;
  variant: BurstVariant;
  calm: boolean;
  kept: boolean;
  onToggleKept: () => void;
  onFocus?: () => void;
}) {
  const info = BURST_INFO[variant];
  const cfg = BURST_CONFIG[variant];
  const scene = buildScene(cfg, 1, calm);
  const parts = [
    cfg.anticipation ? `lấy đà ${Math.round(cfg.anticipation * 1000)}ms` : null,
    cfg.bloom ? "quầng" : null,
    cfg.rings ? `${cfg.rings.count} vòng` : null,
    cfg.rays ? `${cfg.rays.count} tia sáng` : null,
    ...Object.entries(
      cfg.emitters.reduce<Record<string, number>>((sum, em) => {
        sum[em.shape] = (sum[em.shape] ?? 0) + em.count;
        return sum;
      }, {}),
    ).map(([shape, count]) => `${count} ${SHAPE_NAME[shape as keyof typeof SHAPE_NAME]}`),
    `${scene.particles.length} hạt`,
    `${scene.duration.toFixed(2)}s`,
  ].filter(Boolean);
  return (
    <div className="burst-lab-caption">
      <div>
        <strong>
          {number}. {info.label}
        </strong>
        <code>{variant}</code>
        {BURST_ROTATION.includes(variant) && (
          <span
            className="burst-lab-badge"
            title="Bảng tin xoay vòng giữa các kiểu này, mỗi từ một kiểu"
          >
            đang xoay vòng
          </span>
        )}
        <p>{info.blurb}</p>
        <p className="burst-lab-spec">{parts.join(" · ")}</p>
      </div>
      <div className="burst-lab-actions">
        {onFocus && (
          <button type="button" onClick={onFocus}>
            Soi kỹ
          </button>
        )}
        <label className="burst-lab-keep">
          <input type="checkbox" checked={kept} onChange={onToggleKept} />
          Giữ
        </label>
      </div>
    </div>
  );
}

const SHAPE_NAME = {
  streak: "vệt",
  glint: "sao",
  confetti: "giấy",
  dot: "chấm",
  flash: "chớp",
} as const;
