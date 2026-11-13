/**
 * Measures the meaning panel against the saved drawer's tab and, where they come closer
 * than DRAWER_TAB_MIN_GAP_PX, returns the notch that keeps the panel clear of it. Exports:
 * useDrawerTabNotch, PanelNotch. Depends on: lib/drawer-tab-notch.
 *
 * Everything the panel needs to wear the cut comes back in one value: the clip-path (which
 * also clips its background, border and backdrop blur), the border the clip takes away, a
 * float whose shape-outside shortens only the lines that pass the cut, and how far the share
 * tab's label moves in. No notch is null, and the panel is then exactly what it was.
 *
 * A panel whose height was shared out (`shareTop`) seats the share tab at its top too, to
 * give its foot band back to the text; it gets the same float beside the tab, uncut.
 */
import { useLayoutEffect, useState, type RefObject } from "react";
import { insetBeside, NOTCH_TEXT_GAP_PX, solveTabNotch } from "../lib/drawer-tab-notch";

export type PanelNotch = {
  /** The panel is cut (or holds a cut it was given) round the drawer tab. */
  cut: boolean;
  /** `none` when nothing is cut. */
  clipPath: string;
  /** The cut's border, in an SVG laid over the panel's border box. */
  edge: { d: string; width: number; height: number; left: number; top: number };
  /** A right float at the top of the scroller, its shape the band the text must not enter. */
  float: { width: number; height: number; shape: string } | null;
  /** How far the share tab's label moves in from its usual seat. */
  shareInset: number;
};

/** The saved drawer's tab (SavedDrawer). It is fixed to the viewport, outside the card. */
const TAB_SELECTOR = ".vocab-saved-handle";

const round = (n: number) => Math.round(n * 10) / 10;

/** The drawer tab's cut for this panel, or null where there is no tab or no cut. */
function solveForTab(panel: HTMLElement, hold: boolean) {
  const tab = document.querySelector<HTMLElement>(TAB_SELECTOR);
  const parent = panel.offsetParent as HTMLElement | null;
  if (!tab || !parent) return null;
  const tabRect = tab.getBoundingClientRect();
  if (!tabRect.width || !tabRect.height) return null;
  // The panel's own layout box, not its painted rect: it springs in under a translate and a
  // scale, and the cut belongs to where it comes to rest.
  const parentRect = parent.getBoundingClientRect();
  const originX = parentRect.left + parent.clientLeft + panel.offsetLeft;
  const originY = parentRect.top + parent.clientTop + panel.offsetTop;
  const { gap, notch } = solveTabNotch({
    width: panel.offsetWidth,
    height: panel.offsetHeight,
    radius: parseFloat(getComputedStyle(panel).borderBottomRightRadius) || 0,
    tab: {
      left: tabRect.left - originX,
      top: tabRect.top - originY,
      width: tabRect.width,
      height: tabRect.height,
    },
    hold,
  });
  // For headless checks: the clearance as laid out, before any cut.
  panel.dataset.tabGap = String(round(gap));
  return notch;
}

