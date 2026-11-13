/**
 * Layout-fit state for WordSequenceText (per-page scale, solo stretch, safe Y).
 *
 * Exports: useWordSequenceFit
 * Depends on: lib/word-sequence-fit computeWordSequenceFit
 */

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import type { CanvasSpec } from "@/features/canvas";
import { computeWordSequenceFit } from "../lib/word-sequence-fit";

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Fit passes allowed per page before a still-changing size is treated as an oscillation. */
const MAX_FIT_PASSES = 24;

export type UseWordSequenceFitArgs = {
  initialFit: number;
  measurementKey: string;
  canvasWidth: number;
  background?: string | null;
  spec: CanvasSpec;
  disableFit: boolean;
  onFitScale?: (scale: number) => void;
  isSolo: boolean;
  /** Page pre-packed into unbreakable staggered lines (Vietnamese syllables or Han glyphs). */
  isPackedLines: boolean;
  leftAnchoredText: boolean;
  visualScaleGuard: number;
  wrapperRef: RefObject<HTMLDivElement | null>;
  textRef: RefObject<HTMLDivElement | null>;
  /**
   * The room the text is fitted inside, as clearances from the band's top and foot,
   * replacing the fit solver's own safe insets and its 160px floor. A layout that has
   * already split the band between this text and something else passes the share it
   * gave the text; omitted, the solver keeps its own margins exactly as before.
   */
  fitInsets?: { top: number; bottom: number };
};

export type UseWordSequenceFitResult = {
  fitScale: number;
  soloInlineScale: number;
  safeCenterY: number;
  fontSize: number;
  setFitScale: Dispatch<SetStateAction<number>>;
};

/**
 * Measure and converge per-page text fit inside the canvas safe area.
 * @param args - Canvas geometry, typography, and fit-scale setters
 * @returns Fit scale, solo inline scale, and safe vertical center
 */
export function useWordSequenceFit({
  initialFit,
  measurementKey,
  canvasWidth,
  background,
  spec,
  disableFit,
  onFitScale,
  isSolo,
  isPackedLines,
  leftAnchoredText,
  visualScaleGuard,
  wrapperRef,
  textRef,
  fitInsets,
}: UseWordSequenceFitArgs): UseWordSequenceFitResult {
  const [fitScale, setFitScale] = useState(initialFit);
  const [soloInlineScale, setSoloInlineScale] = useState(1);
  const [safeCenterY, setSafeCenterY] = useState(spec.y);
  const fontSize = spec.size * (disableFit ? 1 : fitScale);
  const [measurementRevision, setMeasurementRevision] = useState(0);
  const fitPasses = useRef(0);

  useIsomorphicLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    const text = textRef.current;
    const canvas = wrapper?.parentElement?.parentElement;
    if (!wrapper || !text || !canvas) return;
    let disposed = false;
    const remeasure = () => {
      if (!disposed) setMeasurementRevision((revision) => revision + 1);
    };
    const observer = new ResizeObserver(remeasure);
    observer.observe(wrapper);
    observer.observe(canvas);
    observer.observe(text);
    const glyph = text.querySelector("[data-kinetic-glyph]");
    if (glyph) observer.observe(glyph);
    const fonts = wrapper.ownerDocument.fonts;
    void fonts.ready.then(remeasure);
    fonts.addEventListener("loadingdone", remeasure);
    const viewport = wrapper.ownerDocument.defaultView?.visualViewport;
    viewport?.addEventListener("resize", remeasure);
    viewport?.addEventListener("scroll", remeasure);
    return () => {
      disposed = true;
      observer.disconnect();
      fonts.removeEventListener("loadingdone", remeasure);
      viewport?.removeEventListener("resize", remeasure);
      viewport?.removeEventListener("scroll", remeasure);
    };
  }, [measurementKey, spec.text, wrapperRef, textRef]);

  useIsomorphicLayoutEffect(() => {
    // A new page, size or typeface is a fresh fit and gets its full budget of passes.
    fitPasses.current = 0;
    setFitScale(initialFit);
    setSoloInlineScale(1);
    setSafeCenterY(spec.y);
  }, [
    initialFit,
    canvasWidth,
    background,
    spec.color,
    spec.font,
    spec.letterSpacing,
    spec.rotation,
    spec.size,
    spec.text,
    spec.weight,
    spec.y,
  ]);

  useIsomorphicLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    const text = textRef.current;
    const canvas = wrapper?.parentElement?.parentElement;
    if (!wrapper || !text || !canvas) return;

    const next = computeWordSequenceFit({
      wrapper,
      text,
      canvas,
      canvasWidth,
      fitScale,
      soloInlineScale,
      isSolo,
      isPackedLines,
      leftAnchoredText,
      visualScaleGuard,
      specSize: spec.size,
      specY: spec.y,
      fitInsets,
    });
    if (!next) return;
    // Solo pages may need to grow fitScale past its initial 1 (to fill the
    // target width), not just shrink — react to either direction. Multi-word
    // pages never compute a nextFit above 1, so this stays shrink-only for them.
    // The solo tolerance comes from the measurement itself (see fitTolerance): chasing
    // a difference smaller than one measured pixel can never settle.
    const fitChanged = isSolo
      ? Math.abs(next.nextFit - fitScale) / Math.max(fitScale, Number.EPSILON) > next.fitTolerance
      : Math.abs(next.nextFit - fitScale) > 0.01;
    // Belt and braces for a loop the tolerance did not anticipate: a page that is still
    // being resized after this many passes is oscillating, not converging. Stopping
    // leaves it a hair off its target; carrying on would hit React's update limit and
    // take the whole screen down with an error page.
    const stillSettling = fitPasses.current < MAX_FIT_PASSES;
    if (fitChanged && stillSettling) fitPasses.current += 1;
    if (!disableFit && fitChanged && stillSettling) {
      setFitScale(next.nextFit);
    } else {
      // Converged — report the scale this page needs so the parent can pick a
      // single shared size that keeps every page the same immersive size.
      onFitScale?.(next.nextFit);
    }
    if (Math.abs(next.nextSoloInlineScale - soloInlineScale) > 0.01) {
      setSoloInlineScale(next.nextSoloInlineScale);
    }
    if (Math.abs(next.nextCenterY - safeCenterY) > 0.2) {
      setSafeCenterY(next.nextCenterY);
    }
  }, [
    measurementKey,
    measurementRevision,
    wrapperRef,
    textRef,
    isSolo,
    disableFit,
    onFitScale,
    fitScale,
    fontSize,
    canvasWidth,
    spec.font,
    spec.letterSpacing,
    spec.rotation,
    spec.size,
    spec.text,
    spec.weight,
    spec.y,
    isPackedLines,
    leftAnchoredText,
    visualScaleGuard,
    soloInlineScale,
    safeCenterY,
    fitInsets?.top,
    fitInsets?.bottom,
  ]);

  return { fitScale, soloInlineScale, safeCenterY, fontSize, setFitScale };
}
