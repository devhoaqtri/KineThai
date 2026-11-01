/**
 * The full-screen celebration that plays when a streak milestone is earned.
 *
 * The milestone's medal (./StreakMedal, in its tier metal) drops in
 * over a dimmed, blurred feed, with a ray burst, a shockwave, sparkles, falling confetti
 * and a count-up to the number of days. It covers the feed, so the feed is suspended for
 * as long as it is on screen (VocabularyFeedPage folds `celebrating` into `suspended`):
 * the next word waits behind it instead of playing out unseen.
 *
 * Decorative and CSS-driven, like RevealBurst: no framer-motion, no entrance clock. It is
 * not part of the kinetic word sequence, so usePausableEntrance would do nothing for it —
 * that hook only reads a clock WordSequenceText provides. The per-piece randomness is a
 * fixed seed, so every render of the same milestone is the same picture.
 *
 * It retires on timers, never on `animationend`. The blanket `prefers-reduced-motion` rule
 * in vocabulary.css sets `animation: none` on everything under the shell, so an
 * animationend listener never fires for a reduced-motion reader and the overlay would hold
 * the feed suspended forever. Every animated layer's resting style is therefore its final
 * frame (or hidden, for confetti and sparks), so the static picture is still complete; a
 * reader who turned animations off still earned the milestone and should still see it.
 *
 * It dismisses on "Tiếp tục" / "続ける", Escape, a tap anywhere once armed, or on its own after
 * STREAK_CELEBRATION_MS — the feed is often running hands-free, and a reader who has put
 * the phone down should come back to words, not a modal. The auto-close length is passed
 * into CSS as a custom property for the countdown bar, so the bar and the timer cannot
 * drift apart.
 *
 * Word milestones (lib/level-progress) reuse it whole: they pass `badge`, which swaps the
 * metal, the unit on the medal and the words, and keeps every bit of the choreography.
 *
 * Exports: StreakCelebration, STREAK_CELEBRATION_MS, CelebrationBadge
 * Depends on: React, ./StreakMedal, ../lib/streak-tiers, ../lib/useLocale, vocabulary.css
 */

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { streakBlurb, streakTier, streakTierLabel, type StreakTier } from "../lib/streak-tiers";
import { useLocale } from "../lib/useLocale";
import { StreakMedal } from "./StreakMedal";

/** What a non-streak milestone shows in place of the streak's metal, unit and words. */
export type CelebrationBadge = {
  tier: StreakTier;
  unit: string;
  title: string;
  blurb: string;
  /** A repeatable badge's count, shown on the medal's corner. */
  count?: number;
};

/** How long the celebration holds the screen before closing on its own. */
export const STREAK_CELEBRATION_MS = 7000;
/** The closing fade; matches .vocab-streak-flash[data-leaving] in vocabulary.css. */
const EXIT_MS = 420;
/**
 * Taps are ignored this long after mount. The milestone lands the instant a word ends,
 * often while a thumb is already on its way to the next one; that tap should not be the
 * thing that throws the medal away before it has landed.
 */
const ARM_MS = 900;
/** The count-up from 0 to the milestone, starting as the medal settles. */
const COUNT_DELAY_MS = 380;
const COUNT_MS = 950;

/** Deterministic 0..1 noise, so the confetti is the same picture on every render. */
function noise(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

const CONFETTI = Array.from({ length: 46 }, (_, i) => ({
  x: noise(i + 1) * 100,
  delay: 300 + noise(i + 51) * 1500,
  dur: 2600 + noise(i + 101) * 1900,
  sway: (noise(i + 151) - 0.5) * 140,
  spin: 360 + noise(i + 201) * 900,
  shape: (["strip", "square", "dot", "strip"] as const)[i % 4],
  hue: i % 6,
}));

const SPARKS = Array.from({ length: 16 }, (_, i) => ({
  angle: i * 22.5 + (noise(i + 301) - 0.5) * 14,
  dist: 0.5 + noise(i + 351) * 0.34,
  size: 5 + noise(i + 401) * 5,
  hue: i % 6,
}));

/** Twinkles around the medal: [left %, top %, size px, delay ms]. */
const TWINKLES: [number, number, number, number][] = [
  [8, 18, 18, 900],
  [88, 12, 14, 1250],
  [94, 58, 20, 1600],
  [4, 66, 13, 2000],
  [72, 92, 15, 1400],
  [22, 94, 11, 2300],
  [50, -4, 12, 1800],
];

function Twinkle() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 0 C13 8 16 11 24 12 C16 13 13 16 12 24 C11 16 8 13 0 12 C8 11 11 8 12 0Z" />
    </svg>
  );
}

/**
 * @param days - The milestone's number: days for a streak, words for a word badge
 * @param reducedMotion - Skip the count-up and the closing fade
 * @param onDone - Called once the celebration has fully left the screen
 * @param badge - A word milestone's metal, unit and words; absent for a streak
 */
