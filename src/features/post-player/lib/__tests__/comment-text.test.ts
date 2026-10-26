import { describe, expect, it } from "vitest";
import { COMMENT_CHIPS } from "@/features/canvas";
import {
  CHIP_EXIT_PAD,
  COMMENT_STORY_WORDS_PER_PAGE,
  FLOATING_COMMENT_MAX_WORDS,
  MAX_COMMENT_CHARS,
  MAX_COMMENT_WORDS,
  getCommentFlightDuration,
  getCommentLabel,
  getCommentStoryGradient,
  getCommentStoryPages,
  getCommentWordCount,
  getFastStoryDuration,
  getFloatingCommentLabel,
  getStoryPageDuration,
  limitCommentText,
  normalizeComment,
  shouldFloatComment,
} from "../comment-text";

describe("comment-text constants", () => {
  it("floats comments of three words or fewer", () =>
    expect(FLOATING_COMMENT_MAX_WORDS).toBe(3));
  it("pads the chip exit by 56px", () => expect(CHIP_EXIT_PAD).toBe(56));
  it("caps a comment at 36 words", () => expect(MAX_COMMENT_WORDS).toBe(36));
  it("caps a comment at 240 characters", () => expect(MAX_COMMENT_CHARS).toBe(240));
  it("packs eight words per story page", () =>
    expect(COMMENT_STORY_WORDS_PER_PAGE).toBe(8));
});

describe("normalizeComment", () => {
  it("collapses runs of spaces", () => expect(normalizeComment("a   b")).toBe("a b"));
  it("trims the ends", () => expect(normalizeComment("  a  ")).toBe("a"));
  it("turns newlines into a space", () => expect(normalizeComment("a\n\nb")).toBe("a b"));
  it("returns empty for an empty string", () => expect(normalizeComment("")).toBe(""));
  it("leaves a single word alone", () => expect(normalizeComment("single")).toBe("single"));
  it("keeps Vietnamese diacritics", () => expect(normalizeComment("một   hai")).toBe("một hai"));
});

describe("limitCommentText", () => {
  it("leaves a short comment unchanged", () => expect(limitCommentText("hello")).toBe("hello"));
  it("clips to the character cap", () =>
    expect(limitCommentText("a".repeat(300))).toHaveLength(MAX_COMMENT_CHARS));
  it("trims an over-long comment to the word cap", () =>
    expect(getCommentWordCount(limitCommentText(Array(40).fill("w").join(" ")))).toBe(
      MAX_COMMENT_WORDS,
    ));
  it("keeps a comment at exactly the word cap", () => {
    const text = Array(MAX_COMMENT_WORDS).fill("w").join(" ");
    expect(limitCommentText(text)).toBe(text);
  });
  it("never exceeds the character cap", () =>
    expect(limitCommentText("word ".repeat(100)).length).toBeLessThanOrEqual(MAX_COMMENT_CHARS));
});

describe("getCommentWordCount", () => {
  it("counts whitespace words", () => expect(getCommentWordCount("one two three")).toBe(3));
  it("keeps an apostrophe inside a word", () => expect(getCommentWordCount("don't stop")).toBe(2));
  it("counts digits as words", () => expect(getCommentWordCount("123 456")).toBe(2));
  it("ignores stray punctuation", () => expect(getCommentWordCount("— … !")).toBe(0));
  it("returns zero for an empty string", () => expect(getCommentWordCount("")).toBe(0));
  it("splits on punctuation", () => expect(getCommentWordCount("hello, world!")).toBe(2));
  it("counts Vietnamese syllables", () => expect(getCommentWordCount("một hai ba")).toBe(3));
});

describe("getCommentFlightDuration", () => {
  it("floors an empty label at 5600ms", () => expect(getCommentFlightDuration("")).toBe(5600));
  it("grows with label length", () =>
    expect(getCommentFlightDuration("x".repeat(40))).toBeGreaterThan(
      getCommentFlightDuration("x".repeat(30)),
    ));
  it("caps a very long label at 8400ms", () =>
    expect(getCommentFlightDuration("x".repeat(500))).toBe(8400));
  it("always lands inside the bounds", () => {
    for (const length of [0, 10, 24, 40, 80, 200]) {
      const duration = getCommentFlightDuration("x".repeat(length));
      expect(duration).toBeGreaterThanOrEqual(5600);
      expect(duration).toBeLessThanOrEqual(8400);
    }
  });
});

