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
    /** A few segments of the strip as their own gradient (post-background buildStripWindow). */
    window: (first: number, count: number) => string;
  } | null;
  staticCanvasBackground: string | null | undefined;
  hasTransitionBackground: boolean;
};

/** How long the old colour takes to fade off a page change too far to glide. */
const JUMP_FADE_S = 0.45;

/** The glide between neighbouring pages, shared by every backdrop kind. */
const GLIDE = "1.25s cubic-bezier(0.22,1,0.36,1)";
const GLIDE_S = 1.25;
const GLIDE_EASE = [0.22, 1, 0.36, 1] as const;

/**
 * The sliding gradient, painted as a window of the strip rather than the strip itself.
 *
 * The strip is dozens of colour bands long, one per page. It used to be painted whole —
 * first as a transformed element ~88,000 device px wide, then as one background that size
 * moved by background-position — and a page turn slid it one band. Whatever moved the strip
 * to the wrong offset or painted it late (a glide cut short, a jump read as a glide, a phone
 * dropping its tiles after a long session) showed the bands in between racing past: the
 * "flash of several backgrounds", rarer after each fix and never gone, because the other
 * bands were always there to show.
 *
 * Now a page paints only its own band with one on each side (the tilted gradient needs the
 * margin), and a one-page turn paints the four bands around the two it moves between and
 * glides across them, its start written on mount. Nothing else exists in the layer, so a
 * turn can show its two backgrounds and no third.
 */
function StripWindow({
  strip,
  page,
  glideFrom,
  turn,
}: {
  strip: NonNullable<PostCanvasBackdropProps["slidingCanvasBackground"]>;
  page: number;
  glideFrom: number | null;
  turn: number;
}): ReactElement {
  const base = {
    // The same shorthand-then-image order as before: the fallback fills the box, the
    // window paints over it. no-repeat keeps the gradient drawn straight into the box.
    background: DEFAULT_CANVAS_BACKGROUND,
    backgroundRepeat: "no-repeat",
    backgroundPositionY: "0",
  } as const;
  if (glideFrom !== null && Math.abs(glideFrom - page) === 1) {
    const first = Math.min(glideFrom, page) - 1;
    const at = (segment: number) => `${(((segment - first) / 3) * 100).toFixed(4)}%`;
    return (
      <motion.div
        key={`glide-${turn}`}
        aria-hidden
        className="absolute inset-0"
        style={{ ...base, backgroundImage: strip.window(first, 4), backgroundSize: "400% 100%" }}
        initial={{ backgroundPositionX: at(glideFrom) }}
        animate={{ backgroundPositionX: at(page) }}
        transition={{ duration: GLIDE_S, ease: GLIDE_EASE }}
      />
    );
  }
  return (
    <div
      aria-hidden
      className="absolute inset-0"
      style={{
        ...base,
        backgroundImage: strip.window(page - 1, 3),
        backgroundSize: "300% 100%",
        backgroundPositionX: "50%",
      }}
    />
  );
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
  // `glideFrom` is the page a one-page turn started from, and `turn` keys that glide, so
  // every turn mounts its own glide with its start written explicitly.
  const [shown, setShown] = useState({
    page: backgroundShiftPage,
    instant: false,
    from: null as number | null,
    jump: 0,
    glideFrom: null as number | null,
    turn: 0,
  });
  if (shown.page !== backgroundShiftPage) {
    const instant = isBackdropJump(shown.page, backgroundShiftPage);
    setShown({
      page: backgroundShiftPage,
      instant,
      from: instant ? shown.page : shown.from,
      jump: instant ? shown.jump + 1 : shown.jump,
      glideFrom: instant ? null : shown.page,
      turn: shown.turn + 1,
    });
  }

  const layer = (page: number, instant: boolean, glideFrom: number | null = null, turn = 0) =>
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
      <StripWindow
        strip={slidingCanvasBackground}
        page={page}
        glideFrom={instant ? null : glideFrom}
        turn={turn}
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
      {layer(shown.page, shown.instant, shown.glideFrom, shown.turn)}
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
