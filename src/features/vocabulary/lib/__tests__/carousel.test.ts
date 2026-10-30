import { describe, expect, it } from "vitest";
import {
  MAX_CAROUSEL_SLIDES,
  buildCarouselAltText,
  buildCarouselCaption,
  buildCarouselSlides,
  getCarouselFolderName,
  getTextSizeCap,
  hasCoverSpoiler,
  splitGrammarRows,
} from "../carousel";
import { CAROUSEL_HASHTAGS } from "../carousel-copy";
import type { GrammarRow } from "../grammar";
import type { LearningStage } from "../stages";

function stage(id: string, text: string, reveal = false): LearningStage {
  return { id, label: id, text, lang: "vi", reveal };
}

const stages = [
  stage("lead-0", "Đi biển, nhóm thuê chỗ ở ba đêm."),
  stage("definition-0", "Ở lại một nơi trong một thời gian."),
  stage("reveal", "stay", true),
];

describe("hasCoverSpoiler", () => {
  it("finds the answer inside a longer word", () => {
    expect(hasCoverSpoiler("Nhóm thuê homestay ba đêm.", "stay")).toBe(true);
  });
  it("ignores case", () => {
    expect(hasCoverSpoiler("Das HAUS steht dort.", "Haus")).toBe(true);
  });
  it("passes a clean clue", () => {
    expect(hasCoverSpoiler("Nhóm thuê chỗ ở ba đêm.", "stay")).toBe(false);
  });
  it("ignores two Latin letters, which turn up by chance", () => {
    expect(hasCoverSpoiler("Đi go xa.", "go")).toBe(false);
  });
  it("catches two Han characters", () => {
    expect(hasCoverSpoiler("我们决定了", "决定")).toBe(true);
  });
});

describe("buildCarouselSlides", () => {
  it("runs clues, answer, closing, with the first clue as the hook", () => {
    expect(buildCarouselSlides(stages, "stay", 0)).toEqual({
      slides: [
        { kind: "clue", page: 0, hook: true },
        { kind: "clue", page: 1, hook: false },
        { kind: "answer", page: 2 },
        { kind: "closing", page: 3 },
      ],
      warning: null,
    });
  });
  it("puts grammar between the answer and the closing slide", () => {
    const kinds = buildCarouselSlides(stages, "stay", 2).slides.map((slide) => slide.kind);
    expect(kinds).toEqual(["clue", "clue", "answer", "grammar", "grammar", "closing"]);
  });
  it("moves a clean clue to slide 1 when the first gives the answer away", () => {
    const leaky = [stage("lead-0", "Nhóm thuê homestay."), ...stages.slice(1)];
    const { slides, warning } = buildCarouselSlides(leaky, "stay", 0);
    expect(slides[0]).toEqual({ kind: "clue", page: 1, hook: true });
    expect(slides[1]).toEqual({ kind: "clue", page: 0, hook: false });
    expect(warning).toBeNull();
  });
  it("warns when no clue is clean", () => {
    const leaky = [stage("lead-0", "homestay"), stage("reveal", "stay", true)];
    expect(buildCarouselSlides(leaky, "stay", 0).warning).toMatch(/slide 1/);
  });
  it("never needs more slides than Instagram allows", () => {
    const pages = Array.from({ length: 7 }, (_, i) => stage(`p-${i}`, "chữ"));
    const { slides } = buildCarouselSlides([...pages, stage("reveal", "x", true)], "x", 2);
    expect(slides.length).toBeLessThanOrEqual(MAX_CAROUSEL_SLIDES);
  });
});

describe("splitGrammarRows", () => {
  const line = (key: string): GrammarRow => ({ kind: "line", key, label: key, value: "x" });
  const table = (forms: number): GrammarRow => ({
    kind: "table",
    key: "t",
    label: "t",
    forms: Array.from({ length: forms }, (_, i) => ({ label: `f${i}`, value: "x" })),
  });
  it("keeps a short word on one slide", () => {
    expect(splitGrammarRows([line("a"), line("b")])).toHaveLength(1);
  });
  it("flows a long word onto a second slide, in order", () => {
    const rows = [line("a"), line("b"), table(4), line("c"), line("d"), line("e")];
    const parts = splitGrammarRows(rows);
    expect(parts).toHaveLength(2);
    expect(parts.flat()).toEqual(rows);
  });
  it("never splits a row, even one taller than a slide", () => {
    const parts = splitGrammarRows([line("a"), table(9), line("b")]);
    expect(parts.map((part) => part.length)).toEqual([1, 1, 1]);
  });
  it("gives no slides to a word with no grammar", () => {
    expect(splitGrammarRows([])).toEqual([]);
  });
});

describe("getTextSizeCap", () => {
  it("leaves close sizes alone", () => expect(getTextSizeCap([40, 44, 52])).toBeUndefined());
  it("holds a jump to the ratio", () => expect(getTextSizeCap([36, 52, 62])).toBe(48.6));
  it("copes with nothing to measure", () => expect(getTextSizeCap([])).toBeUndefined());
});

describe("getCarouselFolderName", () => {
  it("names a Chinese word by its code", () => {
    expect(getCarouselFolderName("zh", "2BB", "4x5")).toBe("hoa-chayla-2BB-4x5");
  });
  it("keeps each language apart", () => {
    expect(getCarouselFolderName("de", "2BB", "1x1")).toBe("duc-chayla-2BB-1x1");
  });
});

describe("buildCarouselCaption", () => {
  const caption = buildCarouselCaption({
    locale: "zh",
    firstClue: "Bạn thân khoe điện thoại mới",
    address: "hoa.chayla.app",
    handle: "@chayla",
  });
  it("carries the clue with its joins undone", () => {
    expect(caption).toContain("Bạn thân khoe điện thoại mới");
    expect(caption).not.toContain(" ");
    expect(caption).not.toContain("_");
  });
  it("names the account, the address and the language's hashtags", () => {
    expect(caption).toContain("@chayla · hoa.chayla.app");
    expect(caption).toContain(CAROUSEL_HASHTAGS.zh);
  });
  it("leaves the separator out without a handle", () => {
    const bare = buildCarouselCaption({ locale: "en", firstClue: "a", address: "anh.chayla.app" });
    expect(bare).not.toContain(" · ");
  });
});

describe("buildCarouselAltText", () => {
  const { slides } = buildCarouselSlides(stages, "stay", 0);
  const lines = buildCarouselAltText(slides, stages, { word: "stay", meaning: "ở lại" });
  it("gives one line per slide", () => expect(lines).toHaveLength(slides.length));
  it("keeps the answer out of slide 1", () => expect(lines[0]).not.toContain("stay"));
  it("names the answer on its own slide", () => expect(lines[2]).toContain("stay"));
  it("reads a blank aloud instead of underscores", () => {
    const blank = [stage("usage-0", "It was _____ of me."), stage("reveal", "kind", true)];
    const plan = buildCarouselSlides(blank, "kind", 0);
    const [first] = buildCarouselAltText(plan.slides, blank, { word: "kind", meaning: "tốt" });
    expect(first).toContain("chỗ trống");
    expect(first).not.toContain("_");
  });
});
