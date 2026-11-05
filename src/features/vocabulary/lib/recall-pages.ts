/**
 * The memory sheet's pages: its word list cut to the height the sheet can show at once.
 *
 * Rows are packed in order from measured heights, never a fixed count, so a page holds
 * exactly what fits and a word that wraps takes its real room. A week list keeps its day
 * headings: a day that runs over a page boundary repeats its heading on the next page, so
 * no page starts with words of an unnamed day, and a heading never ends a page alone. A
 * row taller than a whole page still gets a page of its own rather than being lost.
 *
 * Exports: RecallSlice, RecallPage, packRecallPages, springEasing
 * Depends on: nothing (pure)
 */

/** One day's run of rows on one page: rows `from` to `to` (exclusive) of group `group`. */
export type RecallSlice = { group: number; from: number; to: number };
export type RecallPage = RecallSlice[];

/**
 * Pack rows into pages that each fit `capacity` pixels.
 * @param groups - Each group's heading height (0 for none) and its rows' heights, in order
 * @param capacity - The height one page can show
 * @returns At least one page; a page is the slices of groups it shows
 * @pure true
 */
export function packRecallPages(
  groups: { head: number; rows: number[] }[],
  capacity: number,
): RecallPage[] {
  const pages: RecallPage[] = [];
  let page: RecallPage = [];
  let used = 0;
  groups.forEach(({ head, rows }, group) => {
    let slice: RecallSlice | null = null;
    rows.forEach((height, index) => {
      // A slice that opens on this page brings its heading along.
      const cost = height + (slice ? 0 : head);
      if (page.length > 0 && used + cost > capacity) {
        pages.push(page);
        page = [];
        used = 0;
        slice = null;
      }
      if (!slice) {
        slice = { group, from: index, to: index };
        page.push(slice);
        used += head;
      }
      slice.to = index + 1;
      used += height;
    });
  });
  if (page.length > 0 || pages.length === 0) pages.push(page);
  return pages;
}

/**
 * A spring as a CSS `linear()` easing: quick off the mark, a small overshoot, a long
 * settle. Sampled from an underdamped spring that comes to rest by the end of the time.
 * @param damping - Damping ratio, below 1 for an overshoot
 * @param samples - Points in the curve
 * @returns A `linear(...)` easing string
 * @pure true
 */
export function springEasing(damping = 0.74, samples = 48): string {
  // Settled to about 0.2% by t = 1.
  const omega = 6.2 / damping;
  const damped = omega * Math.sqrt(1 - damping * damping);
  const points: string[] = [];
  for (let step = 0; step <= samples; step += 1) {
    const t = step / samples;
    const value =
      step === samples
        ? 1
        : 1 -
          Math.exp(-damping * omega * t) *
            (Math.cos(damped * t) + ((damping * omega) / damped) * Math.sin(damped * t));
    points.push(String(Math.round(value * 10000) / 10000));
  }
  return `linear(${points.join(", ")})`;
}
