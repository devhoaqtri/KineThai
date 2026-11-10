/**
 * Packed (Vietnamese / Han) / English word-line layout for WordSequenceText.
 *
 * Exports: WordSequenceLines
 * Depends on: WordSequenceWord, kinetic-text vietnamese line metrics
 */

import type { ReactElement } from "react";
import type { CSSProperties, ReactNode } from "react";
import { getCanvasEmphasisWordColor, type CanvasSpec } from "@/features/canvas";
import {
  getAuraColor,
  getEmphasisInnerAnimation,
  type EmphasisVariant,
  type getVietnameseLayoutMetrics,
} from "@/features/kinetic-text";
import { getRunEmphasis } from "../lib/emphasis-variant";
import type { ResolvedEntranceStyle } from "../lib/entrances";
import { getEntranceTransition } from "../lib/entrances";
import { getWordDelay, tempoConfig } from "../lib/playback-timing";
import { WordSequenceWord } from "./WordSequenceWord";
import { PausableRunFrame } from "./PausableRunFrame";

type VietnameseLines = ReturnType<typeof getVietnameseLayoutMetrics>["lines"];

export type WordSequenceLinesProps = {
  /**
   * Page arrives pre-packed into staggered lines — Vietnamese syllables or Han
   * characters. The packed branch renders `vietnameseLines` (a WordSequenceLines
   * line is language-agnostic: segments of word tokens plus an em indent).
   */
  isVietnamese: boolean;
  /** Gap drawn between two segments on a packed line; Japanese pages draw 文節 flush. */
  segmentGapEm?: number;
  /** Multiplier on the inter-line advance, forwarded from WordSequenceText. */
  lineSpacingScale?: number;
  vietnameseLines: VietnameseLines;
  words: string[];
  emphasized: Set<number>;
  /** Bound phrase keys — annotations plus every highlighted run — for shared styling. */
  phraseKeys?: readonly (readonly string[])[];
  /** Caller-forced second highlight and the effect it is drawn with. */
  secondaryEmphasized?: Set<number>;
  secondaryVariant?: EmphasisVariant;
  /** False where the box-drawing frame is not allowed (forwarded from WordSequenceText). */
  allowFrame?: boolean;
  /** The effects this slot may draw from, forwarded from WordSequenceText. */
  pool?: readonly EmphasisVariant[];
  spotlightEmphasis: boolean;
  spec: CanvasSpec;
  staticRender: boolean;
  paused: boolean;
  isSolo: boolean;
  soloInlineScale: number;
  leftAnchoredText: boolean;
  textColor: string;
  emphasisColor: string;
  /** `emphasisColor` came from the surface's own palette (forwarded from WordSequenceText). */
  emphasisColorExact?: boolean;
  entranceStyle: ResolvedEntranceStyle;
  /** Multiplier on every entrance's delay and length, forwarded from WordSequenceText. */
  timeScale?: number;
};

/**
 * Group consecutive emphasized word indices into [start, end) ranges.
 * @param words - words argument
 * @param emphasized - emphasized argument
 * @returns Array of non-overlapping ranges covering consecutive emphasized runs
 */
function getEmphasisGroups(
  words: string[],
  emphasized: Set<number>,
  startIndex = 0,
): Array<{ start: number; end: number }> {
  const groups: Array<{ start: number; end: number }> = [];
  // A glyph-less token (punctuation, a masked "_____" blank) can carry an index in
  // `emphasized`, but framing it draws an empty box around nothing. Treat such
  // tokens as breaks so they neither start, extend, nor sit inside a shared frame.
  const hasGlyph = (word: string) => /\p{L}|\p{N}/u.test(word);
  let i = 0;

  while (i < words.length) {
    if (!emphasized.has(startIndex + i) || !hasGlyph(words[i])) {
      i += 1;
      continue;
    }

    const start = i;
    while (i < words.length && emphasized.has(startIndex + i) && hasGlyph(words[i])) {
      i += 1;
    }

    if (i - start >= 2) {
      groups.push({ start, end: i });
    }
  }

  return groups;
}

/**
 * Map words/lines to WordSequenceWord spans.
 * @param props - WordSequenceLinesProps fields
 * @returns Rendered UI
 */
