/**
 * Resolved and sliding post canvas backgrounds for page transitions.
 *
 * Exports: getResolvedPostBackground, getSlidingCanvasBackground, buildStripWindow,
 *   isBackdropJump, DEFAULT_CANVAS_BACKGROUND
 * Depends on: lib/canvas resolve/isUsable/isTooDark, Post type
 */

import {
  SAFE_CANVAS_BACKGROUND,
  isTooDarkCanvasBackground,
  isUsableCanvasBackground,
  resolveCanvasBackground,
  type CanvasSpec,
} from "@/features/canvas";
import type { Post } from "../types";

export const DEFAULT_CANVAS_BACKGROUND = SAFE_CANVAS_BACKGROUND;

/**
 * Compute gradienttransitionpath.
 * @param spec - spec argument
 * @returns Computed value
 */
export function getGradientTransitionPath(spec: CanvasSpec): string[] {
  if (spec.backgroundStyle !== "transition") return [];
  return (spec.gradientPath ?? [])
    .map((gradient) => gradient.trim())
    .filter((gradient) => isUsableCanvasBackground(gradient));
}

/**
 * Compute resolvedpostbackground.
 * @param post - post argument
 * @returns Computed value
 */
export function getResolvedPostBackground(post: Post): string | null {
  return resolveCanvasBackground(post.bg_gradient, post.id);
}

/**
 * Build the wide gradient strip a transition backdrop slides along, one screen per
 * color step.
 * @param spec - canvas spec carrying the transition path
 * @param fallback - backdrop used when the spec has no usable path
 * @param shiftPage - how many screens the strip has travelled
 * @param blend - optional intermediate colors between two neighbouring steps. Without
 *   it each step is a plain sRGB ramp; a caller that wants a perceptual blend (the
 *   vocabulary card) passes one and the extra stops are laid out inside each step, so
 *   a step is still exactly one screen wide.
 * @returns Strip background, width, offset, and the offset one page moves it (in % of
 *   the strip), plus `window`, which paints only a few segments of it; or null when there
 *   is nothing to slide
 */
export function getSlidingCanvasBackground(
  spec: CanvasSpec,
  fallback: string | null,
  shiftPage: number,
  blend?: (from: string, to: string) => string[],
): {
  background: string;
  width: string;
  x: string;
  pageShift: number;
  window: (first: number, count: number) => string;
} | null {
  const colors = getTransitionColorCycle(spec, fallback);
  if (colors.length < 2) return null;

  const segmentCount = Math.max(64, colors.length * 12);
  const pageShift = 100 / segmentCount;
  return {
    background: buildStrip(colors, segmentCount, blend),
    width: `${segmentCount * 100}%`,
    x: `-${shiftPage * pageShift}%`,
    pageShift,
    window: (first, count) => buildStripWindow(colors, first, count, blend),
  };
}

/**
 * A few segments of the strip, as their own gradient: segment k runs from colour k to
 * colour k + 1 of the cycle, exactly as in the whole strip, so a window lines up with its
 * neighbours. The backdrop paints only this, never the whole strip: a page turn then holds
 * the two colour bands it moves between and nothing else, so no glitch — a glide cut short,
 * a strip painted late after a long session — can show any other background.
 * @param colors - the colour cycle
 * @param first - the first segment (any integer; the cycle wraps both ways)
 * @param count - how many segments, at least 1
 * @param blend - the same perceptual in-between colours the full strip uses
 * @returns a linear-gradient as wide as `count` segments
 * @pure true (cached)
 */
