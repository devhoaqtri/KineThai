/**
 * Reveal-page celebration layer: a word's emoji aggregate billows out as two-sided
 * smoke, gradually, across the reveal page AND the spelling coda, and the whole
 * layer fades out as the word leaves.
 *
 * Each emoji flies out of its OWN button in the emoji strip (that button carries
 * the count as a badge), and the number of glyphs that fly for an emoji is
 * apportioned from the same count, so the flight and the numbers agree.
 *
 * Purely presentational by design — it arms no timer and calls no completion
 * handler, because page timing belongs solely to useLearningPlayback. It also
 * takes no pointer events, so the card's tap/swipe gestures and the emoji strip
 * underneath keep working while glyphs are in flight.
 *
 * Exports: EmojiBurst
 * Depends on: framer-motion, ../lib/emoji
 */

import { useMemo } from "react";
import { motion } from "framer-motion";
import { burstGlyphs, clampBurstSpan, type EmojiTotals } from "../lib/emoji";

/** Share of the span the layer stays fully lit before it fades out with the word. */
const FADE_HOLD_SHARE = 0.72;
/** Keyframe positions of one puff: birth at the button, mid-drift, dissipation. */
const SMOKE_TIMES = [0, 0.42, 1];
/** Opacity at mid-flight — smoke is never fully solid the way confetti is. */
const SMOKE_PEAK_OPACITY = 0.92;

/**
 * Billow the word's emoji totals out of the reaction button, to both sides.
 * @param props Word identity, aggregate, per-emoji counts, launch point, span and motion preference
 * @returns An overlay layer; null when there is nothing to fly
 */
export function EmojiBurst({
  wordId,
  totals,
  width,
  height,
  origins,
  originX,
  originY,
  spanSeconds,
  reducedMotion,
  limit,
}: {
  wordId: string;
  /** Mocked aggregate; drives glyph composition and stays stable for the word. */
  totals: EmojiTotals;
  width: number;
  height: number;
  /** Per-emoji launch points, card-local px, measured from each strip button. */
  origins: Record<string, { x: number; y: number }>;
  /** Fallback launch point for any emoji whose button was not measured. */
  originX: number;
  originY: number;
  /** Reveal page plus spelling coda, in seconds — the layer fades out across it. */
  spanSeconds: number;
  reducedMotion: boolean;
  /** How many glyphs fly; omitted, the span decides (the feed). */
  limit?: number;
}) {
  const span = clampBurstSpan(spanSeconds);
  // Deliberately keyed on the mocked aggregate, not on the merged counts: a reader
  // tapping an emoji updates its badge without restarting a twelve-second
  // animation from the beginning.
  const glyphs = useMemo(
    () => burstGlyphs(totals, wordId, { spanSeconds: span, limit }),
    [totals, wordId, span, limit],
  );

  if (!glyphs.length) return null;

  return (
    <motion.div
      className="vocab-emoji-burst"
      initial={{ opacity: 1 }}
      // The layer outlives every individual glyph and fades as a whole, so the
      // burst leaves with the spelled word instead of ending while letters land.
      animate={reducedMotion ? { opacity: 1 } : { opacity: [1, 1, 0] }}
      transition={
        reducedMotion
          ? { duration: 0 }
          : { duration: span, times: [0, FADE_HOLD_SHARE, 1], ease: "easeInOut" }
      }
    >
      {!reducedMotion && (
        <div className="vocab-emoji-burst-field" aria-hidden="true">
          {glyphs.map((glyph) => {
            // Travel is in pixels from the emoji's OWN button (measured while the
            // strip was on screen), so each plume leaves from the badge it belongs to.
            const outward = glyph.side * glyph.lateral * width;
            const climb = glyph.rise * height;
            const launch = origins[glyph.emoji] ?? { x: originX, y: originY };
            return (
              <motion.span
                key={glyph.key}
                className="vocab-emoji-burst-glyph"
                data-side={glyph.side < 0 ? "left" : "right"}
                style={{ left: launch.x, top: launch.y, fontSize: `${glyph.scale}em` }}
                initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
                animate={{
                  x: [0, outward * 0.45 + glyph.wobble, outward],
                  y: [0, -climb * 0.55, -climb],
                  opacity: [0, SMOKE_PEAK_OPACITY, 0],
                  // Grows as it fades: a puff dissipating, not an object flying away.
                  scale: [0.4, 1, glyph.billow],
                }}
                transition={{
                  duration: glyph.duration,
                  delay: glyph.delay,
                  times: SMOKE_TIMES,
                  ease: "easeOut",
                }}
              >
                {glyph.emoji}
              </motion.span>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
