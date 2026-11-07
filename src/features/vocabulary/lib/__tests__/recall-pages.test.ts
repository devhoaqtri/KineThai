import { describe, expect, it } from "vitest";
import { packRecallPages, springEasing } from "../recall-pages";

const rows = (count: number, height = 70) => Array.from({ length: count }, () => height);

describe("packRecallPages", () => {
  it("keeps a list that fits on one page", () => {
    expect(packRecallPages([{ head: 0, rows: rows(4) }], 300)).toEqual([
      [{ group: 0, from: 0, to: 4 }],
    ]);
  });

  it("fills each page with as many rows as its height holds", () => {
    const pages = packRecallPages([{ head: 0, rows: rows(10) }], 290);
    expect(pages.map((page) => page[0]!.to - page[0]!.from)).toEqual([4, 4, 2]);
  });

  it("packs by measured height, not by count", () => {
    const pages = packRecallPages([{ head: 0, rows: [70, 140, 70, 70] }], 290);
    expect(pages).toEqual([[{ group: 0, from: 0, to: 3 }], [{ group: 0, from: 3, to: 4 }]]);
  });

  it("repeats a day's heading on the page its rows continue onto", () => {
    const pages = packRecallPages(
      [
        { head: 40, rows: rows(3) },
        { head: 40, rows: rows(3) },
      ],
      300,
    );
    // 40 + 3×70 = 250; the next day needs 40 + 70 more, so it starts a page.
    expect(pages).toEqual([[{ group: 0, from: 0, to: 3 }], [{ group: 1, from: 0, to: 3 }]]);
    const split = packRecallPages([{ head: 40, rows: rows(6) }], 300);
    expect(split).toEqual([[{ group: 0, from: 0, to: 3 }], [{ group: 0, from: 3, to: 6 }]]);
  });

  it("never ends a page on a heading alone", () => {
    const pages = packRecallPages(
      [
        { head: 40, rows: rows(3) },
        { head: 40, rows: rows(1) },
      ],
      280,
    );
    expect(pages[0]).toEqual([{ group: 0, from: 0, to: 3 }]);
    expect(pages[1]).toEqual([{ group: 1, from: 0, to: 1 }]);
  });

  it("gives a row taller than a page a page of its own", () => {
    expect(packRecallPages([{ head: 0, rows: [70, 500, 70] }], 300)).toEqual([
      [{ group: 0, from: 0, to: 1 }],
      [{ group: 0, from: 1, to: 2 }],
      [{ group: 0, from: 2, to: 3 }],
    ]);
  });

  it("returns one empty page for an empty list", () => {
    expect(packRecallPages([], 300)).toEqual([[]]);
  });
});

describe("springEasing", () => {
  it("starts at 0, ends at 1 and overshoots on the way", () => {
    const points = springEasing()
      .replace(/^linear\(|\)$/g, "")
      .split(", ")
      .map(Number);
    expect(points[0]).toBe(0);
    expect(points.at(-1)).toBe(1);
    expect(Math.max(...points)).toBeGreaterThan(1);
    expect(Math.max(...points)).toBeLessThan(1.08);
  });
});