function measureNotch(
  panel: HTMLElement,
  scroll: HTMLElement | null,
  hold: boolean,
  shareTop: boolean,
): PanelNotch | null {
  const notch = solveForTab(panel, hold);
  if (!notch && !shareTop) return null;
  // Where the cut stands, row by row; an uncut panel has none (insetBeside reads nothing).
  const cutRight = notch?.right ?? [];
  const width = panel.offsetWidth;
  const height = panel.offsetHeight;

  const borderLeft = panel.clientLeft;
  const borderTop = panel.clientTop;
  const borderRight = width - borderLeft - panel.clientWidth;

  // A notched panel seats the share tab in its top-right corner instead of the bottom
  // one the cut runs through ([data-share-top] .vocab-share-dock), and so does a panel
  // whose height was shared out. The tab may still be in
  // its old seat on this measure, so its new rows are taken from its size, not its place.
  const button = panel.querySelector<HTMLElement>(".vocab-share-button");
  const dock = button?.parentElement;
  const face = button?.querySelector<HTMLElement>(".vocab-share-face");
  let share: { bottom: number; left: number; labelRight: number; buttonBottom: number } | null =
    null;
  if (button && dock) {
    // The button's own width, without the inset this hook last moved its label by.
    const inset = face ? parseFloat(getComputedStyle(face).marginRight) || 0 : 0;
    const right = width - borderRight;
    share = {
      bottom: borderTop + dock.offsetHeight,
      left: right - (button.offsetWidth - inset),
      // The label's right edge in its usual seat: the dock is flush with the panel's inner
      // right edge and the button pads the label in from there.
      labelRight: right - (parseFloat(getComputedStyle(button).paddingRight) || 0),
      buttonBottom: borderTop + button.offsetHeight,
    };
  }

  let float: PanelNotch["float"] = null;
  if (scroll) {
    // The scroller's box in the panel's border box. Its children are laid out from here.
    const top = scroll.offsetTop + borderTop;
    const right = scroll.offsetLeft + borderLeft + scroll.clientWidth;
    // Only as deep as the text itself: a float that reached past it would make the
    // scroller taller, the panel would grow, and the next measure would grow it again.
    let rows = 0;
    for (const child of Array.from(scroll.children) as HTMLElement[]) {
      if (child.classList.contains("vocab-reveal-notch-float")) continue;
      rows = Math.max(rows, child.offsetTop - scroll.offsetTop + child.offsetHeight);
    }
    rows = Math.min(rows, scroll.clientHeight);
    const band: number[] = [];
    for (let y = 0; y <= rows; y++) {
      const beside = insetBeside(cutRight, top + y, top + y, right);
      // Beside the share tab the text stops the same gap short of it.
      const besideShare =
        share && top + y <= share.bottom ? right - (share.left - NOTCH_TEXT_GAP_PX) : 0;
      band.push(Math.max(0, beside, besideShare));
    }
    const last = band.reduce((end, inset, y) => (inset > 0 ? y : end), -1);
    if (last >= 0) {
      const floatWidth = Math.ceil(Math.max(...band));
      const floatHeight = last + 1;
      const points = [`${floatWidth}px 0px`];
      for (let y = 0; y <= last; y++) {
        points.push(`${round(floatWidth - band[y])}px ${y}px`);
      }
      points.push(`${floatWidth}px ${floatHeight}px`);
      float = { width: floatWidth, height: floatHeight, shape: `polygon(${points.join(", ")})` };
    }
  }

  const shareInset = share
    ? Math.ceil(
        insetBeside(cutRight, borderTop, share.buttonBottom, share.labelRight, NOTCH_TEXT_GAP_PX),
      )
    : 0;

  return {
    cut: notch !== null,
    clipPath: notch?.clipPath ?? "none",
    edge: { d: notch?.edge ?? "", width, height, left: -borderLeft, top: -borderTop },
    float,
    shareInset: Math.max(0, shareInset),
  };
}

/**
 * The panel's notch around the drawer tab, re-measured whenever the panel or its card is
 * resized, the window turns or resizes, or `placement` (the panel's top) changes.
 * `shareTop` seats the share tab at the panel's top even where nothing is cut.
 */
export function useDrawerTabNotch({
  panel,
  scroll,
  enabled,
  placement,
  shareTop = false,
}: {
  panel: RefObject<HTMLElement | null>;
  scroll: RefObject<HTMLElement | null>;
  enabled: boolean;
  placement: unknown;
  shareTop?: boolean;
}): PanelNotch | null {
  const [notch, setNotch] = useState<PanelNotch | null>(null);
  useLayoutEffect(() => {
    const element = panel.current;
    if (!enabled || !element) {
      setNotch(null);
      return;
    }
    // Unset, so this run's first result always lands even when it is "no notch": a notch
    // from the previous placement must not outlive it.
    let key: string | undefined;
    // Once this page is notched it stays notched until the window changes size (see
    // solveTabNotch's `hold`).
    let held = false;
    const measure = () => {
      const next = measureNotch(element, scroll.current, held, shareTop);
      held = next?.cut ?? false;
      // The float reflows the text and so the panel's height, which comes back here
      // through the observer; an unchanged result ends that round trip.
      const nextKey = next ? JSON.stringify(next) : "";
      if (nextKey === key) return;
      key = nextKey;
      setNotch(next);
    };
    measure();
    const frame = requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    if (element.offsetParent) observer.observe(element.offsetParent);
    const remeasure = () => {
      held = false;
      measure();
    };
    window.addEventListener("resize", remeasure);
    window.addEventListener("orientationchange", remeasure);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", remeasure);
      window.removeEventListener("orientationchange", remeasure);
    };
  }, [panel, scroll, enabled, placement, shareTop]);
  return notch;
}
