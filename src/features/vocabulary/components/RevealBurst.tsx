/**
 * One-shot celebration behind the revealed word, drawn on a canvas under the text.
 *
 * The design is a row of parameters (lib/burst-variants) and the drawing is a pure
 * function of time (lib/burst-engine), so this component only owns the canvas and the
 * clock. The clock advances only while the card plays: an overlay or a pause freezes the
 * burst where it is and it carries on from there, like the word entrances do. (It is not a
 * framer-motion entrance, so usePausableEntrance does not apply; `paused` is the same
 * signal.) A lab can hand over its own clock through `time` to scrub and slow it down.
 *
 * It reads the card's own palette (--vocab-accent / --vocab-accent-alt) and tone
 * (`data-tone` on the nearest card) once at mount, measures the word it surrounds so the
 * particles are born on its outline and never cross it, and frees its canvas as soon as
 * the last particle has faded. Under reduced motion it plays the calm alternative: light
 * that comes up behind the word and sparkles that fade in place, with nothing moving.
 *
 * Exports: RevealBurst
 * Depends on: ../lib/burst-variants, ../lib/burst-engine (CSS in ../vocabulary.css)
 */

import { useEffect, useLayoutEffect, useRef } from "react";
import { BURST_CONFIG, DEFAULT_BURST_VARIANT, type BurstVariant } from "../lib/burst-variants";
import {
  buildScene,
  buildSprites,
  drawBurst,
  parseColor,
  resolvePalette,
  wordGeometry,
  type Rgb,
} from "../lib/burst-engine";

/** What the burst surrounds: the lab marks its word; the feed's reveal page has its own. */
const WORD_SELECTOR = "[data-burst-word], .vocab-stage-band[data-reveal] [data-kinetic-word]";
/** The meaning panel under the word, which the burst keeps clear of. */
const FLOOR_SELECTOR = "[data-burst-floor], .vocab-reveal-details";
/** The word and panel are measured while their entrances play (the panel lands late). */
const MEASURE_FOR_S = 1.1;
/** Backing-store budget: crisp at the device's ratio, but never a giant bitmap. */
const MAX_BACKING_PIXELS = 4.2e6;
const FALLBACK_ACCENT: Rgb = { r: 255, g: 210, b: 61 };
const FALLBACK_ALT: Rgb = { r: 255, g: 93, b: 143 };

function hashSeed(variant: string, seed: number | string): number {
  const text = `${variant}:${seed}`;
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Throw one design's burst, centred on the answer.
 * @param variant Which design; the feed throws the default
 * @param originY Where the word sits, % of the card's height (the stage's revealY)
 * @param paused Freeze the burst where it is (the card is paused or covered)
 * @param delay Seconds of the card's play before the burst starts (the word's own lead-in)
 * @param reducedMotion Play the calm, motionless alternative instead
 * @param seed Varies the throw between words; the same seed is the same picture
 * @param time A lab clock in seconds since the reveal (negative before it); when given,
 *   the burst follows it exactly and stays mounted for scrubbing
 * @returns A decorative canvas; it plays once on mount
 */
export function RevealBurst({
  variant = DEFAULT_BURST_VARIANT,
  originY = 34,
  paused = false,
  delay = 0,
  reducedMotion = false,
  seed = 0,
  time,
}: {
  variant?: BurstVariant;
  originY?: number;
  paused?: boolean;
  delay?: number;
  reducedMotion?: boolean;
  seed?: number | string;
  time?: () => number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pausedRef = useRef(paused);
  const timeRef = useRef(time);
  useLayoutEffect(() => {
    pausedRef.current = paused;
    timeRef.current = time;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const scene = buildScene(BURST_CONFIG[variant], hashSeed(variant, seed), reducedMotion);

    // The card's colours, normalised through the canvas so any CSS colour parses.
    const style = getComputedStyle(canvas);
    const normalise = (value: string) => {
      ctx.fillStyle = "#000";
      ctx.fillStyle = value;
      return String(ctx.fillStyle);
    };
    const accent =
      parseColor(style.getPropertyValue("--vocab-accent"), normalise) ?? FALLBACK_ACCENT;
    const alt = parseColor(style.getPropertyValue("--vocab-accent-alt"), normalise) ?? FALLBACK_ALT;
    const tone =
      canvas.closest("[data-tone]")?.getAttribute("data-tone") === "light" ? "light" : "dark";
    const palette = resolvePalette(tone, accent, alt);
    const sprites = buildSprites(scene, palette, (w, h) => {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      return c;
    });

    let width = 0;
    let height = 0;
    let dpr = 1;
    // The word's box: its size is the largest seen while it enters (an entrance scales up
    // to it), its centre the latest (an entrance may slide in). Until measured, the card's
    // reveal line at `originY` stands in.
    let box: { hw: number; hh: number; cx: number; cy: number; floor?: number } | undefined;
    let floor: number | undefined;
    const measure = () => {
      const frame = canvas.getBoundingClientRect();
      // The panel rises into place, so its highest top is where it lands.
      const panel = canvas.parentElement?.querySelector(FLOOR_SELECTOR)?.getBoundingClientRect();
      if (panel?.height) floor = Math.min(floor ?? Infinity, panel.top - frame.top);
      if (box) box.floor = floor;
      const words = canvas.parentElement?.querySelectorAll(WORD_SELECTOR);
      if (!words?.length) return;
      let left = Infinity;
      let right = -Infinity;
      let top = Infinity;
      let bottom = -Infinity;
      for (const el of words) {
        const r = el.getBoundingClientRect();
        if (!r.width) continue;
        left = Math.min(left, r.left);
        right = Math.max(right, r.right);
        top = Math.min(top, r.top);
        bottom = Math.max(bottom, r.bottom);
      }
      if (right <= left) return;
      const hw = Math.min((right - left) / 2, width * 0.48);
      const hh = Math.min((bottom - top) / 2, height * 0.2);
      box = {
        hw: Math.max(box?.hw ?? 0, hw),
        hh: Math.max(box?.hh ?? 0, hh),
        cx: (left + right) / 2 - frame.left,
        cy: (top + bottom) / 2 - frame.top,
        floor,
      };
    };

    const resize = () => {
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      const device = Math.min(window.devicePixelRatio || 1, 3);
      dpr = Math.min(device, Math.sqrt(MAX_BACKING_PIXELS / Math.max(1, width * height)));
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      // A new size is a new layout (a rotation, a resized window): what was measured
      // against the old one no longer holds, so measure afresh.
      box = undefined;
      floor = undefined;
      measure();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    let played = 0;
    let last = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const external = timeRef.current;
      if (!external && !pausedRef.current) played += dt;
      const t = external ? external() : played - delay;
      if (t >= 0 && t < MEASURE_FOR_S) measure();
      drawBurst(ctx, scene, t, wordGeometry(width, height, originY, box), palette, sprites, dpr);
      if (!external && t > scene.duration) {
        // Done: release the bitmap rather than keep a full-card canvas alive.
        canvas.width = 0;
        canvas.height = 0;
        observer.disconnect();
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [variant, seed, reducedMotion, originY, delay]);

  return <canvas ref={canvasRef} className="vocab-reveal-burst" aria-hidden="true" />;
}
