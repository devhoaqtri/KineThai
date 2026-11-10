/**
 * How a card's clue highlight is coloured and which effects it may wear, by backdrop tone.
 *
 * A deep card keeps the player's own pick: light ink, a bright accent, auras that glow.
 * A pale card cannot use that pick. The player's palette search maximises contrast with
 * the backdrop, which on a pale card is the near-black #111827, so the highlight came out
 * as the ink itself, only bolder and larger. Its auras are no better: the pale-card rule
 * drops every text-shadow (so `glow` is nothing), `halo` blooms in the ink colour (a dark
 * smudge), and `sweep` and `flash` brighten toward white, which a pale card swallows. A
 * pale card therefore highlights in its own palette's accent and marks the word with
 * something drawn in that accent — an underline or a box — instead of light.
 *
 * Exports: cardEmphasisPool, cardEmphasisColor, PALE_CARD_UNSAFE_EMPHASIS
 * Depends on: canvas color math, kinetic-text emphasis variants
 */

import type { PaletteTone } from "@/features/canvas";
import { getColorDistance, parseCssColor } from "@/features/canvas/contrast/color-math";
import { EMPHASIS_VARIANTS, type EmphasisVariant } from "@/features/kinetic-text";
import type { VocabularyTheme } from "./presets";

/** Effects drawn in light: invisible or muddy on a pale backdrop. */
export const PALE_CARD_UNSAFE_EMPHASIS: readonly EmphasisVariant[] = [
  "glow",
  "halo",
  "sweep",
  "flash",
];

/** What a pale card wears in place of the light it gave up: a drawn mark in the accent. */
const PALE_CARD_MARKS: readonly EmphasisVariant[] = ["underline", "frame"];

/**
 * The RGB distance below which an accent reads as the ink itself. The player holds the
 * same line (canvas MIN_EMPHASIS_TEXT_DISTANCE) before it trusts a colour.
 */
const DISTINCT_FROM_INK = 92;

/**
 * The effects a card's highlight may draw from.
 * @param pool - the reveal style's authored pool; absent means the global pool
 * @param tone - the card's measured backdrop tone
 * @returns The pool unchanged on a deep card; on a pale one, without the light effects
 *   and, when any were dropped, with an accent underline and box in their place
 * @pure true
 */
export function cardEmphasisPool(
  pool: readonly EmphasisVariant[] | undefined,
  tone: PaletteTone,
): readonly EmphasisVariant[] | undefined {
  if (tone !== "light") return pool;
  const source = pool && pool.length > 0 ? pool : EMPHASIS_VARIANTS;
  const kept = source.filter((variant) => !PALE_CARD_UNSAFE_EMPHASIS.includes(variant));
  if (kept.length === source.length) return pool;
  return [...kept, ...PALE_CARD_MARKS.filter((mark) => !kept.includes(mark))];
}

/**
 * The colour a card's highlighted words take, or undefined to let the player pick.
 *
 * Both accents are audited against the backdrop, so either reads; the choice is about
 * telling the word apart from the ink around it. The primary accent wins when it is
 * clearly not the ink, then the secondary; when neither clears the line (a few palettes
 * set both accents near the ink's hue) the one farther from the ink is used, never a
 * colour from outside the palette.
 * @param theme - the card's palette roles
 * @returns The accent for a pale card; undefined on a deep one
 * @pure true
 */
export function cardEmphasisColor(
  theme: Pick<VocabularyTheme, "tone" | "ink" | "accent" | "accentAlt">,
): string | undefined {
  if (theme.tone !== "light") return undefined;
  const ink = parseCssColor(theme.ink);
  if (!ink) return theme.accent;
  const distance = (color: string) => {
    const rgb = parseCssColor(color);
    return rgb ? getColorDistance(rgb, ink) : 0;
  };
  const primary = distance(theme.accent);
  if (primary >= DISTINCT_FROM_INK) return theme.accent;
  const secondary = distance(theme.accentAlt);
  if (secondary >= DISTINCT_FROM_INK) return theme.accentAlt;
  return secondary > primary ? theme.accentAlt : theme.accent;
}
