/**
 * One-shot celebration behind the revealed word. The default (classic) is an accent flood
 * that sweeps the card, a ring, and a ring of sparks; a dozen more designs reuse the same
 * atoms through a variant config (lib/burst-variants). The emoji smoke that follows is slow
 * and soft on purpose, so this is the crisp half of the payoff — it is over in about a
 * second and then gets out of the way.
 *
 * Purely decorative and CSS-driven: no timers, no state, no pointer events. This component
 * only turns a BurstConfig into CSS custom properties and data-* attributes and renders the
 * right atoms; vocabulary.css does the animating. Mount with a fresh `key` to replay.
 *
 * Exports: RevealBurst
 * Depends on: ../lib/burst-variants (CSS in ../vocabulary.css)
 */

import type { CSSProperties } from "react";
import {
  BURST_CONFIG,
  BURST_EASE,
  sparkFan,
  type BurstVariant,
} from "../lib/burst-variants";

/**
 * Render the reveal flood, rings, sparks and optional sweep for one design, centred on the
 * answer. Every colour comes from the card's own `--vocab-accent` / `-alt` / `--vocab-ink`.
 * @param root Which design to throw; `classic` is the shipped default
 * @returns Decorative overlay; it animates once on mount
 */
export function RevealBurst({ variant = "classic" }: { variant?: BurstVariant } = {}) {
  const cfg = BURST_CONFIG[variant];
  const sparks = sparkFan(cfg.sparks, cfg.motion);
  const root = {
    "--burst-scale": cfg.scale,
    "--flash-dur": `${cfg.flashDur}s`,
    "--ring-dur": `${cfg.ringDur}s`,
    "--spark-dur": `${cfg.sparkDur}s`,
    "--burst-ease": BURST_EASE[cfg.ease],
  } as CSSProperties;

  return (
    <div
      className="vocab-reveal-burst"
      data-flash={cfg.flash}
      data-spark-shape={cfg.sparkShape}
      data-motion={cfg.motion}
      data-sweep={cfg.sweep || undefined}
      style={root}
      aria-hidden="true"
    >
      {cfg.flash !== "none" && <span className="vocab-reveal-flash" />}
      {Array.from({ length: cfg.rings }, (_, index) => (
        <span
          key={index}
          className="vocab-reveal-ring"
          style={
            {
              "--ring-i": index,
              borderColor: index % 2 ? "var(--vocab-accent)" : "var(--vocab-accent-alt)",
            } as CSSProperties
          }
        />
      ))}
      {sparks.map((spark, index) => (
        <i
          key={index}
          className="vocab-reveal-spark"
          data-tint={spark.tint}
          style={
            {
              "--spark-angle": `${spark.angle}deg`,
              "--spark-reach": spark.reach,
              "--spark-delay": `${spark.delay}s`,
              "--spark-drift": `${spark.drift}px`,
            } as CSSProperties
          }
        />
      ))}
      {cfg.sweep && <span className="vocab-reveal-sweep" />}
    </div>
  );
}
