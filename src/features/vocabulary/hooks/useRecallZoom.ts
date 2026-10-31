/**
 * The memory sheet's zoom: one clock for everything that moves between a memory cell and
 * the full screen.
 *
 * The sheet is laid out at its final size from the first frame and revealed through an
 * aperture, a clip that opens from the cell's own rectangle, so no text is ever scaled
 * out of shape or reflowed. The cell's number and name are the sheet's own headline,
 * placed over the cell and flown to their seat. Behind it the settings sheet is pushed
 * past the camera from the cell's centre, on the same curve.
 *
 * Every part is a Web Animation on a shared duration, so the whole zoom has one playhead.
 * That is what makes it interruptible (closing mid-flight reverses from where it is
 * rather than restarting) and scrubbable (a finger pulling the sheet down simply moves
 * the playhead). Once open the animations are cancelled: the sheet's natural state IS
 * the open state, and a rotation or resize leaves nothing stale. Closing rebuilds them
 * from fresh measurements.
 *
 * Exports: useRecallZoom
 * Depends on: React (Web Animations only)
 */
import { useCallback, useLayoutEffect, useMemo, useRef } from "react";

const DURATION = 520;
/** Quick off the mark, long settle: the sheet answers the tap at once. */
const EASING = "cubic-bezier(0.2, 0.86, 0.16, 1)";
/** Leaving is quicker than arriving. */
const CLOSE_RATE = 1.35;
/** The curve flattens near the end, so a plain scrub would ignore the first of the pull. */
const SCRUB_CURVE = 0.2;
const REDUCED_MS = 140;

export type ZoomCell = {
  box: HTMLElement;
  count: HTMLElement | null;
  label: HTMLElement | null;
};

export type ZoomParts = {
  stage: HTMLElement;
  backdrop: HTMLElement;
  /** The accent the today cell wears, faded away as the sheet opens. */
  wash: HTMLElement;
  count: HTMLElement;
  name: HTMLElement;
  /** Everything that fades up behind the headline, in reading order. */
  fades: HTMLElement[];
  /** The settings content pushed past the camera. */
  scene: HTMLElement | null;
};

type Config = {
  parts: () => ZoomParts | null;
  /** The cell the sheet folds into right now; the reader may have changed day. */
  cell: () => { target: ZoomCell; flies: boolean } | null;
  reducedMotion: boolean;
  onClosed: () => void;
};

/** A headline element's trip: from the cell's text, at the cell's size, to its seat. */
function flight(element: HTMLElement, from: HTMLElement, timing: KeyframeAnimationOptions) {
  const seat = element.getBoundingClientRect();
  const start = from.getBoundingClientRect();
  const scale =
    Number.parseFloat(getComputedStyle(from).fontSize) /
    Number.parseFloat(getComputedStyle(element).fontSize);
  return element.animate(
    [
      {
        transform: `translate(${start.left - seat.left}px, ${start.top - seat.top}px) scale(${scale})`,
      },
      { transform: "none" },
    ],
    timing,
  );
}

/**
 * @param config.parts - The sheet's moving elements, read when a zoom is built
 * @param config.cell - The cell to open from or fold into
 * @param config.reducedMotion - Crossfade instead of zooming
 * @param config.onClosed - The sheet has fully folded away and can unmount
 * @returns close, and the scrub controls for a pull-to-dismiss gesture
 */
