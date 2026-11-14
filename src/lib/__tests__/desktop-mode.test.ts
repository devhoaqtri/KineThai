import { describe, expect, it } from "vitest";
import { isForcedDesktopLayout } from "../desktop-mode";

const tablet = { screenWidth: 600, screenHeight: 1005, maxTouchPoints: 5 };

describe("isForcedDesktopLayout", () => {
  it("flags a tablet laid out at Chrome's 980px desktop width", () => {
    expect(isForcedDesktopLayout({ ...tablet, layoutWidth: 980, layoutHeight: 1641 })).toBe(true);
  });

  it("passes the same tablet showing the page at its own width, either orientation", () => {
    expect(isForcedDesktopLayout({ ...tablet, layoutWidth: 600, layoutHeight: 1005 })).toBe(false);
    // Landscape, with screen.* still reporting the portrait size.
    expect(isForcedDesktopLayout({ ...tablet, layoutWidth: 1005, layoutHeight: 600 })).toBe(false);
  });

  it("flags desktop mode in landscape too", () => {
    expect(isForcedDesktopLayout({ ...tablet, layoutWidth: 1640, layoutHeight: 980 })).toBe(true);
  });

  it("never flags a device without touch, or missing readings", () => {
    expect(
      isForcedDesktopLayout({ ...tablet, maxTouchPoints: 0, layoutWidth: 980, layoutHeight: 1641 }),
    ).toBe(false);
    expect(isForcedDesktopLayout({ ...tablet, layoutWidth: 0, layoutHeight: 0 })).toBe(false);
  });

  it("passes a touch laptop, whose layout matches its screen", () => {
    expect(
      isForcedDesktopLayout({
        layoutWidth: 1366,
        layoutHeight: 768,
        screenWidth: 1366,
        screenHeight: 768,
        maxTouchPoints: 10,
      }),
    ).toBe(false);
  });
});
