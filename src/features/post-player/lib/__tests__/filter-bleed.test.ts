import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FILTER_BLEED,
  getEntranceHidden,
  getEntranceRest,
  type ResolvedEntranceStyle,
} from "../entrances";

// WebKit clips an element whose filter animates to its box plus the filter's outsets, so
// a word's glow and text-shadow were cut off as a hard rectangle. Every animated filter on
// a word ends in FILTER_BLEED, which widens that region without touching layout.

const STYLES: ResolvedEntranceStyle[] = [
  "poetic-bloom",
  "poetic-drift",
  "fall",
  "pop",
  "drift",
  "tilt",
  "focus",
  "rise",
];

describe("filter bleed", () => {
  it("rides on both ends of every blurred entrance", () => {
    let blurred = 0;
    for (const style of STYLES) {
      for (const important of [false, true]) {
        const hidden = getEntranceHidden(style, important, 0);
        const rest = getEntranceRest(hidden);
        if (hidden.filter === undefined) {
          expect(rest.filter).toBeUndefined();
          continue;
        }
        blurred += 1;
        expect(String(hidden.filter).endsWith(FILTER_BLEED)).toBe(true);
        expect(rest.filter).toBe(`blur(0px) ${FILTER_BLEED}`);
      }
    }
    expect(blurred).toBeGreaterThan(0);
  });

  it("rides on every keyframe of the emphasis animations that move a filter", () => {
    const css = readFileSync(resolve(__dirname, "../../../../styles.css"), "utf8");
    const normalise = (text: string) => text.replace(/\s+/g, " ");
    const bleed = normalise(FILTER_BLEED);
    for (const name of [
      "kinetic-emphasis-fringe",
      "kinetic-emphasis-flash",
      "kinetic-emphasis-pulse",
    ]) {
      const start = css.indexOf(`@keyframes ${name} {`);
      expect(start, name).toBeGreaterThanOrEqual(0);
      const body = css.slice(start, css.indexOf("\n}\n", start));
      const filters = [...body.matchAll(/filter:([^;]*);/g)].map((m) => normalise(m[1]!));
      expect(filters.length, name).toBeGreaterThan(1);
      for (const filter of filters) expect(filter.trim().endsWith(bleed), name).toBe(true);
    }
  });
});