describe("getFloatingCommentLabel", () => {
  it("passes a short label through", () => expect(getFloatingCommentLabel("short")).toBe("short"));
  it("passes ten short words through", () => {
    const text = Array(10).fill("w").join(" ");
    expect(getFloatingCommentLabel(text)).toBe(text);
  });
  it("truncates past ten words with an ellipsis", () => {
    const result = getFloatingCommentLabel(Array(12).fill("w").join(" "));
    expect(result.endsWith("...")).toBe(true);
    expect(getCommentWordCount(result)).toBe(10);
  });
  it("truncates a long single-word label", () =>
    expect(getFloatingCommentLabel("a".repeat(90)).endsWith("...")).toBe(true));
});

describe("shouldFloatComment", () => {
  it("floats a three-word comment", () => expect(shouldFloatComment("one two three")).toBe(true));
  it("does not float a four-word comment", () =>
    expect(shouldFloatComment("one two three four")).toBe(false));
  it("floats an empty comment", () => expect(shouldFloatComment("")).toBe(true));
  it("floats a single word", () => expect(shouldFloatComment("hi")).toBe(true));
});

describe("getCommentStoryPages", () => {
  it("returns a single empty page for empty text", () =>
    expect(getCommentStoryPages("", false)).toEqual([""]));
  it("returns one page in fast mode", () =>
    expect(getCommentStoryPages("a b c d e f g h i", true)).toHaveLength(1));
  it("keeps a short comment on one page", () =>
    expect(getCommentStoryPages("one two three", false)).toEqual(["one two three"]));
  it("splits a long comment into eight-word pages", () =>
    expect(getCommentStoryPages(Array(20).fill("w").join(" "), false)).toHaveLength(3));
  it("never exceeds the per-page word limit", () => {
    for (const page of getCommentStoryPages(Array(25).fill("w").join(" "), false))
      expect(getCommentWordCount(page)).toBeLessThanOrEqual(COMMENT_STORY_WORDS_PER_PAGE);
  });
  it("reconstructs the words across pages", () => {
    const words = Array.from({ length: 17 }, (_, index) => `w${index}`);
    const rejoined = getCommentStoryPages(words.join(" "), false).join(" ").split(" ");
    expect(rejoined).toEqual(words);
  });
});

describe("getStoryPageDuration", () => {
  it("floors an empty page at 2600ms", () => expect(getStoryPageDuration("")).toBe(2600));
  it("grows with the word count", () =>
    expect(getStoryPageDuration("a b c d e")).toBeGreaterThan(getStoryPageDuration("a b")));
  it("caps a long page at 5200ms", () =>
    expect(getStoryPageDuration(Array(50).fill("w").join(" "))).toBe(5200));
  it("stays inside the bounds", () => {
    for (const length of [0, 3, 5, 12, 40]) {
      const duration = getStoryPageDuration(Array(length).fill("w").join(" "));
      expect(duration).toBeGreaterThanOrEqual(2600);
      expect(duration).toBeLessThanOrEqual(5200);
    }
  });
});

describe("getFastStoryDuration", () => {
  it("floors an empty page at 3200ms", () => expect(getFastStoryDuration("")).toBe(3200));
  it("grows with the word count", () =>
    expect(getFastStoryDuration("a b c d e f g h i j k")).toBeGreaterThan(
      getFastStoryDuration("a b c"),
    ));
  it("caps a long page at 7600ms", () =>
    expect(getFastStoryDuration(Array(100).fill("w").join(" "))).toBe(7600));
});

describe("getCommentStoryGradient", () => {
  it("returns the first gradient at index zero", () =>
    expect(getCommentStoryGradient(0)).toBe("linear-gradient(135deg,#FF006E,#8338EC)"));
  it("wraps back to the first gradient", () =>
    expect(getCommentStoryGradient(5)).toBe(getCommentStoryGradient(0)));
  it("differs between adjacent indices", () =>
    expect(getCommentStoryGradient(1)).not.toBe(getCommentStoryGradient(2)));
  it("always returns a non-empty string", () => {
    for (const index of [0, 1, 2, 3, 4, 7, 12]) expect(getCommentStoryGradient(index).length).toBeGreaterThan(0);
  });
});

describe("getCommentLabel", () => {
  it("renders a known chip as emoji plus label", () => {
    const chip = COMMENT_CHIPS[0];
    expect(getCommentLabel(chip.id)).toBe(`${chip.emoji} ${chip.label}`);
  });
  it("humanises an unknown id by underscores", () =>
    expect(getCommentLabel("zzz_qqq_unknown")).toBe("zzz qqq unknown"));
  it("falls back to comment for an empty id", () => expect(getCommentLabel("")).toBe("comment"));
  it("falls back to comment for a punctuation-only id", () =>
    expect(getCommentLabel("___")).toBe("comment"));
});
