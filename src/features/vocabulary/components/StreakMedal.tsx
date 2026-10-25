/**
 * A streak medal: a glossy coin in its tier's metal over two ribbon tails.
 *
 * Deliberately plain — one bevel ring, one highlight, no rosette, wreath or engraving — so
 * it reads as an award at any size, from the full-screen celebration down to a tile in the
 * saved drawer. It sizes to its container: the number is set in container-query units, so
 * the caller only gives it a width.
 *
 * The metal comes from the `[data-tier]` tokens in vocabulary.css, set here; the ribbon
 * takes `--medal-ribbon` when the caller provides one (the celebration passes the live
 * card's accent) and the tier's own deep tone otherwise.
 *
 * Exports: StreakMedal
 * Depends on: React, ../lib/streak-tiers, vocabulary.css
 */

import { useId, type ReactNode } from "react";
import { streakTier, type StreakTier } from "../lib/streak-tiers";

/**
 * @param days - The milestone: days for a streak, words for a word badge
 * @param className - Extra class for the caller's sizing and animation
 * @param value - What to print on the face; defaults to `days` (the celebration counts up)
 * @param tier - The metal; defaults to the streak tier for `days`
 * @param unit - The word under the number; "ngày" for a streak, "từ" for a word badge
 */
export function StreakMedal({
  days,
  className,
  value = days,
  tier = streakTier(days),
  unit = "ngày",
}: {
  days: number;
  className?: string;
  value?: ReactNode;
  tier?: StreakTier;
  unit?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const face = `mf-${uid}`;
  const rim = `mr-${uid}`;
  const tail = `mt-${uid}`;
  return (
    <div
      className={className ? `vocab-medal ${className}` : "vocab-medal"}
      data-tier={tier}
      aria-hidden="true"
    >
      <svg viewBox="0 0 200 224" className="vocab-medal-svg">
        <defs>
          <linearGradient id={rim} x1="0.15" y1="0" x2="0.85" y2="1">
            <stop offset="0" stopColor="var(--m-hi)" />
            <stop offset="0.45" stopColor="var(--m-mid)" />
            <stop offset="1" stopColor="var(--m-lo)" />
          </linearGradient>
          <linearGradient id={face} x1="0.85" y1="0" x2="0.15" y2="1">
            <stop offset="0" stopColor="var(--m-hi)" />
            <stop offset="0.55" stopColor="var(--m-disc)" />
            <stop offset="1" stopColor="var(--m-mid)" />
          </linearGradient>
          <linearGradient id={tail} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--medal-ribbon, var(--m-lo))" />
            <stop
              offset="1"
              stopColor="color-mix(in srgb, var(--medal-ribbon, var(--m-lo)) 72%, #000)"
            />
          </linearGradient>
        </defs>
        <g className="vocab-medal-ribbon">
          <polygon points="70,140 100,150 84,218 70,204 54,212" fill={`url(#${tail})`} />
          <polygon points="130,140 100,150 116,218 130,204 146,212" fill={`url(#${tail})`} />
        </g>
        <circle cx="100" cy="96" r="80" fill={`url(#${rim})`} />
        <circle cx="100" cy="96" r="65" fill={`url(#${face})`} />
        <circle
          cx="100"
          cy="96"
          r="65"
          fill="none"
          stroke="var(--m-deep)"
          strokeOpacity="0.28"
          strokeWidth="2"
        />
        <circle
          cx="100"
          cy="96"
          r="79"
          fill="none"
          stroke="#fff"
          strokeOpacity="0.45"
          strokeWidth="1.5"
        />
        {/* A soft specular crescent across the upper left. */}
        <path d="M 46 78 A 56 56 0 0 1 128 42 A 70 70 0 0 0 46 78 Z" fill="#fff" opacity="0.5" />
      </svg>
      <div className="vocab-medal-shine" />
      <div className="vocab-medal-face" data-digits={String(days).length}>
        <strong>{value}</strong>
        <span>{unit}</span>
      </div>
    </div>
  );
}
