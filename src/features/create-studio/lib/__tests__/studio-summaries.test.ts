import { describe, expect, it } from "vitest";
import {
  getBackgroundSummary,
  getFontSummary,
  getLayoutSummary,
  getMotionSummary,
} from "../studio-summaries";

describe("getBackgroundSummary", () => {
  it("labels the gradient mode", () =>
    expect(getBackgroundSummary("gradient", "", "", "")).toBe("gradient"));
  it("returns the chosen transition path label", () =>
    expect(getBackgroundSummary("transition", "aurora rush", "", "")).toBe("aurora rush"));
  it("falls back to a scene label for an unknown scene", () =>
    expect(getBackgroundSummary("scene", "", "not-a-real-scene", "")).toBe("scene"));
  it("falls back to a pattern label for an unknown pattern", () =>
    expect(getBackgroundSummary("pattern", "", "", "not-a-real-pattern")).toBe("pattern"));
  it("labels a preloaded photo", () => expect(getBackgroundSummary("photo", "", "", "")).toBe("preloaded photo"));
  it("labels a video", () => expect(getBackgroundSummary("video", "", "", "")).toBe("video"));
  it("labels the upload mode as a library photo", () =>
    expect(getBackgroundSummary("upload", "", "", "")).toBe("library photo"));
});

describe("getFontSummary", () => {
  it("combines font and size", () => expect(getFontSummary("Inter", 96)).toBe("Inter · 96px"));
  it("keeps fractional sizes", () =>
    expect(getFontSummary("Playfair Display", 88.5)).toBe("Playfair Display · 88.5px"));
});

describe("getLayoutSummary", () => {
  it("resolves the top placement", () => expect(getLayoutSummary(32)).toBe("top"));
  it("resolves the center placement", () => expect(getLayoutSummary(50)).toBe("center"));
  it("resolves the low placement", () => expect(getLayoutSummary(68)).toBe("low"));
  it("reports custom for an unknown position", () => expect(getLayoutSummary(45)).toBe("custom"));
});

describe("getMotionSummary", () => {
  it("joins entrance, tempo and rhythm", () =>
    expect(getMotionSummary({ entrance: "fade", tempo: "steady", rhythm: "burst" })).toBe(
      "fade · steady · burst",
    ));
  it("reflects every field", () => {
    const summary = getMotionSummary({ entrance: "slide", tempo: "snappy", rhythm: "poetic" });
    expect(summary).toBe("slide · snappy · poetic");
  });
});