export function WordSequenceLines({
  isVietnamese,
  segmentGapEm = 0.24,
  lineSpacingScale = 1,
  vietnameseLines,
  words,
  emphasized,
  phraseKeys,
  secondaryEmphasized,
  secondaryVariant,
  allowFrame = true,
  pool,
  spotlightEmphasis,
  spec,
  staticRender,
  paused,
  isSolo,
  soloInlineScale,
  leftAnchoredText,
  textColor,
  emphasisColor,
  emphasisColorExact = false,
  entranceStyle,
  timeScale = 1,
}: WordSequenceLinesProps): ReactElement {
  const renderWord = (
    word: string,
    index: number,
    suppressSpotlight = false,
    skipFrame = false,
    runEffect = false,
    sharedVariant?: EmphasisVariant,
  ) => (
    <WordSequenceWord
      key={`${word}-${index}`}
      word={word}
      index={index}
      words={words}
      spec={spec}
      emphasized={emphasized}
      phraseKeys={phraseKeys}
      secondaryEmphasized={secondaryEmphasized}
      secondaryVariant={secondaryVariant}
      spotlightEmphasis={spotlightEmphasis}
      suppressSpotlight={suppressSpotlight}
      staticRender={staticRender}
      paused={paused}
      isSolo={isSolo}
      soloInlineScale={soloInlineScale}
      leftAnchoredText={leftAnchoredText}
      textColor={textColor}
      emphasisColor={emphasisColor}
      emphasisColorExact={emphasisColorExact}
      entranceStyle={entranceStyle}
      skipFrame={skipFrame}
      allowFrame={allowFrame}
      pool={pool}
      runEffect={runEffect}
      sharedVariant={sharedVariant}
      timeScale={timeScale}
    />
  );

  // Frame-group wrapper entrance: fade in alongside the first word so the
  // rounded-rect outline never appears before the words it frames.
  const rhythmDurationMultiplier = spec.rhythm === "poetic" ? 1.28 : 1;
  const frameEntrance = (firstWordIndex: number) => {
    const delay = staticRender
      ? 0
      : getWordDelay(firstWordIndex, spec.tempo, spec.rhythm) * timeScale;
    const duration = staticRender
      ? 0.01
      : tempoConfig[spec.tempo].wordDuration * 1.22 * rhythmDurationMultiplier * timeScale;
    return { delay, duration };
  };

  /**
   * One run of consecutive emphasised words. The wrapper fades in with its first
   * word; when every word shares a moving effect, that effect is drawn ONCE on an
   * inner span covering the whole run — a spotlight that glides from the first
   * syllable to the last instead of one small spotlight per syllable — and the words
   * inside are told not to draw their own.
   */
  const renderRun = (run: { text: string; index: number }[], key: string): ReactNode => {
    const first = run[0]!;
    const last = run[run.length - 1]!;
    const { delay: frameDelay, duration: frameDuration } = frameEntrance(first.index);
    const runEffect = getRunEmphasis(
      run.map((item) => item.index),
      {
        words,
        text: spec.text,
        emphasized,
        phraseKeys,
        secondaryEmphasized,
        secondaryVariant,
        emphasisColor,
        allowFrame,
        pool,
      },
    );
    // Every syllable of the run is dressed in the one effect the run settled on; only a
    // moving effect is lifted onto the wrapper, so the syllables stay silent about it.
    const children = run.map((item) =>
      renderWord(item.text, item.index, true, true, runEffect?.lift != null, runEffect?.style),
    );
    const lift = runEffect?.lift ?? null;
    // The effect waits for the LAST word of the run to land, so it never starts
    // across a syllable that is still flying in.
    const effectDelay = frameEntrance(last.index);
    const runAnimation = lift && !staticRender ? getEmphasisInnerAnimation(lift) : undefined;
    return (
      <PausableRunFrame
        key={key}
        className="inline-flex relative"
        staticRender={staticRender}
        transition={getEntranceTransition(entranceStyle, frameDelay, frameDuration, timeScale)}
        style={{
          display: "inline-flex",
          flex: "0 0 auto",
          alignItems: "baseline",
          columnGap: "0.24em",
          padding: "0.05em 0.3em 0.1em",
          borderRadius: "0.28em",
          border: "0.05em solid transparent",
          isolation: "isolate",
        }}
      >
        {lift ? (
          <span
            data-kinetic-run={lift}
            className={`kinetic-emphasis-mark kinetic-emphasis-run${
              lift === "halo"
                ? " kinetic-emph-halo"
                : lift === "sweep"
                  ? " kinetic-emph-sweep"
                  : lift === "underline"
                    ? " kinetic-emph-underline"
                    : ""
            }${staticRender ? "" : " is-animated"}`}
            style={
              {
                // The bar paints in currentColor, which must be the syllables' emphasis color.
                ...(lift === "underline"
                  ? {
                      color: getCanvasEmphasisWordColor(
                        lift,
                        textColor,
                        emphasisColor,
                        emphasisColorExact,
                      ),
                    }
                  : {}),
                "--kinetic-emphasis-delay": `${effectDelay.delay + effectDelay.duration + 0.18}s`,
                ...(lift === "halo" || lift === "glow"
                  ? { "--kinetic-aura-color": getAuraColor(textColor) }
                  : {}),
                animation: runAnimation
                  ? `${runAnimation} ${paused ? "paused" : "running"}`
                  : undefined,
              } as CSSProperties
            }
          >
            {children}
          </span>
        ) : (
          children
        )}
      </PausableRunFrame>
    );
  };

  if (!isVietnamese) {
    const groups = getEmphasisGroups(words, emphasized);
    const groupSet = new Set<number>();
    for (const g of groups) {
      for (let i = g.start; i < g.end; i++) groupSet.add(i);
    }

    return (
      <>
        {words.map((word, index) => {
          if (!groupSet.has(index)) return renderWord(word, index);

          const group = groups.find((g) => index >= g.start && index < g.end);
          if (!group || group.start !== index) return null;

          return renderRun(
            words.slice(group.start, group.end).map((text, offset) => ({
              text,
              index: group.start + offset,
            })),
            `frame-group-${index}`,
          );
        })}
      </>
    );
  }

  return (
    <>
      {vietnameseLines.map((line, lineIndex) => (
        <div
          key={`${lineIndex}-${line.indentEm}`}
          // Hook for the fit solver: a packed line is unbreakable, so its full width
          // (not just its widest word) has to fit the safe area.
          data-kinetic-line=""
          className="flex flex-nowrap items-baseline justify-start"
          style={{
            alignSelf: "stretch",
            boxSizing: "border-box",
            columnGap: `${segmentGapEm}em`,
            rowGap: `${0.08 * lineSpacingScale}em`,
            marginTop: lineIndex === 0 ? 0 : `${0.06 * lineSpacingScale}em`,
            minWidth: 0,
            paddingLeft: `${line.indentEm}em`,
            paddingRight: "2%",
            width: "100%",
          }}
        >
          {line.segments.map((segment) => {
            const flatWords = segment.words.map(({ text, index }) => ({ text, index }));
            const segGroups = getEmphasisGroups(
              flatWords.map((w) => w.text),
              emphasized,
              flatWords[0]?.index ?? 0,
            );
            const segGroupSet = new Set<number>();
            for (const g of segGroups) {
              for (let i = g.start; i < g.end; i++) segGroupSet.add(i);
            }

            return (
              <span
                key={segment.key}
                // Hook for the measured layout: a segment never breaks, so its drawn
                // width is the unit that has to be proven to fit before it is placed.
                data-kinetic-segment={segment.key}
                className="inline-flex flex-nowrap items-baseline whitespace-nowrap"
                style={{
                  columnGap: `${segmentGapEm}em`,
                  flex: "0 0 auto",
                  justifyContent: "flex-start",
                }}
              >
                {flatWords.map(({ text, index }, wi) => {
                  if (!segGroupSet.has(wi)) return renderWord(text, index, true);

                  const grp = segGroups.find((g) => wi >= g.start && wi < g.end);
                  if (!grp || grp.start !== wi) return null;

                  return renderRun(flatWords.slice(grp.start, grp.end), `v-frame-group-${index}`);
                })}
              </span>
            );
          })}
        </div>
      ))}
    </>
  );
}
