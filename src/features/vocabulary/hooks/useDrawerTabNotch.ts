/**
 * Measures the meaning panel against the saved drawer's tab and, where they come closer
 * than DRAWER_TAB_MIN_GAP_PX, returns the notch that keeps the panel clear of it. Exports:
 * useDrawerTabNotch, PanelNotch. Depends on: lib/drawer-tab-notch.
 *
 * Everything the panel needs to wear the cut comes back in one value: the clip-path (which
 * also clips its background, border and backdrop blur), the border the clip takes away, a
 * float whose shape-outside shortens only the lines that pass the cut, and how far the share
 * tab's label moves in. No notch is null, and the panel is then exactly what it was.
 */
import { useLayoutEffect, useState, type RefObject } from "react";
import { insetBeside, NOTCH_TEXT_GAP_PX, solveTabNotch } from "../lib/drawer-tab-notch";

export type PanelNotch = {
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

function measureNotch(panel: HTMLElement, scroll: HTMLElement | null): PanelNotch | null {
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
  const width = panel.offsetWidth;
  const height = panel.offsetHeight;
  const style = getComputedStyle(panel);
  const { gap, notch } = solveTabNotch({
    width,
    height,
    radius: parseFloat(style.borderBottomRightRadius) || 0,
    tab: {
      left: tabRect.left - originX,
      top: tabRect.top - originY,
      width: tabRect.width,
      height: tabRect.height,
    },
  });
  // For headless checks: the clearance as laid out, before any cut.
  panel.dataset.tabGap = String(round(gap));
  if (!notch) return null;

  const borderLeft = panel.clientLeft;
  const borderTop = panel.clientTop;
  const borderRight = width - borderLeft - panel.clientWidth;

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
      band.push(Math.max(0, insetBeside(notch.right, top + y, top + y, right)));
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

  let shareInset = 0;
  const button = panel.querySelector<HTMLElement>(".vocab-share-button");
  const dock = button?.parentElement;
  if (button && dock) {
    const top = dock.offsetTop + button.offsetTop + borderTop;
    // The label's right edge in its usual seat: the dock is flush with the panel's inner
    // right edge and the button pads the label in from there.
    const labelRight =
      width - borderRight - (parseFloat(getComputedStyle(button).paddingRight) || 0);
    shareInset = Math.ceil(
      insetBeside(notch.right, top, top + button.offsetHeight, labelRight, NOTCH_TEXT_GAP_PX),
    );
  }

  return {
    clipPath: notch.clipPath,
    edge: { d: notch.edge, width, height, left: -borderLeft, top: -borderTop },
    float,
    shareInset: Math.max(0, shareInset),
  };
}

/**
 * The panel's notch around the drawer tab, re-measured whenever the panel or its card is
 * resized, the window turns or resizes, or `placement` (the panel's top) changes.
 */
export function useDrawerTabNotch({
  panel,
  scroll,
  enabled,
  placement,
}: {
  panel: RefObject<HTMLElement | null>;
  scroll: RefObject<HTMLElement | null>;
  enabled: boolean;
  placement: unknown;
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
    const measure = () => {
      const next = measureNotch(element, scroll.current);
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
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, [panel, scroll, enabled, placement]);
  return notch;
}
