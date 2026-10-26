import { describe, expect, it } from "vitest";
import { CHIP_EXIT_PAD } from "../comment-text";
import { getCommentFlightGeometry } from "../post-comment-layout";

describe("getCommentFlightGeometry", () => {
  it("starts the chip off the right edge", () =>
    expect(getCommentFlightGeometry(400).commentStartX).toBeGreaterThan(0));
  it("mirrors the start and end across the centre", () => {
    const geometry = getCommentFlightGeometry(400);
    expect(geometry.commentEndX).toBe(-geometry.commentStartX);
  });
  it("pushes the travel past the edge by the exit pad", () => {
    const geometry = getCommentFlightGeometry(400);
    expect(geometry.commentStartX).toBeCloseTo(
      (400 + geometry.commentMaxWidth) / 2 + CHIP_EXIT_PAD,
      6,
    );
  });
  it("caps the chip width at 290 on a wide canvas", () =>
    expect(getCommentFlightGeometry(1000).commentMaxWidth).toBe(290));
  it("shrinks the chip width on a narrow canvas", () =>
    expect(getCommentFlightGeometry(400).commentMaxWidth).toBeCloseTo(304 * 0.78, 6));
  it("floors the lane width at 180", () =>
    expect(getCommentFlightGeometry(200).commentMaxWidth).toBeCloseTo(180 * 0.78, 6));
  it("keeps the chip width positive", () =>
    expect(getCommentFlightGeometry(320).commentMaxWidth).toBeGreaterThan(0));
  it("orders the exit overlap left of the enter overlap", () => {
    const geometry = getCommentFlightGeometry(420);
    expect(geometry.commentOverlapExitX).toBeLessThan(geometry.commentOverlapEnterX);
  });
  it("starts the chip beyond half the canvas width", () =>
    expect(getCommentFlightGeometry(400).commentStartX).toBeGreaterThan(200));
  it("is deterministic", () =>
    expect(getCommentFlightGeometry(390)).toEqual(getCommentFlightGeometry(390)));
  it("widens the travel as the canvas grows", () =>
    expect(getCommentFlightGeometry(800).commentStartX).toBeGreaterThan(
      getCommentFlightGeometry(400).commentStartX,
    ));
  it("returns every lane field as a finite number", () => {
    const geometry = getCommentFlightGeometry(360);
    for (const value of Object.values(geometry)) expect(Number.isFinite(value)).toBe(true);
  });
});