export function StreakCelebration({
  days,
  reducedMotion,
  onDone,
  badge,
}: {
  days: number;
  reducedMotion: boolean;
  onDone: () => void;
  badge?: CelebrationBadge;
}) {
  const ui = useLocale();
  const tier = badge?.tier ?? streakTier(days);
  const uid = useId().replace(/:/g, "");
  const [leaving, setLeaving] = useState(false);
  const [shown, setShown] = useState(reducedMotion ? days : 0);
  const mountedAt = useRef(Date.now());
  const root = useRef<HTMLDivElement>(null);
  const leaveTimer = useRef<number | undefined>(undefined);

  const leave = useCallback(() => {
    if (leaveTimer.current !== undefined) return;
    setLeaving(true);
    leaveTimer.current = window.setTimeout(onDone, reducedMotion ? 0 : EXIT_MS);
  }, [onDone, reducedMotion]);

  useEffect(() => () => window.clearTimeout(leaveTimer.current), []);

  // The clock only runs while the page can be seen: a badge that lands as the reader switches
  // away waits for them, and gets its full time when they come back.
  useEffect(() => {
    let timer: number | undefined;
    const arm = () => {
      window.clearTimeout(timer);
      if (!document.hidden) timer = window.setTimeout(leave, STREAK_CELEBRATION_MS);
    };
    arm();
    document.addEventListener("visibilitychange", arm);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", arm);
    };
  }, [leave]);

  useEffect(() => {
    // Focus the dialog itself rather than the button: a programmatic focus on the button
    // paints its keyboard ring before the reader has touched a key.
    root.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") leave();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [leave]);

  // A short buzz on phones that have one. Not motion, so reduced motion keeps it.
  useEffect(() => {
    try {
      navigator.vibrate?.([24, 60, 36, 60, 70]);
    } catch {
      // Some embedded browsers throw instead of ignoring it.
    }
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      setShown(days);
      return;
    }
    let frame = 0;
    const start = performance.now() + COUNT_DELAY_MS;
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / COUNT_MS));
      setShown(Math.round(days * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [days, reducedMotion]);

  const tapAway = () => {
    if (Date.now() - mountedAt.current >= ARM_MS) leave();
  };

  const defaultTitle =
    ui === "ja"
      ? `${days}日連続達成！`
      : ui === "th"
        ? `ต่อเนื่อง ${days} วันติด!`
        : `Chuỗi ${days} ngày liên tiếp!`;
  const continueLabel = ui === "ja" ? "続ける" : ui === "th" ? "ไปต่อ" : "Tiếp tục";

  return (
    <div
      ref={root}
      tabIndex={-1}
      className="vocab-streak-flash"
      data-tier={tier}
      data-leaving={leaving || undefined}
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${uid}-title`}
      aria-describedby={`${uid}-blurb`}
      onClick={tapAway}
      style={{ "--vocab-streak-dur": `${STREAK_CELEBRATION_MS}ms` } as CSSProperties}
    >
      <div className="vocab-streak-flash-confetti" aria-hidden="true">
        {CONFETTI.map((piece, i) => (
          <i
            key={i}
            data-shape={piece.shape}
            data-hue={piece.hue}
            style={
              {
                left: `${piece.x}%`,
                "--d": `${piece.delay}ms`,
                "--t": `${piece.dur}ms`,
                "--sway": `${piece.sway}px`,
                "--spin": `${piece.spin}deg`,
              } as CSSProperties
            }
          />
        ))}
      </div>

      <div className="vocab-streak-flash-body">
        <div className="vocab-streak-flash-stage" aria-hidden="true">
          <div className="vocab-streak-flash-rays" />
          <div className="vocab-streak-flash-glow" />
          <div className="vocab-streak-flash-shock" />
          <div className="vocab-streak-flash-shock" data-late />
          {SPARKS.map((spark, i) => (
            <span
              key={i}
              className="vocab-streak-flash-spark"
              data-hue={spark.hue}
              style={
                {
                  "--a": `${spark.angle}deg`,
                  "--dist": spark.dist,
                  "--s": `${spark.size}px`,
                } as CSSProperties
              }
            />
          ))}
          {TWINKLES.map(([left, top, size, delay], i) => (
            <span
              key={i}
              className="vocab-streak-flash-twinkle"
              style={
                {
                  left: `${left}%`,
                  top: `${top}%`,
                  width: size,
                  height: size,
                  "--d": `${delay}ms`,
                } as CSSProperties
              }
            >
              <Twinkle />
            </span>
          ))}

          <div className="vocab-streak-flash-float">
            <StreakMedal
              days={days}
              value={shown}
              tier={tier}
              unit={badge?.unit}
              count={badge?.count}
              className="vocab-streak-flash-medal"
            />
          </div>
        </div>

        <div className="vocab-streak-flash-copy">
          <span className="vocab-streak-flash-tier">{streakTierLabel(tier, ui)}</span>
          <h2 className="vocab-streak-flash-title" id={`${uid}-title`}>
            {badge?.title ?? defaultTitle}
          </h2>
          <p className="vocab-streak-flash-caption" id={`${uid}-blurb`}>
            {badge?.blurb ?? streakBlurb(days, ui)}
          </p>
          <button
            type="button"
            className="vocab-streak-flash-go"
            onClick={(event) => {
              event.stopPropagation();
              leave();
            }}
          >
            {continueLabel}
            <span className="vocab-streak-flash-timer" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