export function useRecallZoom({ parts, cell, reducedMotion, onClosed }: Config) {
  const timeline = useRef<Animation[]>([]);
  const run = useRef(0);
  const closing = useRef(false);
  const config = useRef({ parts, cell, onClosed });
  config.current = { parts, cell, onClosed };

  const showScene = useCallback((visible: boolean) => {
    const scene = config.current.parts()?.scene;
    if (scene) scene.style.visibility = visible ? "" : "hidden";
  }, []);

  const build = useCallback((): Animation[] => {
    const elements = config.current.parts();
    const origin = config.current.cell();
    if (!elements || !origin) return [];
    const { stage, backdrop, wash, count, name, fades, scene } = elements;
    const { target, flies } = origin;
    const eased: KeyframeAnimationOptions = { duration: DURATION, easing: EASING, fill: "both" };
    const linear: KeyframeAnimationOptions = { duration: DURATION, easing: "linear", fill: "both" };
    const box = target.box.getBoundingClientRect();
    const frame = stage.getBoundingClientRect();
    const radius = Number.parseFloat(getComputedStyle(target.box).borderTopLeftRadius) || 0;
    const aperture = `inset(${box.top - frame.top}px ${frame.right - box.right}px ${
      frame.bottom - box.bottom
    }px ${box.left - frame.left}px round ${radius}px)`;
    const animations = [
      stage.animate(
        [{ clipPath: aperture }, { clipPath: "inset(0px 0px 0px 0px round 0px)" }],
        eased,
      ),
      backdrop.animate([{ opacity: 0 }, { opacity: 1 }], eased),
      wash.animate([{ opacity: 1 }, { opacity: 0, offset: 0.6 }, { opacity: 0 }], linear),
    ];
    if (scene) {
      const stageWidth = frame.width / box.width;
      const area = scene.getBoundingClientRect();
      scene.style.transformOrigin = `${box.left + box.width / 2 - area.left}px ${
        box.top + box.height / 2 - area.top
      }px`;
      animations.push(
        scene.animate(
          [
            { transform: "none", opacity: 1 },
            { opacity: 1, offset: 0.2 },
            { transform: `scale(${stageWidth})`, opacity: 0 },
          ],
          eased,
        ),
      );
    }
    if (flies && target.count && target.label) {
      animations.push(flight(count, target.count, eased), flight(name, target.label, eased));
    } else {
      // Folding into a cell showing another number: the headline bows out instead.
      for (const part of [count, name]) {
        animations.push(
          part.animate([{ opacity: 0 }, { opacity: 0, offset: 0.4 }, { opacity: 1 }], linear),
        );
      }
    }
    // Later parts come up later, on the shared clock so a reversal runs them back too.
    const step = 0.5 / Math.max(fades.length, 1);
    fades.forEach((element, index) => {
      animations.push(
        element.animate(
          [
            { opacity: 0, transform: "translateY(14px)", offset: 0 },
            {
              opacity: 0,
              transform: "translateY(14px)",
              offset: 0.26 + index * step,
              easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
            },
            { opacity: 1, transform: "none", offset: Math.min(1, 0.62 + index * step) },
            { opacity: 1, transform: "none", offset: 1 },
          ],
          linear,
        ),
      );
    });
    return animations;
  }, []);

  const settle = useCallback(() => {
    for (const animation of timeline.current) animation.cancel();
    timeline.current = [];
  }, []);

  const play = useCallback(
    (rate: number) => {
      const id = ++run.current;
      for (const animation of timeline.current) {
        animation.playbackRate = rate;
        animation.play();
      }
      void Promise.all(timeline.current.map((animation) => animation.finished))
        .then(() => {
          if (id !== run.current) return;
          if (rate < 0) {
            // Unmounting is the parent's move; cancelling first would flash the open sheet.
            config.current.onClosed();
            return;
          }
          settle();
          showScene(false);
        })
        .catch(() => {
          // Cancelled: a newer run owns the timeline, or the sheet unmounted.
        });
    },
    [settle, showScene],
  );

  /** Have a timeline parked at the open end, ready to run backwards. */
  const armClosing = useCallback(() => {
    showScene(true);
    if (timeline.current.length) return;
    timeline.current = build();
    for (const animation of timeline.current) {
      animation.pause();
      animation.currentTime = DURATION;
    }
  }, [build, showScene]);

  useLayoutEffect(() => {
    if (reducedMotion) {
      const stage = config.current.parts()?.stage;
      stage?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: REDUCED_MS, easing: "ease" });
      showScene(false);
      return () => showScene(true);
    }
    timeline.current = build();
    play(1);
    return () => {
      run.current += 1;
      settle();
      showScene(true);
    };
  }, [build, play, reducedMotion, settle, showScene]);

  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    if (reducedMotion) {
      showScene(true);
      const stage = config.current.parts()?.stage;
      const fade = stage?.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: REDUCED_MS,
        easing: "ease",
        fill: "forwards",
      });
      if (fade) void fade.finished.then(() => config.current.onClosed());
      else config.current.onClosed();
      return;
    }
    armClosing();
    if (timeline.current.length) play(-CLOSE_RATE);
    else config.current.onClosed();
  }, [armClosing, play, reducedMotion, showScene]);

  /** Follow a pull: 0 is the open sheet, 1 is back in the cell. */
  const scrub = useCallback(
    (progress: number) => {
      if (reducedMotion || closing.current) return;
      run.current += 1;
      armClosing();
      const time = DURATION * (1 - Math.min(1, Math.max(0, progress)) ** SCRUB_CURVE);
      for (const animation of timeline.current) {
        animation.pause();
        animation.currentTime = time;
      }
    },
    [armClosing, reducedMotion],
  );

  /** The finger lifted short of closing: run back open from wherever it was left. */
  const cancelScrub = useCallback(() => {
    if (reducedMotion || closing.current || !timeline.current.length) return;
    play(1);
  }, [play, reducedMotion]);

  return useMemo(() => ({ close, scrub, cancelScrub }), [close, scrub, cancelScrub]);
}
