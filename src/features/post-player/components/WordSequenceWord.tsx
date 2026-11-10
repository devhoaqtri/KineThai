/**
 * Single animated word span for the feed WordSequenceText player.
 *
 * Exports: WordSequenceWord
 * Depends on: framer-motion, lib/canvas emphasis colors, kinetic-text emphasis, entrances, playback-timing
 */

import { motion } from "framer-motion";
import { useMemo, type CSSProperties, type ReactElement } from "react";
import { getCanvasEmphasisWordColor, type CanvasSpec } from "@/features/canvas";
import {
  getAuraColor,
  getBoundPhraseStartIndex,
  getEmphasisInnerAnimation,
  getEmphasisTextShadow,
  getJapaneseMoraTokens,
  getWordAnchorKey,
  isLikelyJapaneseText,
  restrictOutlineToJapanese,
  type EmphasisVariant,
} from "@/features/kinetic-text";
import { resolveWordEmphasisVariant } from "../lib/emphasis-variant";
import {
  getEntranceRest,
  getEntranceHidden,
  getEntranceTransition,
  type ResolvedEntranceStyle,
} from "../lib/entrances";
import {
  EMPHASIS_FONT_SCALE,
  getMoraDelay,
  getWordDelay,
  tempoConfig,
} from "../lib/playback-timing";
import { usePausableEntrance } from "../hooks/usePausableEntrance";
import { JapaneseMoraSpan } from "./JapaneseMoraSpan";

export type WordSequenceWordProps = {
  word: string;
  index: number;
  words: string[];
  spec: CanvasSpec;
  emphasized: Set<number>;
  /** Data-annotated phrase keys treated as bound phrases for shared emphasis styling. */
  phraseKeys?: readonly (readonly string[])[];
  /**
   * Caller-forced second highlight, rendered with its own variant instead of the
   * seeded pick. Lets one page carry two marks that read as different effects —
   * the vocabulary letter-count clue boxes its initial while the count keeps the
   * usual treatment. Single-token by design: multi-token runs are not grouped
   * into a shared frame wrapper.
   */
  secondaryEmphasized?: Set<number>;
  secondaryVariant?: EmphasisVariant;
  spotlightEmphasis: boolean;
  suppressSpotlight?: boolean;
  staticRender: boolean;
  paused: boolean;
  isSolo: boolean;
  soloInlineScale: number;
  leftAnchoredText: boolean;
  textColor: string;
  emphasisColor: string;
  /** `emphasisColor` came from the surface's own palette: words take it as given. */
  emphasisColorExact?: boolean;
  entranceStyle: ResolvedEntranceStyle;
  skipFrame?: boolean;
  /** False where the box-drawing frame is not allowed; it is drawn as an underline. */
  allowFrame?: boolean;
  /** The effects this slot may draw from; absent means the global pool. */
  pool?: readonly EmphasisVariant[];
  /**
   * The enclosing run draws this word's moving effect (sweep, halo, glow, pulse,
   * jiggle) once across all of its syllables, so the word must not draw its own.
   */
  runEffect?: boolean;
  /**
   * The effect the whole run this word belongs in was dressed in. Handed down instead of
   * re-hashed per syllable, because a syllable's own seed only names the compound when the
   * pair is in the curated list; otherwise two syllables of one word pick two effects.
   */
  sharedVariant?: EmphasisVariant;
  /** Multiplier on the entrance's delay and length; above 1 reads the page out slower. */
  timeScale?: number;
};

/**
 * Render one kinetic word with feed entrance + emphasis styling.
 * @param props - WordSequenceWordProps fields
 * @returns Rendered UI
 */
