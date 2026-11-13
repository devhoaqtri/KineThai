import { describe, expect, it } from "vitest";
import {
  ANSWER_HEAD_PX,
  ANSWER_SEAM_PX,
  MIN_PANEL_SCALE,
  MIN_WORD_PX,
  allocateAnswer,
} from "../answer-allocation";

describe("answer page allocation", () => {
  it("leaves a page alone when the word and the panel both fit", () => {
    // 390 × 844: word to 330, panel from 346 needs 162 and may reach 760.
    expect(
      allocateAnswer({
        capBottom: 760,
        panelTop: 346,
        panelFixed: 64,
        panelContent: 98,
        wordBottom: 330,
      }),
    ).toBeNull();
  });

  it("lifts the word to give a capped panel its height (folded iPhone Duo)", () => {
    // 466 × 678, "on": the word reaches the midline and the panel is 15px short.
    const fit = allocateAnswer({
      capBottom: 524,
      panelTop: 339,
      panelFixed: 72,
      panelContent: 128,
      wordBottom: 336,
    });
    expect(fit).not.toBeNull();
    expect(fit!.panelScale).toBe(1);
    expect(fit!.wordFoot).toBe(524 - 200 - ANSWER_SEAM_PX);
  });

  it("shares a split-screen half between the word and the panel at full size", () => {
    // 360 × 365 Android split screen: 182px of room, the panel needs 112.
    const fit = allocateAnswer({
      capBottom: 270,
      panelTop: 182,
      panelFixed: 33,
      panelContent: 79,
      wordBottom: 173,
    });
    expect(fit!.panelScale).toBe(1);
    expect(fit!.wordFoot! - ANSWER_HEAD_PX).toBeGreaterThanOrEqual(MIN_WORD_PX);
    expect(fit!.wordFoot).toBe(270 - 112 - ANSWER_SEAM_PX);
  });

  it("sets the panel's text smaller rather than squeeze the word below its minimum", () => {
    const fit = allocateAnswer({
      capBottom: 237,
      panelTop: 139,
      panelFixed: 25,
      panelContent: 110,
      wordBottom: 130,
    });
    expect(fit!.panelScale).toBeLessThan(1);
    expect(fit!.panelScale).toBeGreaterThanOrEqual(MIN_PANEL_SCALE);
    const panel = 25 + 110 * fit!.panelScale;
    expect(fit!.wordFoot).toBeCloseTo(237 - panel - ANSWER_SEAM_PX, 5);
  });

  it("only shrinks the text when the word would still fit at full size", () => {
    // The word already ends above the line the panel needs: no box for it.
    const fit = allocateAnswer({
      capBottom: 300,
      panelTop: 200,
      panelFixed: 30,
      panelContent: 120,
      wordBottom: 120,
    });
    expect(fit!.wordFoot).toBeNull();
  });
});
