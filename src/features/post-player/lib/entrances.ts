/**
 * Auto-picked word entrance personalities for the feed player.
 *
 * Exports: ENTRANCE_REST, getEntranceRest, getEntranceStyle, getEntranceHidden, getEntranceTransition
 * Depends on: framer-motion TargetAndTransition/Transition, canvas Entrance/Rhythm, kinetic-text getStableNumber
 */

import type { TargetAndTransition, Transition } from "framer-motion";
import type { Entrance, Rhythm } from "@/features/canvas";
import { getStableNumber } from "@/features/kinetic-text";

// Every post is auto-assigned one of these word-entrance "personalities", picked
// stably from its text so replays look identical and the creator never has to
// choose. Only the starting (`hidden`) state and the transition curve differ —
// all of them settle to the exact same neutral resting state, so layout, fit and
// emphasis sizing are unaffected no matter which entrance plays.
const ENTRANCE_STYLES = ["rise", "fall", "pop", "drift", "tilt", "focus"] as const;
const POETIC_ENTRANCE_STYLES = ["poetic-bloom", "poetic-drift"] as const;
type EntranceStyle = (typeof ENTRANCE_STYLES)[number];
type PoeticEntranceStyle = (typeof POETIC_ENTRANCE_STYLES)[number];
export type ResolvedEntranceStyle = EntranceStyle | PoeticEntranceStyle;

// A caller that authors its entrance (a vocabulary reveal style) names the personality
// instead of leaving it to the seed. Each authored name gets the pool member with the
// same character and no two share one, so presets that differ in entrance differ on
// screen. `fade` takes the plain rise rather than `focus`: blur stays the one thing
// that sets the `blur` entrance apart, and it is the costliest of the six to animate.
const AUTHORED_ENTRANCE_STYLES: Record<Entrance, EntranceStyle> = {
  fade: "rise",
  slide: "drift",
  scale: "pop",
  blur: "focus",
  split: "tilt",
};

// Shared resting state — resets every transform any hidden state touches (x, y, scale,
// rotate) so words always land in the same place.
//
// `filter` is deliberately NOT here; getEntranceRest adds it only for the entrances that
// actually blur. See that function for why a resting `blur(0px)` is not free.
export const ENTRANCE_REST: TargetAndTransition = {
  opacity: 1,
  x: 0,
  y: 0,
  scale: 1,
  rotate: 0,
};

/**
 * The resting state for one word, given the hidden state it is coming from.
 *
 * Three of the eight entrances blur; the other five never touch `filter`. Landing all of
 * them on `filter: blur(0px)` meant five-eighths of the app's words sat under a filter they
 * never needed — and a zero-radius blur is not a no-op. A filter establishes a filter
 * region clipped to the element's border box, so everything painted outside that box by
 * anything inside it is cut off: the emphasis underline's glow, a word's own text-shadow.
 * The artefact is a shadow that renders as a hard rectangle and then vanishes.
 *
 * An entrance that does blur still rests on `blur(0px)`, because `none` is not an
 * interpolable filter value and animating toward it would snap rather than ease.
 * @param hidden - the hidden state this word animates from
 * @returns The resting target, carrying `filter` only when it has something to reset
 * @pure true
 */
export function getEntranceRest(hidden: TargetAndTransition): TargetAndTransition {
  return hidden.filter === undefined
    ? ENTRANCE_REST
    : { ...ENTRANCE_REST, filter: entranceBlur(0) };
}

/**
 * Room for the word's own glow while its filter animates. Two transparent, unblurred
 * drop-shadows a 1.2em step out on each diagonal paint nothing but widen the filter
 * region, because WebKit (every iPhone browser) clips an element whose filter is
 * animating to its border box plus the filter's outsets. A word's text-shadow reaches
 * far past its box, so a blurred entrance showed it cut off as a hard, darker rectangle
 * until the word had landed. Padding the word instead would grow the text's scroll
 * size, which the fit pass reads, and shrink the page. The emphasis keyframes in
 * styles.css carry the same pair. `rgba(0, 0, 0, 0)` rather than `transparent`, so
 * framer-motion reads it as a colour while it interpolates the list.
 */
export const FILTER_BLEED =
  "drop-shadow(1.2em 1.2em 0 rgba(0, 0, 0, 0)) drop-shadow(-1.2em -1.2em 0 rgba(0, 0, 0, 0))";

/**
 * A blurred entrance's filter: the blur and the bleed, in one list shape at every radius
 * so the two ends of the animation interpolate.
 * @param px - blur radius in CSS px
 * @returns CSS filter list
 * @pure true
 */
export function entranceBlur(px: number): string {
  return `blur(${px}px) ${FILTER_BLEED}`;
}

