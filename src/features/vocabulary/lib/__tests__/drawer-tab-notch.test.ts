import { describe, expect, it } from "vitest";
import {
  DRAWER_TAB_MIN_GAP_PX,
  HANDLE_EDGE,
  insetBeside,
  solveTabNotch,
  tabEdgePoints,
} from "../drawer-tab-notch";

/** The tab's 30 × 118 rect placed in the panel's border-box coordinates. */
const tabAt = (left: number, top: number) => ({ left, top, width: 30, height: 118 });

/** Distance from a point to the tab's filled shape (its edge, filled to the right). */
function distanceToTab(x: number, y: number, edge: { x: number; y: number }[]) {
  let d = Infinity;
  for (const p of edge) d = Math.min(d, Math.hypot(p.x - x, p.y - y));
  return d;
}

describe("drawer tab notch", () => {
  it("keeps the outline SavedDrawer has always drawn", () => {
    expect(HANDLE_EDGE).toBe("M30 0 C30 19.5 0 19.5 0 39 L0 79 C0 98.5 30 98.5 30 118");
  });

  it("leaves a panel that is clear of the tab untouched", () => {
    // Landscape: 12px between the panel's right side and the tab.
    const { gap, notch } = solveTabNotch({
      width: 278,
      height: 140,
      radius: 20,
      tab: tabAt(290, 58),
    });
    expect(gap).toBeCloseTo(12, 0);
    expect(notch).toBeNull();
  });

  it("measures shape to shape, so a shoulder beside the corner reads as clear", () => {
    // 414px phone: boxes 3px apart, but the tab's shoulder curves away from the corner.
    const { gap, notch } = solveTabNotch({
      width: 348,
      height: 163,
      radius: 20,
      tab: tabAt(351, 123),
    });
    expect(gap).toBeGreaterThan(DRAWER_TAB_MIN_GAP_PX);
    expect(notch).toBeNull();
  });

  it("cuts a panel that overlaps the tab, keeping every row the minimum gap clear", () => {
    // 320px phone: the panel runs 4px into the tab.
    const tab = tabAt(264, 46);
    const { gap, notch } = solveTabNotch({ width: 268, height: 134, radius: 20, tab });
    expect(gap).toBeLessThan(0);
    expect(notch).not.toBeNull();
    const edge = tabEdgePoints(tab);
    const cutRows = notch!.right.filter(Number.isFinite).length;
    expect(cutRows).toBeGreaterThan(40);
    notch!.right.forEach((x, y) => {
      // Along the cut, the material ends at least the gap short of the tab.
      if (Number.isFinite(x)) {
        expect(distanceToTab(x, y, edge)).toBeGreaterThan(DRAWER_TAB_MIN_GAP_PX - 0.6);
      }
    });
    expect(notch!.clipPath.startsWith("polygon(")).toBe(true);
    expect(notch!.edge.startsWith("M")).toBe(true);
  });

  it("only touches the rows near the tab", () => {
    const { notch } = solveTabNotch({ width: 268, height: 134, radius: 20, tab: tabAt(264, 46) });
    // Above the tab's reach, and in the panel's own top corner, nothing is cut.
    expect(notch!.right.slice(0, 26).every((x) => x === Infinity)).toBe(true);
    expect(notch!.clipPath).toContain("332px -64px");
  });

  it("insets text only by what the cut takes at its rows", () => {
    const { notch } = solveTabNotch({ width: 268, height: 134, radius: 20, tab: tabAt(264, 46) });
    // Content ends 15px in from the panel's outer right edge.
    expect(insetBeside(notch!.right, 0, 20, 253)).toBe(0);
    const beside = insetBeside(notch!.right, 90, 110, 253);
    expect(beside).toBeGreaterThan(0);
    // After moving in, the text is the text gap clear of the cut.
    for (let y = 90; y <= 110; y++) {
      expect(253 - beside).toBeLessThanOrEqual(notch!.right[y] - 6 + 1e-9);
    }
  });

  it("keeps a held notch, uncut, once the panel has come clear of the tab", () => {
    const clear = { width: 278, height: 140, radius: 20, tab: tabAt(290, 58) };
    expect(solveTabNotch(clear).notch).toBeNull();
    const held = solveTabNotch({ ...clear, hold: true }).notch;
    expect(held).not.toBeNull();
    expect(held!.clipPath).toBe("none");
    expect(held!.edge).toBe("");
    expect(held!.right.every((x) => x === Infinity)).toBe(true);
  });
});
