/**
 * Post-reveal spelling replay: the answered word dissolves and every letter pops
 * in one at a time, giving the reader a beat to spell it silently. The variant
 * catalogue and all timing live in ../lib/spelling so the playback timer, not
 * this component, decides when the card ends.
 *
 * Exports: SpellingAnimation
 * Depends on: framer-motion, React, ../lib/spelling
 */

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { Transition, Variants } from "framer-motion";
import {
  SPELLING_FIT_GUARD,
  SPELLING_NOMINAL_FONT_SIZE,
  SPELLING_STAGGER,
  getSpellingFitFontSize,
  type SpellingVariant,
} from "../lib/spelling";

/** Per-variant letter motion. Scatter needs the index for its radial offset. */
function variantMotion(
  variant: SpellingVariant,
  index: number,
): { initial: Record<string, number>; animate: Record<string, number>; transition: Transition } {
  switch (variant) {
    case "bounce":
      return {
        initial: { scale: 0, opacity: 0 },
        animate: { scale: 1, opacity: 1 },
        transition: { type: "spring", stiffness: 520, damping: 11, mass: 0.7 },
      };
    case "drop":
      return {
        initial: { y: -130, opacity: 0, scaleY: 1.25 },
        animate: { y: 0, opacity: 1, scaleY: 1 },
        transition: { type: "spring", stiffness: 420, damping: 13, mass: 0.9 },
      };
    case "spin":
      return {
        initial: { rotate: -360, scale: 0, opacity: 0 },
        animate: { rotate: 0, scale: 1, opacity: 1 },
        transition: { type: "spring", stiffness: 260, damping: 16, mass: 0.8 },
      };
    case "scatter": {
      // Golden-angle spread: deterministic, so a re-render cannot re-shuffle.
      const angle = (index * 137.508 * Math.PI) / 180;
      const radius = 70 + ((index * 37) % 55);
      return {
        initial: {
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius,
          opacity: 0,
          scale: 0.4,
        },
        animate: { x: 0, y: 0, opacity: 1, scale: 1 },
        transition: { type: "spring", stiffness: 210, damping: 19, mass: 0.75 },
      };
    }
    case "wave":
      return {
        initial: { y: 46, opacity: 0, scale: 0.85 },
        animate: { y: 0, opacity: 1, scale: 1 },
        transition: { type: "spring", stiffness: 380, damping: 12, mass: 0.6 },
      };
    case "flip":
      return {
        initial: { rotateY: 92, opacity: 0 },
        animate: { rotateY: 0, opacity: 1 },
        transition: { type: "spring", stiffness: 300, damping: 20, mass: 0.8 },
      };
    case "elastic":
      return {
        initial: { scaleX: 0, scaleY: 1.5, opacity: 0 },
        animate: { scaleX: 1, scaleY: 1, opacity: 1 },
        transition: { type: "spring", stiffness: 620, damping: 9, mass: 0.65 },
      };
    case "slide":
      return {
        initial: { x: index % 2 === 0 ? -64 : 64, opacity: 0, rotate: index % 2 === 0 ? -18 : 18 },
        animate: { x: 0, opacity: 1, rotate: 0 },
        transition: { type: "spring", stiffness: 340, damping: 18, mass: 0.7 },
      };
  }
}

/**
 * Render the answered word letter by letter.
 * @param props Word, chosen variant, motion preference and the word's language.
 * @returns Centred spelling overlay.
 */
export function SpellingAnimation({
  word,
  variant,
  reducedMotion,
  lang = "en",
}: {
  word: string;
  variant: SpellingVariant;
  reducedMotion: boolean;
  lang?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const wordRef = useRef<HTMLDivElement>(null);
  const [fontSize, setFontSize] = useState(SPELLING_NOMINAL_FONT_SIZE);

  // Array.from keeps surrogate pairs and combining marks together, so an
  // accented letter never animates as two separate glyphs.
  const letters = useMemo(() => Array.from(word), [word]);
  const motions = useMemo(
    () => letters.map((_, index) => variantMotion(variant, index)),
    [letters, variant],
  );

  // Fit the whole word inside the card. offsetWidth is a layout measurement and
  // is unaffected by the per-letter transforms, so it stays trustworthy here.
  useLayoutEffect(() => {
    const host = hostRef.current;
    const row = wordRef.current;
    if (!host || !row) return;
    let cancelled = false;
    const measure = () => {
      if (cancelled) return;
      // Subtract the host's own horizontal padding so the fitted row stays inside the
      // content box and leaves room on both sides for first/last-letter handwriting
      // swashes before .vocab-card's overflow: hidden clips them.
      const hostStyle = getComputedStyle(host);
      const padX =
        (Number.parseFloat(hostStyle.paddingLeft) || 0) +
        (Number.parseFloat(hostStyle.paddingRight) || 0);
      const available = Math.max(0, host.clientWidth - padX) * SPELLING_FIT_GUARD;
      row.style.fontSize = `${SPELLING_NOMINAL_FONT_SIZE}px`;
      const natural = row.offsetWidth;
      if (!natural || !available) {
        setFontSize(SPELLING_NOMINAL_FONT_SIZE);
        return;
      }
      // The row is nowrap by contract, so this size is the only thing keeping ten
      // letters (or forty) on one line: it is solved from the width actually needed
      // and never lifted off a minimum, which is what used to spill long answers.
      const fitted = getSpellingFitFontSize(natural, available);
      // Written straight back to the element as well as to state. Measuring had to
      // set the nominal size by hand, and when a later pass solves the SAME size
      // React sees no state change and repaints nothing — which left the row stuck
      // at nominal, wider than it had just been fitted to.
      row.style.fontSize = `${fitted}px`;
      setFontSize(fitted);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    // Handwriting faces warm up without blocking the stream, so one can finish
    // loading after this coda mounts; re-fit when it arrives because a script face
    // is often wider than the sans-serif fallback.
    const fonts = typeof document !== "undefined" ? document.fonts : undefined;
    fonts?.addEventListener?.("loadingdone", measure);
    void fonts?.ready.then(measure);
    return () => {
      cancelled = true;
      observer.disconnect();
      fonts?.removeEventListener?.("loadingdone", measure);
    };
  }, [word]);

  const containerVariants: Variants = {
    hidden: {},
    shown: {
      transition: { staggerChildren: reducedMotion ? 0 : SPELLING_STAGGER[variant] },
    },
  };

  return (
    <div className="vocab-spelling" ref={hostRef} aria-hidden="true">
      <p className="vocab-spelling-label">Đánh vần lại lần nữa</p>
      <p className="sr-only" lang={lang}>
        {word}
      </p>
      <motion.div
        className="vocab-spelling-word"
        ref={wordRef}
        style={{ fontSize }}
        variants={containerVariants}
        initial="hidden"
        animate="shown"
        lang={lang}
      >
        {letters.map((letter, index) => {
          const child: Variants = reducedMotion
            ? { hidden: { opacity: 1 }, shown: { opacity: 1 } }
            : { hidden: motions[index]!.initial, shown: motions[index]!.animate };
          return (
            <motion.span
              key={`${letter}-${index}`}
              className="vocab-spelling-char"
              variants={child}
              transition={reducedMotion ? { duration: 0 } : motions[index]!.transition}
              data-glow={variant === "flip" && !reducedMotion ? "" : undefined}
            >
              {letter}
            </motion.span>
          );
        })}
      </motion.div>
    </div>
  );
}
