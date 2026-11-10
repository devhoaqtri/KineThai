/**
 * The first-visit demo's opening badge ("Từ gì mà ..."). Markup only: the timeline is in
 * vocabulary.css, written as shares of `--demo-badge-dur` so it ends exactly when the card
 * is let go, and each look (lib/badge-variants) only repaints it. It takes no pointer
 * events, so the reader can scroll on to another word underneath it.
 *
 * Exports: DemoBadge
 * Depends on: ../lib/badge-variants, vocabulary.css
 */

import type { CSSProperties } from "react";
import { DEMO_BADGE_VARIANT, type BadgeVariant } from "../lib/badge-variants";

/**
 * @param props.text - the hook line
 * @param props.durationMs - the whole timeline, ms
 * @param props.variant - the look; the shipped one by default
 * @param props.contained - fill the nearest positioned box instead of the screen (the lab)
 */
export function DemoBadge({
  text,
  durationMs,
  variant = DEMO_BADGE_VARIANT,
  contained = false,
}: {
  text: string;
  durationMs: number;
  variant?: BadgeVariant;
  contained?: boolean;
}) {
  return (
    <div
      className="vocab-demo-badge"
      role="status"
      data-variant={variant}
      data-contained={contained || undefined}
      style={{ "--demo-badge-dur": `${durationMs}ms` } as CSSProperties}
    >
      <div className="vocab-demo-badge-veil" />
      {/* Effect layers some looks paint (aurora, rays, grid, sparks); bare in classic. */}
      <div className="vocab-demo-badge-backdrop" aria-hidden="true" />
      <div className="vocab-demo-badge-aura" aria-hidden="true" />
      <div className="vocab-demo-badge-ring" />
      <div className="vocab-demo-badge-card">
        <span className="vocab-demo-badge-text">{text}</span>
      </div>
    </div>
  );
}