/**
 * Compute entrancestyle.
 * @param seed - seed argument
 * @param rhythm? - rhythm? argument
 * @param entrance? - authored entrance; omitted, the personality is picked from the seed.
 *   A poetic rhythm keeps its own reveals either way.
 * @returns Computed value
 */
export function getEntranceStyle(
  seed: string,
  rhythm?: Rhythm,
  entrance?: Entrance,
): ResolvedEntranceStyle {
  if (rhythm === "poetic") {
    return POETIC_ENTRANCE_STYLES[
      getStableNumber(`poetic-entrance|${seed}`) % POETIC_ENTRANCE_STYLES.length
    ];
  }
  if (entrance) return AUTHORED_ENTRANCE_STYLES[entrance];
  return ENTRANCE_STYLES[getStableNumber(`entrance|${seed}`) % ENTRANCE_STYLES.length];
}

/**
 * Compute entrancehidden.
 * @param style - style argument
 * @param important - important argument
 * @param index - index argument
 * @returns Computed value
 */
export function getEntranceHidden(
  style: ResolvedEntranceStyle,
  important: boolean,
  index: number,
): TargetAndTransition {
  const dir = index % 2 === 0 ? -1 : 1;
  switch (style) {
    case "poetic-bloom":
      // A slow focus-and-breath reveal: no spring, no punch, just a soft bloom.
      return {
        opacity: 0,
        y: important ? 14 : 10,
        scale: important ? 1.12 : 1.06,
        filter: entranceBlur(18),
      };
    case "poetic-drift":
      // A barely-there lateral drift, like a line settling on paper.
      return {
        opacity: 0,
        x: dir * (important ? 16 : 10),
        y: important ? 12 : 8,
        scale: important ? 1.08 : 1.03,
        filter: entranceBlur(16),
      };
    // The five styles below are deliberately crisp: only the two poetic reveals and
    // `focus` animate blur. A per-word `filter: blur()` is the most expensive thing a
    // page of text can animate, and when every style uses it they all read as the same
    // soft fade — the transform is what gives each entrance its own character.
    case "fall":
      // Drop down from above and settle.
      return { opacity: 0, y: important ? -38 : -26, scale: important ? 0.72 : 0.9 };
    case "pop":
      // Punch up from tiny with a spring overshoot.
      return { opacity: 0, scale: important ? 0.24 : 0.42 };
    case "drift":
      // Fan in from alternating sides.
      return { opacity: 0, x: dir * (important ? 54 : 40), y: 6 };
    case "tilt":
      // Swing into place with a small rotation.
      return {
        opacity: 0,
        y: important ? 22 : 15,
        rotate: dir * 9,
        scale: important ? 0.74 : 0.9,
      };
    case "focus":
      // Cinematic rack-focus: bloom in from slightly oversized + heavy blur.
      return { opacity: 0, scale: important ? 1.5 : 1.2, filter: entranceBlur(16) };
    case "rise":
    default:
      // The original: float up from below.
      return { opacity: 0, y: important ? 34 : 22, scale: important ? 0.66 : 0.88 };
  }
}

/**
 * Compute entrancetransition.
 * @param style - style argument
 * @param delay - delay argument
 * @param duration - duration argument
 * @returns Computed value
 */
export function getEntranceTransition(
  style: ResolvedEntranceStyle,
  delay: number,
  duration: number,
  /**
   * Stretch on the spring styles, matching the factor the caller already applied to
   * `delay` and `duration`. Stiffness / s² and damping / s slow a spring by exactly s
   * while keeping its damping ratio, so it settles with the same overshoot.
   */
  timeScale = 1,
): Transition {
  const spring = (stiffness: number, damping: number, mass: number): Transition => ({
    delay,
    type: "spring",
    stiffness: stiffness / (timeScale * timeScale),
    damping: damping / timeScale,
    mass,
  });
  if (style === "poetic-bloom" || style === "poetic-drift") {
    return { delay, duration: duration * 1.55, ease: [0.16, 1, 0.3, 1] };
  }
  if (style === "pop") return spring(380, 17, 0.7);
  if (style === "tilt") return spring(300, 19, 0.8);
  // Rise and fall land on a lightly under-damped spring: now that they no longer
  // hide behind a blur, a small settle is what keeps them from stopping dead.
  if (style === "rise") return spring(260, 22, 0.9);
  if (style === "fall") return spring(320, 20, 0.9);
  // Slower, softer easing for the blur-heavy focus reveal so it breathes rather than snaps.
  const stretch = style === "focus" ? 1.12 : style === "drift" ? 1.05 : 1;
  return { delay, duration: duration * stretch, ease: [0.22, 1, 0.36, 1] };
}
