/**
 * Detects a phone or tablet whose browser is showing the site in "desktop site" mode.
 *
 * Chrome for Android ignores the page's viewport meta tag in that mode and lays the page out
 * at least 980px wide (https://codereview.chromium.org/1785953002). On a ~600px-wide tablet
 * such as a Galaxy Tab A11 the feed, which is built for the screen it is on, is then laid
 * out for a screen half again as wide and shown at its own scale: only the top-left part
 * of it is visible. A page cannot ask for its real width back in that mode, so the shell
 * tells the reader how to turn it off (DesktopModeNotice).
 *
 * Exports: DESKTOP_MODE_RATIO, isForcedDesktopLayout, readDesktopModeSignals
 * Depends on: none (leaf module)
 */

/** A layout this much wider than the screen it is drawn on is not the page's own choice. */
export const DESKTOP_MODE_RATIO = 1.2;

export type DesktopModeSignals = {
  /** The layout viewport's width, CSS px (documentElement.clientWidth). */
  layoutWidth: number;
  /** The layout viewport's height, CSS px. */
  layoutHeight: number;
  /** screen.width and screen.height, CSS px; either order, the orientation is inferred. */
  screenWidth: number;
  screenHeight: number;
  /** navigator.maxTouchPoints. */
  maxTouchPoints: number;
};

/**
 * Whether the page is laid out far wider than the touch screen showing it.
 * @param signals - layout, screen and touch readings
 * @returns true on a touch device whose layout is over DESKTOP_MODE_RATIO times its screen's
 *   width in the current orientation; false on desktops, touch laptops and normal pages
 * @pure true
 */
export function isForcedDesktopLayout(signals: DesktopModeSignals): boolean {
  const { layoutWidth, layoutHeight, screenWidth, screenHeight, maxTouchPoints } = signals;
  if (maxTouchPoints <= 0) return false;
  if (!(layoutWidth > 0) || !(screenWidth > 0) || !(screenHeight > 0)) return false;
  // screen.* may report the natural orientation; match it to the layout's.
  const landscape = layoutWidth > layoutHeight;
  const screenSide = landscape
    ? Math.max(screenWidth, screenHeight)
    : Math.min(screenWidth, screenHeight);
  return layoutWidth > screenSide * DESKTOP_MODE_RATIO;
}

/** @returns The live readings for isForcedDesktopLayout, or null outside a browser. */
export function readDesktopModeSignals(): DesktopModeSignals | null {
  if (typeof window === "undefined" || typeof document === "undefined") return null;
  const root = document.documentElement;
  return {
    layoutWidth: root.clientWidth,
    layoutHeight: root.clientHeight,
    screenWidth: window.screen?.width ?? 0,
    screenHeight: window.screen?.height ?? 0,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
  };
}
