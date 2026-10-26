import { describe, expect, it } from "vitest";
import {
  ARC_BUTTON_TAP,
  ARC_BUTTON_TAP_TRANSITION,
  RING_BTN_HALF,
  RING_BUTTON_ANGLES,
  RING_DIVIDER_ANGLES,
  RING_DIVIDER_INSET,
  RING_HUB,
  RING_HUB_RADIUS,
  RING_OUTER,
  RING_RADIUS,
  SHOW_CORNER_COMMENT_ACTION,
  ringButtonOffset,
} from "../ring-geometry";

describe("ring constants", () => {
  it("shows the corner comment action", () => expect(SHOW_CORNER_COMMENT_ACTION).toBe(true));
  it("taps down to 0.94 with a 2px dip", () => {
    expect(ARC_BUTTON_TAP.scale).toBe(0.94);
    expect(ARC_BUTTON_TAP.y).toBe(2);
  });
  it("uses a stiff spring for the tap transition", () => {
    expect(ARC_BUTTON_TAP_TRANSITION.type).toBe("spring");
    expect(ARC_BUTTON_TAP_TRANSITION.stiffness).toBe(400);
    expect(ARC_BUTTON_TAP_TRANSITION.damping).toBe(24);
  });
  it("keeps the hub smaller than the outer dock", () => expect(RING_HUB).toBeLessThan(RING_OUTER));
  it("keeps the button radius inside the outer dock", () =>
    expect(RING_RADIUS).toBeLessThan(RING_OUTER));
  it("sets the divider inset to the hub radius", () =>
    expect(RING_DIVIDER_INSET).toBe(RING_HUB_RADIUS));
  it("pins the hub radius at 47", () => expect(RING_HUB_RADIUS).toBe(47));
  it("pins the button half-size at 20", () => expect(RING_BTN_HALF).toBe(20));
  it("docks three action buttons", () => expect(RING_BUTTON_ANGLES).toHaveLength(3));
  it("places two dividers between the buttons", () => expect(RING_DIVIDER_ANGLES).toHaveLength(2));
  it("lists button angles in ascending order", () => {
    const sorted = [...RING_BUTTON_ANGLES].sort((a, b) => a - b);
    expect(RING_BUTTON_ANGLES).toEqual(sorted);
  });
  it("keeps every divider between the first and last button", () => {
    for (const angle of RING_DIVIDER_ANGLES) {
      expect(angle).toBeGreaterThan(RING_BUTTON_ANGLES[0]);
      expect(angle).toBeLessThan(RING_BUTTON_ANGLES[RING_BUTTON_ANGLES.length - 1]);
    }
  });
});

describe("ringButtonOffset", () => {
  it("sits on the vertical axis at 0 degrees", () =>
    expect(ringButtonOffset(0)).toEqual({ right: 4, bottom: 74 }));
  it("sits on the horizontal axis at 90 degrees", () =>
    expect(ringButtonOffset(90)).toEqual({ right: 74, bottom: 4 }));
  it("is symmetric at 45 degrees", () => {
    const offset = ringButtonOffset(45);
    expect(offset.right).toBe(offset.bottom);
    expect(offset.right).toBe(53);
  });
  it("flips below the hub at 180 degrees", () =>
    expect(ringButtonOffset(180).bottom).toBe(-66));
  it("returns integers", () => {
    for (const angle of RING_BUTTON_ANGLES) {
      const offset = ringButtonOffset(angle);
      expect(Number.isInteger(offset.right)).toBe(true);
      expect(Number.isInteger(offset.bottom)).toBe(true);
    }
  });
  it("mirrors the 4 and 86 degree buttons across the diagonal", () => {
    const low = ringButtonOffset(4);
    const high = ringButtonOffset(86);
    expect(low.right).toBe(high.bottom);
    expect(low.bottom).toBe(high.right);
  });
  it("grows the right offset as the angle sweeps toward 90", () => {
    expect(ringButtonOffset(60).right).toBeGreaterThan(ringButtonOffset(30).right);
  });
  it("shrinks the bottom offset as the angle sweeps toward 90", () => {
    expect(ringButtonOffset(60).bottom).toBeLessThan(ringButtonOffset(30).bottom);
  });
});
