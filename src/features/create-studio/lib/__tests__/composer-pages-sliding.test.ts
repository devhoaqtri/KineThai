import { describe, expect, it } from "vitest";
import {
  MAX_STATUS_CHARS,
  getComposerPages,
  joinComposerPages,
  limitComposerPages,
} from "../composer-pages";
import {
  extractGradientColors,
  getComposerSlidingBackground,
  getComposerTransitionColors,
} from "../sliding-background";

describe("getComposerPages", () => {
  it("returns one empty page for empty text", () => expect(getComposerPages("")).toEqual([""]));
  it("splits on newlines", () => expect(getComposerPages("a\nb\nc")).toEqual(["a", "b", "c"]));
  it("normalises CRLF", () => expect(getComposerPages("a\r\nb")).toEqual(["a", "b"]));
  it("normalises a lone CR", () => expect(getComposerPages("a\rb")).toEqual(["a", "b"]));
  it("keeps blank pages in place", () => expect(getComposerPages("a\n\nb")).toEqual(["a", "", "b"]));
});

describe("limitComposerPages", () => {
  it("returns a single empty page for an empty array", () => expect(limitComposerPages([])).toEqual([""]));
  it("leaves short pages untouched", () => expect(limitComposerPages(["a", "b"])).toEqual(["a", "b"]));
  it("enforces the character budget on the joined result", () => {
    const pages = ["x".repeat(150), "y".repeat(150)];
    const limited = limitComposerPages(pages);
    expect(limited.join("\n").length).toBeLessThanOrEqual(MAX_STATUS_CHARS);
  });
  it("clips an oversized single page", () => {
    const limited = limitComposerPages(["z".repeat(400)]);
    expect(limited[0]).toHaveLength(MAX_STATUS_CHARS);
  });
  it("drops trailing pages once the budget is spent", () => {
    const pages = ["a".repeat(MAX_STATUS_CHARS), "b", "c"];
    expect(limitComposerPages(pages)).toHaveLength(1);
  });
});

describe("joinComposerPages", () => {
  it("joins kept pages with newlines", () => expect(joinComposerPages(["a", "b"])).toBe("a\nb"));
  it("stays within the budget", () => {
    const result = joinComposerPages(["w".repeat(200), "w".repeat(200)]);
    expect(result.length).toBeLessThanOrEqual(MAX_STATUS_CHARS);
  });
});

describe("extractGradientColors", () => {
  it("pulls hex stops out of a gradient", () =>
    expect(extractGradientColors("linear-gradient(135deg,#ff0000,#00ff00)")).toEqual([
      "#ff0000",
      "#00ff00",
    ]));
  it("captures rgb and hsl tokens", () =>
    expect(extractGradientColors("linear-gradient(rgba(1,2,3,0.5), hsl(10,20%,30%))")).toHaveLength(2));
  it("returns nothing when there are no colors", () =>
    expect(extractGradientColors("to right")).toEqual([]));
});

describe("getComposerTransitionColors", () => {
  it("returns nothing for a single gradient with one stop", () =>
    expect(getComposerTransitionColors(["#ff0000"])).toEqual([]));
  it("chains overlapping gradients into an ordered strip", () => {
    const colors = getComposerTransitionColors([
      "linear-gradient(#aaaaaa,#bbbbbb)",
      "linear-gradient(#bbbbbb,#cccccc)",
    ]);
    expect(colors).toEqual(["#aaaaaa", "#bbbbbb", "#cccccc"]);
  });
  it("drops a duplicated closing color", () => {
    const colors = getComposerTransitionColors([
      "linear-gradient(#aaaaaa,#bbbbbb)",
      "linear-gradient(#bbbbbb,#aaaaaa)",
    ]);
    expect(colors[0]).not.toBe(colors[colors.length - 1]);
  });
});

describe("getComposerSlidingBackground", () => {
  it("returns null without at least two colors", () =>
    expect(getComposerSlidingBackground(["#ff0000"], 0)).toBeNull());
  it("builds a background, width and offset for a valid strip", () => {
    const result = getComposerSlidingBackground(
      ["linear-gradient(#ff0000,#00ff00)", "linear-gradient(#00ff00,#0000ff)"],
      1,
    );
    expect(result).not.toBeNull();
    expect(result!.background.startsWith("linear-gradient(100deg,")).toBe(true);
    expect(result!.width.endsWith("%")).toBe(true);
    expect(result!.x.endsWith("%")).toBe(true);
  });
  it("shifts further with a higher page index", () => {
    const a = getComposerSlidingBackground(["linear-gradient(#f00,#0f0)"], 0)!;
    const b = getComposerSlidingBackground(["linear-gradient(#f00,#0f0)"], 2)!;
    expect(a.x).toBe("-0%");
    expect(parseFloat(b.x)).toBeLessThan(parseFloat(a.x));
  });
});