export function WordSequenceWord({
  word,
  index,
  words,
  spec,
  emphasized,
  phraseKeys,
  secondaryEmphasized,
  secondaryVariant,
  spotlightEmphasis,
  suppressSpotlight = false,
  staticRender,
  paused,
  isSolo,
  soloInlineScale,
  leftAnchoredText,
  textColor,
  emphasisColor,
  emphasisColorExact = false,
  entranceStyle,
  skipFrame = false,
  allowFrame = true,
  pool,
  runEffect = false,
  sharedVariant,
  timeScale = 1,
}: WordSequenceWordProps): ReactElement {
  const hasGlyph = /\p{L}|\p{N}/u.test(word);
  // A masked answer ("_____", possibly with trailing punctuation) is split so the
  // run of underscores carries its own hook. The glyphs and their width are
  // untouched — a surface that wants the blank to read as a live slot rather than
  // five inert underscores styles `[data-kinetic-blank]`; everywhere else it
  // renders exactly as before.
  const blank = hasGlyph ? null : /^(_{2,})(.*)$/u.exec(word);
  // A token with no letter/number — trailing punctuation, or a masked "_____" answer
  // blank — can still be handed to us by the emphasis sets. Framing it would draw an
  // empty highlight box around nothing, so the resolver returns null for it whichever
  // selection path (heuristic, fallback, data annotation, secondary, poetic) proposed
  // it. A shared multi-syllable run shows a box-drawing `frame` as a continuous
  // underline; a lone `frame` word keeps its box.
  // Inside a run the group's effect is handed down rather than re-hashed from this
  // syllable: a syllable seeds from the curated phrase list, so a compound missing from
  // it would give each of its halves a different effect.
  const displayVariant = restrictOutlineToJapanese(
    word,
    (hasGlyph ? sharedVariant : undefined) ??
      resolveWordEmphasisVariant({
        word,
        index,
        words,
        text: spec.text,
        emphasized,
        phraseKeys,
        secondaryEmphasized,
        secondaryVariant,
        emphasisColor,
        inRun: skipFrame,
        allowFrame,
        pool,
      }),
  );
  const important = displayVariant !== null;
  const primary = important && emphasized.has(index);
  // A secondary mark is caller-forced and never drives the spotlight layout, so
  // adding one cannot re-centre the page or claim a full-width line.
  const spotlightWord = spotlightEmphasis && primary && !suppressSpotlight;
  const emphasisAnchorIndex = important
    ? getBoundPhraseStartIndex(words, index, phraseKeys)
    : index;
  // When the run this word sits in draws the effect once across all its syllables,
  // the word keeps its color and weight but adds no moving effect of its own.
  const ownEffect = runEffect ? null : displayVariant;
  const wordColor = important
    ? getCanvasEmphasisWordColor(displayVariant, textColor, emphasisColor, emphasisColorExact)
    : textColor;
  const entranceDelay = staticRender
    ? 0
    : getWordDelay(important ? emphasisAnchorIndex : index, spec.tempo, spec.rhythm) * timeScale;
  const tempo = tempoConfig[spec.tempo];
  const rhythmDurationMultiplier = spec.rhythm === "poetic" ? 1.28 : 1;
  const entranceDuration = staticRender
    ? 0.01
    : (important ? tempo.wordDuration * 1.22 : tempo.wordDuration) *
      rhythmDurationMultiplier *
      timeScale;
  // A Japanese page reveals mora by mora instead of one whole 文節 at a time, including
  // when the page is a single 文節. Layout, pagination and emphasis all stay per-文節;
  // only the entrance is split, into one JapaneseMoraSpan per glyph, paced on a single
  // cascade across the whole page. A syllable inside a shared run inherits the run's
  // group fade (skipFrame) instead of animating twice.
  const isJapanesePage = isLikelyJapaneseText(spec.text);
  const moraUnits = isJapanesePage ? getJapaneseMoraTokens(word) : null;
  const splitMora = !!moraUnits && moraUnits.length > 1 && !skipFrame;
  // Global mora index of this 文節's first mora, so the cascade is continuous page-wide.
  const moraBase = useMemo(() => {
    if (!isJapanesePage) return 0;
    let total = 0;
    for (let i = 0; i < index; i += 1) total += getJapaneseMoraTokens(words[i] ?? "").length;
    return total;
  }, [isJapanesePage, index, words]);
  // The emphasis effect fires once the whole 文節 has landed: after the word entrance, or
  // after the LAST mora when the page reveals syllable by syllable.
  const effectAnchorDelay =
    splitMora && moraUnits
      ? getMoraDelay(moraBase + moraUnits.length - 1, spec.tempo, spec.rhythm) * timeScale
      : entranceDelay;
  const emphasisStyle = important
    ? ({
        "--kinetic-emphasis-delay": `${effectAnchorDelay + entranceDuration + 0.18}s`,
        ...(displayVariant === "halo" || displayVariant === "glow"
          ? { "--kinetic-aura-color": getAuraColor(textColor) }
          : {}),
      } as CSSProperties)
    : undefined;
  const innerAnimation =
    important && !staticRender ? getEmphasisInnerAnimation(ownEffect) : undefined;
  const isSoloRevealWord = isSolo;
  const hidden = getEntranceHidden(entranceStyle, important, index);
  const safeHidden = isSolo
    ? { ...hidden, x: 0, rotate: 0, scale: Math.min(Number(hidden.scale ?? 1), 1) }
    : hidden;
  const entranceTransition = isSolo
    ? { delay: entranceDelay, duration: entranceDuration, ease: [0.22, 1, 0.36, 1] as const }
    : getEntranceTransition(entranceStyle, entranceDelay, entranceDuration, timeScale);
  // The entrance pauses with the page (an overlay covering the feed) instead of playing
  // on unseen underneath it. Static renders and run syllables keep inheriting the parent,
  // and a mora-split 文節 delegates the entrance to its JapaneseMoraSpan children.
  const ownsEntrance = !staticRender && !skipFrame && !splitMora;
  const entranceControls = usePausableEntrance("show", entranceTransition, ownsEntrance);
  return (
    <motion.span
      key={`${word}-${index}`}
      data-kinetic-word={getWordAnchorKey(word)}
      data-kinetic-word-index={index}
      // Inside a shared run (`skipFrame`), the run wrapper already fades the whole
      // compound in as one unit and owns the moving effect. This syllable span also
      // carries `variants` yet inherits the wrapper's OBJECT animation, and that mix
      // can strand it at its `hidden` opacity:0 when a resume remount (rotate-back,
      // staticRender flip) keeps restarting its delayed entrance — leaving the frame/
      // halo effect on the wrapper visible while the glyph itself is invisible. Skip
      // the per-syllable opacity entrance and let the wrapper's group fade carry it.
      initial={skipFrame ? false : ownsEntrance ? "hidden" : undefined}
      animate={ownsEntrance ? entranceControls : undefined}
      variants={{
        // The starting pose comes from the post's auto-picked entrance style;
        // every style settles to the shared neutral rest below. Emphasis size
        // is applied via fontSize (not scale), so settling to scale 1 keeps the
        // enlarged word from overlapping its neighbors.
        hidden: safeHidden,
        // Carries `filter` only when this entrance actually blurred, so a word that never
        // blurred is not left sitting under a filter that clips its own shadow.
        show: getEntranceRest(safeHidden),
      }}
      transition={entranceTransition}
      className={important ? "relative inline-flex" : "inline-flex"}
      style={{
        color: wordColor,
        display: spotlightWord ? "inline-flex" : "inline-block",
        flexShrink: 0,
        flexBasis: spotlightWord ? "100%" : undefined,
        justifyContent: spotlightWord ? "center" : undefined,
        textAlign: spotlightWord ? "center" : undefined,
        // NOT the emphasis font scale — that lives on the innermost glyph span, below.
        // Every `em` written on this element (the breathing margins) and on the effect
        // span inside it (the frame's padding, the underline's bar) has to mean the same
        // length as an `em` anywhere else on the line. Declaring the scale here made all
        // of them 12% longer than they were written, which is the extra air that showed
        // up around a highlighted word mid-sentence.
        fontWeight: important ? 900 : spec.weight,
        overflowWrap: "normal",
        whiteSpace: "nowrap",
        wordBreak: "normal",
        textShadow: important
          ? getEmphasisTextShadow(displayVariant)
          : "0 4px 40px rgba(0,0,0,0.45)",
        animationPlayState: paused ? "paused" : "running",
        transformOrigin: leftAnchoredText && !spotlightWord ? "left center" : "center",
        // A spotlight word is on its own line, so these open space above and below it,
        // not between words.
        marginTop: spotlightWord ? "0.08em" : undefined,
        marginBottom: spotlightWord ? "0.08em" : undefined,
        // No horizontal breathing margin. An emphasised word used to claim 0.04em on each
        // side ON TOP of the line's word gap, which is what made the space around a
        // highlight read wider than a space anywhere else in the sentence. It is not
        // needed: the glyphs are set EMPHASIS_FONT_SCALE larger, so their own side
        // bearings grow with them and the separation already scales. The line's 0.24em
        // gap is the one rule for the space between two words, and it now governs every
        // pair of them, highlighted or not.
      }}
    >
      <span
        style={{
          display: "inline-block",
          transform: isSoloRevealWord ? `scaleX(${soloInlineScale})` : undefined,
          transformOrigin: "center",
        }}
      >
        <span
          data-kinetic-glyph=""
          className={
            important
              ? `kinetic-emphasis-mark${
                  ownEffect === "halo"
                    ? " kinetic-emph-halo"
                    : ownEffect === "frame"
                      ? // Only a lone word reaches here — a grouped `frame` was already
                        // downgraded to `underline` via displayVariant above.
                        " kinetic-emph-frame"
                      : ownEffect === "underline"
                        ? // Lone words only: a shared run draws one bar across the whole
                          // compound on its wrapper (see RUN_LEVEL_VARIANTS).
                          " kinetic-emph-underline"
                        : ownEffect === "sweep"
                          ? " kinetic-emph-sweep"
                          : // A hollow word filling with ink: one-shot draw, no class needed for
                            // the movers that ride in on `animation` below.
                            ownEffect === "outline"
                            ? " kinetic-emph-outline"
                            : ""
                }${staticRender ? "" : " is-animated"}`
              : undefined
          }
          style={{
            ...emphasisStyle,
            animation: innerAnimation
              ? `${innerAnimation} ${paused ? "paused" : "running"}`
              : undefined,
          }}
        >
          {/* The emphasis scale lives here, on the glyphs alone, and nowhere above:
              an inline-block sizes itself to the larger text and grows the line box
              with it, so nothing is cropped, while every spacing length outside it
              keeps resolving against the line's own font size. */}
          <span
            style={{
              display: "inline-block",
              fontSize: important ? `${EMPHASIS_FONT_SCALE}em` : undefined,
            }}
          >
            {splitMora && moraUnits ? (
              moraUnits.map((unit, moraIndex) => (
                <JapaneseMoraSpan
                  key={`${index}-${moraIndex}-${unit}`}
                  unit={unit}
                  entranceStyle={entranceStyle}
                  important={important}
                  wordIndex={index}
                  delay={getMoraDelay(moraBase + moraIndex, spec.tempo, spec.rhythm) * timeScale}
                  duration={entranceDuration}
                  timeScale={timeScale}
                  staticRender={staticRender}
                />
              ))
            ) : blank ? (
              <>
                <span data-kinetic-blank="">{blank[1]}</span>
                {blank[2]}
              </>
            ) : (
              word
            )}
          </span>
        </span>
      </span>
    </motion.span>
  );
}