export function buildStripWindow(
  colors: string[],
  first: number,
  count: number,
  blend?: (from: string, to: string) => string[],
): string {
  const size = Math.max(1, Math.floor(count));
  const at = (index: number) => colors[((index % colors.length) + colors.length) % colors.length]!;
  const key = `window|${blend ? "blend" : "plain"}|${first}|${size}|${colors.join("|")}`;
  const cached = stripCache.get(key);
  if (cached) return cached;

  const stops: string[] = [];
  for (let step = 0; step <= size; step += 1) {
    const color = at(first + step);
    stops.push(`${color} ${((step / size) * 100).toFixed(3)}%`);
    if (!blend || step === size) continue;
    const between = blend(color, at(first + step + 1));
    between.forEach((mid, index) => {
      const position = (step + (index + 1) / (between.length + 1)) / size;
      stops.push(`${mid} ${(position * 100).toFixed(4)}%`);
    });
  }
  const strip = `linear-gradient(100deg, ${stops.join(", ")})`;
  if (stripCache.size > 256) stripCache.clear();
  stripCache.set(key, strip);
  return strip;
}

/**
 * Whether a backdrop page change is too far to glide. Every page owns its own colour
 * band laid side by side, so gliding from page 0 to the reveal (or from the coda back
 * to page 0 on a replay) has to pass every band in between, and reads as a burst of
 * four or five other backgrounds. Those changes cut and crossfade instead.
 * @param from - page the backdrop is showing
 * @param to - page it is moving to
 * @returns True when the change must not glide
 * @pure true
 */
export function isBackdropJump(from: number, to: number): boolean {
  return Math.abs(to - from) > 1;
}

// The strip only depends on its color cycle, but a card asks for it on every render.
// A few hundred stops are cheap to build once and wasteful to rebuild per frame.
const stripCache = new Map<string, string>();

function buildStrip(
  colors: string[],
  segmentCount: number,
  blend?: (from: string, to: string) => string[],
): string {
  const key = `${blend ? "blend" : "plain"}|${segmentCount}|${colors.join("|")}`;
  const cached = stripCache.get(key);
  if (cached) return cached;

  const stops: string[] = [];
  for (let index = 0; index <= segmentCount; index += 1) {
    const color = colors[index % colors.length]!;
    stops.push(`${color} ${((index / segmentCount) * 100).toFixed(3)}%`);
    if (!blend || index === segmentCount) continue;
    const between = blend(color, colors[(index + 1) % colors.length]!);
    between.forEach((mid, step) => {
      const position = (index + (step + 1) / (between.length + 1)) / segmentCount;
      stops.push(`${mid} ${(position * 100).toFixed(4)}%`);
    });
  }
  const strip = `linear-gradient(100deg, ${stops.join(", ")})`;
  if (stripCache.size > 64) stripCache.clear();
  stripCache.set(key, strip);
  return strip;
}

/**
 * Compute transitioncolorcycle.
 * @param spec - spec argument
 * @param fallback - fallback argument
 * @returns Computed value
 */
export function getTransitionColorCycle(spec: CanvasSpec, fallback: string | null): string[] {
  const gradients = getGradientTransitionPath(spec);
  const colors = gradients.reduce<string[]>((items, gradient, index) => {
    const stops = extractGradientColors(gradient).filter(
      (color) => !isTooDarkCanvasBackground(color),
    );
    if (stops.length < 2) return items;
    if (index === 0) items.push(stops[0]);
    items.push(stops[stops.length - 1]);
    return items;
  }, []);

  const fallbackStops = fallback
    ? extractGradientColors(fallback).filter((color) => !isTooDarkCanvasBackground(color))
    : [];
  const defaultStops = extractGradientColors(DEFAULT_CANVAS_BACKGROUND);
  const cycle =
    colors.length >= 2 ? colors : fallbackStops.length >= 2 ? fallbackStops : defaultStops;
  if (cycle.length < 2) return [];
  return cycle[0] === cycle[cycle.length - 1] ? cycle.slice(0, -1) : cycle;
}

/**
 * extractGradientColors helper
 * @param value - value argument
 * @returns Computed value
 */
export function extractGradientColors(value: string): string[] {
  return (
    value.match(
      /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|oklch\([^)]*\)|color\([^)]*\)/g,
    ) ?? []
  );
}
