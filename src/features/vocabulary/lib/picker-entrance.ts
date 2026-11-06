/**
 * The level picker's entrance: it builds up a piece at a time instead of appearing whole.
 *
 * After the first-visit demo (lib/first-visit) the word that just finished recedes under a
 * blur while the picker comes in over it: backdrop, then the heading line by line, the rail
 * drawing itself, the rungs top to bottom, the knob dropping onto the first rung, and the
 * buttons last. A picker opened cold (no demo behind it) plays the same build-up shorter,
 * with nothing to recede. Under reduced motion it is a single short fade.
 *
 * Every time here is set on the picker as a CSS custom property (.vocab-onboard
 * [data-entrance] in vocabulary.css), so the stylesheet and the component's own timers
 * (knob landed, controls unlocked, feed taken off underneath) read the same numbers.
 *
 * Exports: HANDOVER_CHROME_MS, HANDOVER_RECEDE_MS, PickerEntrance, pickerEntrance
 * Depends on: nothing
 */

/** How long the feed's toolbar and dock take to fade once the demo word has ended. */
export const HANDOVER_CHROME_MS = 200;
/** How long the finished demo card takes to shrink, blur and dim under the picker. */
export const HANDOVER_RECEDE_MS = 450;

/** Starts and durations of each piece, in ms from the moment the demo word ended. */
const AFTER_DEMO = {
  backdrop: 350,
  backdropDur: 450,
  head: 450,
  headStep: 100,
  headDur: 420,
  rail: 750,
  railDur: 500,
  rungs: 800,
  rungStep: 45,
  rungDur: 360,
  knob: 1250,
  knobDur: 380,
  foot: 1400,
  footDur: 380,
} as const;

type Timeline = { -readonly [K in keyof typeof AFTER_DEMO]: number };

/**
 * A cold picker has nothing to recede, so it starts where the backdrop would have and runs
 * at this share of the time.
 */
const COLD_SCALE = 0.6;

/** Under reduced motion the whole picker fades in at once over this long. */
const REDUCED_FADE_MS = 250;

export type PickerEntrance = {
  /** Which build-up plays; set as the picker's data-entrance while it runs. */
  kind: "demo" | "cold";
  /** When the picker fully covers the screen, so the feed underneath can be taken off. */
  coverMs: number;
  /** When the knob has landed on its rung, so that rung may light up. */
  knobMs: number;
  /** When the last piece has landed and the picker takes input. */
  readyMs: number;
  /** The timeline as CSS custom properties for the picker's style. */
  vars: Record<string, string>;
};

/**
 * The picker's entrance timeline.
 * @param afterDemo The picker follows the first-visit demo (the long build-up over the
 *   receding word); otherwise it opens cold. @param reducedMotion One short fade, no stagger.
 * @returns Timers and CSS custom properties, in ms.
 * @pure true
 */
export function pickerEntrance(afterDemo: boolean, reducedMotion: boolean): PickerEntrance {
  const kind = afterDemo ? "demo" : "cold";
  let t: Timeline = { ...AFTER_DEMO };
  if (reducedMotion) {
    t = Object.fromEntries(Object.keys(AFTER_DEMO).map((key) => [key, 0])) as Timeline;
    t.backdropDur = REDUCED_FADE_MS;
  } else if (!afterDemo) {
    const start = AFTER_DEMO.backdrop;
    const at = (ms: number) => Math.round(Math.max(0, ms - start) * COLD_SCALE);
    const span = (ms: number) => Math.round(ms * COLD_SCALE);
    t = {
      backdrop: at(t.backdrop),
      backdropDur: span(t.backdropDur),
      head: at(t.head),
      headStep: span(t.headStep),
      headDur: span(t.headDur),
      rail: at(t.rail),
      railDur: span(t.railDur),
      rungs: at(t.rungs),
      rungStep: span(t.rungStep),
      rungDur: span(t.rungDur),
      knob: at(t.knob),
      knobDur: span(t.knobDur),
      foot: at(t.foot),
      footDur: span(t.footDur),
    };
  }
  const vars: Record<string, string> = {
    "--enter-backdrop": `${t.backdrop}ms`,
    "--enter-backdrop-dur": `${t.backdropDur}ms`,
    "--enter-head": `${t.head}ms`,
    "--enter-head-step": `${t.headStep}ms`,
    "--enter-head-dur": `${t.headDur}ms`,
    "--enter-rail": `${t.rail}ms`,
    "--enter-rail-dur": `${t.railDur}ms`,
    "--enter-rungs": `${t.rungs}ms`,
    "--enter-rung-step": `${t.rungStep}ms`,
    "--enter-rung-dur": `${t.rungDur}ms`,
    "--enter-knob": `${t.knob}ms`,
    "--enter-knob-dur": `${t.knobDur}ms`,
    "--enter-foot": `${t.foot}ms`,
    "--enter-foot-dur": `${t.footDur}ms`,
  };
  return {
    kind,
    coverMs: t.backdrop + t.backdropDur,
    knobMs: t.knob + t.knobDur,
    readyMs: Math.max(t.backdrop + t.backdropDur, t.foot + t.footDur),
    vars,
  };
}
