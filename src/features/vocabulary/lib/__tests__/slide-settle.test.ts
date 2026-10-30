import { describe, expect, it } from "vitest";
import { findFitProblems, getSlideFontRequests, type FitInput } from "../slide-settle";

const safe = { top: 0.1, right: 0.1, bottom: 0.1, left: 0.1 };
const base: FitInput = { width: 400, height: 500, safe, words: [], panel: null };
const box = { left: 100, top: 100, right: 300, bottom: 200 };

describe("findFitProblems", () => {
  it("passes a slide inside its margins", () => {
    expect(findFitProblems({ ...base, words: [box] })).toEqual([]);
  });
  it("forgives a rounding error at the margin", () => {
    expect(findFitProblems({ ...base, words: [{ ...box, right: 360.4 }] })).toEqual([]);
  });
  it("names a side overrun", () => {
    expect(findFitProblems({ ...base, words: [{ ...box, right: 361 }] })).toEqual([
      "Text runs into the side margin",
    ]);
    expect(findFitProblems({ ...base, words: [{ ...box, left: 39 }] })).toEqual([
      "Text runs into the side margin",
    ]);
  });
  it("names a top or bottom overrun", () => {
    expect(findFitProblems({ ...base, words: [{ ...box, bottom: 451 }] })).toEqual([
      "Text runs into the top or bottom margin",
    ]);
  });
  it("says how much of the panel is cut off", () => {
    const panel = { scrollHeight: 108, clientHeight: 92 };
    expect(findFitProblems({ ...base, panel })).toEqual(["Panel is cut off by 16 px"]);
  });
  it("accepts a panel that fits exactly", () => {
    const panel = { scrollHeight: 92, clientHeight: 92 };
    expect(findFitProblems({ ...base, panel })).toEqual([]);
  });
  it("reports every problem at once", () => {
    const panel = { scrollHeight: 100, clientHeight: 90 };
    const words = [{ left: 0, top: 0, right: 400, bottom: 500 }];
    expect(findFitProblems({ ...base, words, panel })).toHaveLength(3);
  });
});

describe("getSlideFontRequests", () => {
  it("asks for the display face at both stage weights and Inter for the panel", () => {
    const requests = getSlideFontRequests("Playfair Display", ["Trước"]);
    const of = (family: string) => requests.filter((r) => r.family === family);
    expect(of("Playfair Display").map((r) => r.weight)).toEqual([800, 900]);
    expect(of("Inter").map((r) => r.weight)).toContain(650);
  });
  it("names every character, so the Vietnamese subset is fetched", () => {
    const [first] = getSlideFontRequests("Inter", ["ờ ể", "ự"]);
    for (const glyph of "ờểự") expect(first!.text).toContain(glyph);
  });
  it("sends each character once", () => {
    const [first] = getSlideFontRequests("Inter", ["aaaa", "aa"]);
    expect(first!.text).toBe("a ");
  });
});
