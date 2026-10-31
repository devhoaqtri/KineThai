/**
 * Korean spelling coda: the answer is rebuilt in the big word itself, one Hangul block
 * at a time. A block's letters pop in side by side at the same size and weight as the
 * syllable they become, snap together, and the real character replaces them. Every letter
 * is the card's own ink; an accent flash marks a letter landing and the block resolving.
 * Nothing is scaled, so the stroke weight never changes on the way. The plan and every time in it
 * come from ../lib/hangul-assembly, which the card's page timer also reads.
 *
 * Exports: HangulAssembly
 * Depends on: framer-motion, React, ../lib/hangul-assembly, ../lib/spelling,
 *   vocabulary.css (.vocab-spelling*, .vocab-hangul*)
 */
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { assemblyPlan, type AssemblySegment } from "../lib/hangul-assembly";
import {
  SPELLING_FIT_GUARD,
  SPELLING_NOMINAL_FONT_SIZE,
  getSpellingFitFontSize,
} from "../lib/spelling";

type Block = Extract<AssemblySegment, { kind: "block" }>;

/** Fast out: the gather starts immediately and settles, instead of easing through the middle. */
const SNAP = [0.16, 0.84, 0.32, 1] as [number, number, number, number];

const em = (value: number) => `${value}em`;

/**
 * The widest the row gets: the block that is open while every earlier one has already
 * closed. Later blocks have not opened yet, so they take no width.
 */
function widestFrame(segments: AssemblySegment[]): ReactNode {
  let cursor = 0;
  let bestAt = 0;
  let best = 0;
  segments.forEach((segment, index) => {
    if (segment.kind !== "block") return;
    const width = cursor + segment.looseWidth;
    if (width > best) {
      best = width;
      bestAt = index;
    }
    cursor += 1;
  });
  const frame: ReactNode[] = [];
  for (const [index, segment] of segments.entries()) {
    if (index > bestAt) break;
    if (segment.kind === "text") {
      frame.push(<span key={index}>{segment.text}</span>);
      continue;
    }
    if (index === bestAt) {
      segment.pieces.forEach((piece, pieceIndex) =>
        frame.push(
          <span key={`${index}-${pieceIndex}`} className="vocab-hangul-measure-letter">
            {piece.letter}
          </span>,
        ),
      );
      break;
    }
    frame.push(
      <span key={index} className="vocab-hangul-measure-letter">
        {segment.syllable}
      </span>,
    );
  }
  return frame;
}

function AssemblingBlock({ block }: { block: Block }) {
  const { start, looseWidth, combineAt, fadeAt, mergeAt } = block;
  const openAt = Math.min(0.16, combineAt * 0.35);
  // Each step eases on its own. One curve across the whole block was speeding the start
  // and dragging the snap, so the letters faded before they had come together.
  const span = (duration: number) => ({ delay: start, duration });
  return (
    <motion.span
      className="vocab-hangul-slot"
      initial={{ width: "0em" }}
      animate={{ width: ["0em", em(looseWidth), em(looseWidth), "1em"] }}
      transition={{
        ...span(mergeAt),
        times: [0, openAt / mergeAt, combineAt / mergeAt, 1],
        ease: ["easeOut", "linear", SNAP],
      }}
    >
      {block.pieces.map((piece, index) => (
        <motion.span
          key={index}
          className="vocab-hangul-piece"
          style={{ ["--glow-at" as keyof React.CSSProperties]: `${start + piece.appear}s` }}
          initial={{ opacity: 0, x: em(piece.loose.x), y: em(piece.loose.y) }}
          animate={{
            opacity: [0, 0, 1, 1, 0],
            x: [em(piece.loose.x), em(piece.loose.x), em(piece.packed.x)],
            y: [em(piece.loose.y), em(piece.loose.y), em(piece.packed.y)],
          }}
          transition={{
            opacity: {
              ...span(block.end),
              times: [0, piece.appear / block.end, piece.snapAt / block.end, fadeAt / block.end, 1],
              ease: ["linear", "easeOut", "linear", "easeOut"],
            },
            x: {
              ...span(mergeAt),
              times: [0, combineAt / mergeAt, 1],
              ease: ["linear", SNAP],
            },
            y: {
              ...span(mergeAt),
              times: [0, combineAt / mergeAt, 1],
              ease: ["linear", SNAP],
            },
          }}
        >
          {piece.letter}
        </motion.span>
      ))}
      <motion.span
        className="vocab-hangul-glyph"
        style={{ ["--glow-at" as keyof React.CSSProperties]: `${start + fadeAt}s` }}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0, 1] }}
        transition={{
          ...span(block.end),
          times: [0, fadeAt / block.end, 1],
          ease: ["linear", "easeOut"],
        }}
      >
        {block.syllable}
      </motion.span>
    </motion.span>
  );
}

/**
 * @param props.word - the Korean headword
 * @param props.reducedMotion - show the finished word at once
 */
export function HangulAssembly({ word, reducedMotion }: { word: string; reducedMotion: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [fontSize, setFontSize] = useState(SPELLING_NOMINAL_FONT_SIZE);
  const { segments } = useMemo(() => assemblyPlan(word), [word]);
  const frame = useMemo(() => widestFrame(segments), [segments]);

  // Fit from the widest moment of the assembly, not the finished word, so the letters
  // have room while they stand apart — and the finished word stays at that same size.
  useLayoutEffect(() => {
    const host = hostRef.current;
    const probe = measureRef.current;
    if (!host || !probe) return;
    const measure = () => {
      const available = host.clientWidth * SPELLING_FIT_GUARD;
      const natural = probe.offsetWidth;
      setFontSize(
        natural && available
          ? getSpellingFitFontSize(natural, available)
          : SPELLING_NOMINAL_FONT_SIZE,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, [word]);

  return (
    <div className="vocab-spelling" ref={hostRef} aria-hidden="true">
      <p className="vocab-spelling-label">Ghép chữ cái thành chữ</p>
      <p className="sr-only" lang="ko">
        {word}
      </p>
      <span
        ref={measureRef}
        className="vocab-spelling-word vocab-hangul-measure"
        style={{ fontSize: SPELLING_NOMINAL_FONT_SIZE }}
        lang="ko"
      >
        {frame}
      </span>
      <div className="vocab-spelling-word vocab-hangul-word" style={{ fontSize }} lang="ko">
        {segments.map((segment, index) =>
          segment.kind === "text" ? (
            <span key={index} className="vocab-spelling-char">
              {segment.text}
            </span>
          ) : reducedMotion ? (
            <span key={index} className="vocab-spelling-char">
              {segment.syllable}
            </span>
          ) : (
            <AssemblingBlock key={index} block={segment} />
          ),
        )}
      </div>
    </div>
  );
}
