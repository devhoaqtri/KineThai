/**
 * Scene, pattern, sliding gradient, or static canvas backdrop.
 *
 * Exports: PostCanvasBackdrop
 * Depends on: framer-motion, canvas-patterns, canvas-scenes, post-background
 */

import { motion } from "framer-motion";
import { useState, type ReactElement } from "react";
import { getPatternBackgroundPosition, type CanvasPatternTheme } from "@/features/canvas";
import { getSceneBackgroundStyle, type CanvasSceneTheme } from "@/features/canvas";
import { DEFAULT_CANVAS_BACKGROUND, isBackdropJump } from "../lib/post-background";

export type PostCanvasBackdropProps = {
  postId: string;
  backgroundShiftPage: number;
  sceneTheme: CanvasSceneTheme | null | undefined;
  patternTheme: CanvasPatternTheme | null | undefined;
  slidingCanvasBackground: {
    background: string;
    width: string;
    x: string;
    pageShift: number;
  } | null;
  staticCanvasBackground: string | null | undefined;
  hasTransitionBackground: boolean;
};

/** How long the old colour takes to fade off a page change too far to glide. */
const JUMP_FADE_S = 0.45;

/** The glide between neighbouring pages, shared by every backdrop kind. */
const GLIDE = "1.25s cubic-bezier(0.22,1,0.36,1)";

/**
 * Where the strip sits for a page, as a background-position.
 *
 * The strip is `segments` card-widths wide (pageShift is one segment, in % of the strip),
 * and a page shows segment `page`. A percentage position p lines up p% of the image with
 * p% of the box, so with an image N boxes wide the offset is (1 − N)·p% of the box, and
 * page × one box needs p = page / (N − 1).
 * @param page - The page shown
 * @param pageShift - One segment, in % of the strip
 * @returns The background-position-x value
 * @pure true
 */
function stripPosition(page: number, pageShift: number): string {
  const segments = 100 / pageShift;
  return `${((page * 100) / Math.max(1, segments - 1)).toFixed(4)}%`;
}

/**
 * Paint the post canvas background layer (scene/pattern/gradient).
 * @param props - PostCanvasBackdropProps fields
 * @returns Rendered UI
 */
export function PostCanvasBackdrop({
  postId,
  backgroundShiftPage,
  sceneTheme,
  patternTheme,
  slidingCanvasBackground,
  staticCanvasBackground,
  hasTransitionBackground,
}: PostCanvasBackdropProps): ReactElement {
  // A one-page turn glides the backdrop to the next colour. A longer jump (reveal, replay,
  // restart) lands on its colour at once while the colour it left fades out above it.
  const [shown, setShown] = useState({
    page: backgroundShiftPage,
    instant: false,
    from: null as number | null,
    jump: 0,
  });
  if (shown.page !== backgroundShiftPage) {
    const instant = isBackdropJump(shown.page, backgroundShiftPage);
    setShown({
      page: backgroundShiftPage,
      instant,
      from: instant ? shown.page : shown.from,
      jump: instant ? shown.jump + 1 : shown.jump,
    });
  }

  const layer = (page: number, instant: boolean) =>
    sceneTheme ? (
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          ...getSceneBackgroundStyle(sceneTheme, page),
          ...(instant && { transition: "none" }),
        }}
      />
    ) : patternTheme ? (
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundColor: patternTheme.base,
          backgroundImage: patternTheme.image,
          backgroundSize: patternTheme.size,
          backgroundRepeat: "repeat",
          backgroundPosition: getPatternBackgroundPosition(patternTheme, page),
          transition: instant ? "none" : `background-position ${GLIDE}`,
        }}
      />
    ) : slidingCanvasBackground ? (
      // The strip is dozens of card-widths long. It used to be an element that long, slid
      // by a transform — on a phone a single composited layer ~88,000 device px wide per
      // card. A mobile GPU cannot keep that rastered, so as the strip moved between words
      // its tiles arrived late and other stretches of the strip flashed through. Now the
      // strip is this box's background, sized to its full length and moved by
      // background-position, so only the box itself is ever painted: no layer is larger
      // than the card. no-repeat keeps WebKit drawing the gradient straight into the box
      // rather than building a tile as large as the strip.
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          // The same shorthand-then-image order as before: the fallback fills the box,
          // the strip paints over it.
          background: DEFAULT_CANVAS_BACKGROUND,
          backgroundImage: slidingCanvasBackground.background,
          backgroundSize: `${((100 / slidingCanvasBackground.pageShift) * 100).toFixed(2)}% 100%`,
          backgroundRepeat: "no-repeat",
          backgroundPositionX: stripPosition(page, slidingCanvasBackground.pageShift),
          backgroundPositionY: "0",
          transition: instant ? "none" : `background-position ${GLIDE}`,
        }}
      />
    ) : (
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background: DEFAULT_CANVAS_BACKGROUND,
          backgroundImage: staticCanvasBackground ?? undefined,
        }}
      />
    );

  return (
    <>
      {layer(shown.page, shown.instant)}
      {shown.from !== null && (
        <motion.div
          key={`jump-${shown.jump}`}
          aria-hidden
          className="absolute inset-0 overflow-hidden"
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: JUMP_FADE_S, ease: "easeOut" }}
          onAnimationComplete={() =>
            setShown((current) =>
              current.jump === shown.jump ? { ...current, from: null } : current,
            )
          }
        >
          {layer(shown.from, true)}
        </motion.div>
      )}
      {(hasTransitionBackground || patternTheme || sceneTheme) && (
        <motion.div
          key={`sheen-${postId}-${backgroundShiftPage}`}
          aria-hidden
          className="absolute inset-0 opacity-40 mix-blend-screen"
          style={{
            background:
              "linear-gradient(115deg,rgba(255,255,255,0.22),transparent 42%,rgba(255,255,255,0.14))",
          }}
          initial={{ x: "-18%", opacity: 0 }}
          animate={{ x: "0%", opacity: 0.34 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.15, ease: [0.22, 1, 0.36, 1] }}
        />
      )}
    </>
  );
}
