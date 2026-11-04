import { describe, expect, it } from "vitest";
import {
  solveMeasuredLines,
  type MeasuredLineBounds,
  type MeasuredSegment,
} from "../measured-lines";

const BOUNDS: MeasuredLineBounds = {
  lineWidthPx: 330,
  hardHeightPx: 600,
  budgetHeightPx: 420,
  budgetLineEm: 1.6,
  maxFontPx: 96,
  floorFontPx: 64,
  gapEm: 0.24,
  lineGapEm: 0.06,
};

function segments(...items: [string, number][]): MeasuredSegment[] {
  return items.map(([text, widthEm], index) => ({
    segment: { key: `${index}-${text}`, words: [{ text, index }] },
    widthEm,
    heightEm: 1.25,
  }));
}

const show = (solved: { lines: { segments: { words: { text: string }[] }[] }[] }) =>
  solved.lines
    .map((line) => line.segments.map((segment) => segment.words[0]!.text).join(" "))
    .join(" / ");

// Two wide words before a comma: the phrase rule will not break one word from the edge, so
// they share a line as wide as the box and the page is set at about half the size it
// could have. This is the half-size page between two full-size ones.
const CRAMPED = segments(["nguyên", 3], ["vẹn,", 3.5], ["ăn", 1.2], ["hết", 1.6]);
const EDGES = { phraseEdges: [2] };

describe("solveMeasuredLines relax threshold", () => {
  it("reports both sizes, and holds the rule when no threshold is given", () => {
    const solved = solveMeasuredLines(CRAMPED, BOUNDS, EDGES)!;
    expect(solved.relaxed).toBe(false);
    expect(solved.fontPx).toBe(solved.strictFontPx);
    expect(solved.strictFontPx / solved.relaxedFontPx).toBeLessThan(0.6);
    expect(show(solved)).toBe("nguyên vẹn, / ăn hết");
    expect(solved.bound).toBe("width");
  });

  it("loosens the rule when holding it would leave the page under the threshold", () => {
    const solved = solveMeasuredLines(CRAMPED, BOUNDS, { ...EDGES, relaxBelow: 0.7 })!;
    expect(solved.relaxed).toBe(true);
    expect(solved.fontPx).toBe(solved.relaxedFontPx);
    expect(show(solved)).toBe("nguyên / vẹn, / ăn hết");
  });

  it("keeps the rule when the page stays above the threshold's share of full size", () => {
    const solved = solveMeasuredLines(CRAMPED, BOUNDS, { ...EDGES, relaxBelow: 0.5 })!;
    expect(solved.relaxed).toBe(false);
    expect(show(solved)).toBe("nguyên vẹn, / ăn hết");
  });

  it("changes nothing on a page the rule does not shrink", () => {
    const easy = segments(["ăn", 1.2], ["hết,", 1.8], ["no", 1.1], ["rồi", 1.4]);
    const strict = solveMeasuredLines(easy, BOUNDS, { phraseEdges: [2] })!;
    const relaxed = solveMeasuredLines(easy, BOUNDS, { phraseEdges: [2], relaxBelow: 0.7 })!;
    expect(relaxed.relaxed).toBe(false);
    expect(show(relaxed)).toBe(show(strict));
    expect(relaxed.fontPx).toBe(strict.fontPx);
  });

  it("lets a loosened page take the band's height instead of the line budget", () => {
    const tall = segments(
      ["một", 1.6],
      ["hai", 1.5],
      ["ba", 1.1],
      ["bốn", 1.6],
      ["năm", 1.6],
      ["sáu", 1.5],
    );
    // A short line budget and a low floor: held to the budget, the page is crammed onto
    // few long lines and set small.
    const tight = { ...BOUNDS, budgetHeightPx: 200, floorFontPx: 40 };
    const strict = solveMeasuredLines(tall, tight)!;
    const solved = solveMeasuredLines(tall, tight, { relaxBelow: 1 })!;
    expect(solved.relaxed).toBe(true);
    expect(solved.fontPx).toBeGreaterThan(strict.fontPx * 1.3);
    expect(solved.lines.length).toBeGreaterThan(strict.lines.length);
  });

  it("loosens the lone-word rule too: a short word may stand alone if the page grows", () => {
    // One wide highlighted word between two short ones. Strictly, either short word alone
    // on a line costs a third of the size, so all three are crammed onto one long line.
    const page = segments(["Có", 1.1], ["cao nhân", 5], ["chỉ?", 1.6]);
    const strict = solveMeasuredLines(page, BOUNDS)!;
    expect(strict.lines).toHaveLength(1);
    const solved = solveMeasuredLines(page, BOUNDS, { relaxBelow: 0.65 })!;
    expect(solved.relaxed).toBe(true);
    expect(solved.lines.length).toBeGreaterThan(1);
    expect(solved.fontPx).toBeGreaterThan(strict.fontPx * 1.05);
  });

  it("flags a page held small by one unbreakable word, which no rule can help", () => {
    const page = segments(["Em", 1.1], ["đi", 0.9], ["đường vòng?", 7.6]);
    const solved = solveMeasuredLines(page, BOUNDS, { relaxBelow: 0.65 })!;
    expect(solved.widestUnbreakable).toBe(true);
    expect(solved.relaxed).toBe(false);
  });

  it("never sets a Vietnamese line over the syllable cap, in either pass", () => {
    // Eight one-syllable words that would happily share two long lines.
    const page = segments(
      ["Mình", 1.6],
      ["đi", 0.8],
      ["chợ", 1.1],
      ["mua", 1.3],
      ["rau", 1.2],
      ["về", 0.9],
      ["nấu", 1.3],
      ["canh", 1.5],
    );
    for (const relaxBelow of [0, 1]) {
      const solved = solveMeasuredLines(page, BOUNDS, { relaxBelow, maxLineSyllables: 4 })!;
      for (const line of solved.lines) {
        const syllables = line.segments.reduce((total, seg) => total + seg.words.length, 0);
        expect(syllables).toBeLessThanOrEqual(4);
      }
    }
  });

  it("lets one bonded segment longer than the cap stand whole on its own line", () => {
    let index = 0;
    const words = (text: string) => text.split(" ").map((word) => ({ text: word, index: index++ }));
    const long = words("không thể nào tin nổi");
    const page: MeasuredSegment[] = [
      { segment: { key: "a", words: words("Ôi") }, widthEm: 1, heightEm: 1.25 },
      { segment: { key: "b", words: long }, widthEm: 7, heightEm: 1.25 },
    ];
    const solved = solveMeasuredLines(page, BOUNDS, { maxLineSyllables: 4 })!;
    expect(solved.lines.map((line) => line.segments.map((seg) => seg.key))).toEqual([["a"], ["b"]]);
  });

  it("does not count a mark standing alone as a syllable", () => {
    const page = segments(["Mưa", 1.4], ["—", 0.6], ["gió", 1.2], ["về", 0.9], ["rồi", 1.2]);
    const solved = solveMeasuredLines(page, BOUNDS, { maxLineSyllables: 4 })!;
    expect(solved).not.toBeNull();
    for (const line of solved.lines) {
      const syllables = line.segments.filter((seg) => seg.words[0]!.text !== "—").length;
      expect(syllables).toBeLessThanOrEqual(4);
    }
  });
});
