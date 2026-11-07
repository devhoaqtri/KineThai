/**
 * Paginated kinetic word sequence for the feed post player.
 *
 * Exports: WordSequenceText
 * Depends on: framer-motion, canvas colors, kinetic-text layout, feed-emphasis, entrances, playback-timing, WordSequenceLines, useWordSequenceFit
 */

import { motion } from "framer-motion";
import { useMemo, useRef, type ReactElement } from "react";
import {
  getCanvasEmphasisColor,
  getCanvasTextColor,
  getPhotoBackdropTextShadow,
  resolveTextColorOnPhotoBackdrop,
  type CanvasSpec,
  type Entrance,
} from "@/features/canvas";
import {
  getPunctuationPhraseEdges,
  getDataEmphasisWordSpans,
  getEmphasisPhraseKeysForLayout,
  getEmphasizedRunLayoutPhraseKeys,
  getEmphasizedRunPhraseKeys,
  getHanLayoutMetrics,
  getCompoundTokenKey,
  getHanTokens,
  getHanWordSpans,
  getJapaneseLayoutMetrics,
  getKineticTextLayoutMode,
  getLoopAnimation,
  getVietnameseLayoutMetrics,
  getWords,
  hasVisibleStickerAccent,
  isLikelyChineseText,
  isLikelyJapaneseText,
  isLikelyVietnameseText,
  type EmphasisVariant,
  VIETNAMESE_MAX_LINE_SYLLABLES,
} from "@/features/kinetic-text";
import { getEmphasizedWordIndexes } from "../lib/feed-emphasis";
import { getEntranceStyle } from "../lib/entrances";
import { EntranceClockContext, useEntranceClock } from "../hooks/usePausableEntrance";
import {
  EMPHASIS_FONT_SCALE,
  EMPHASIS_SCALE_FIT_GUARD,
  TEXT_SAFE_MAX_WIDTH,
  VIETNAMESE_SCALE_FIT_GUARD,
} from "../lib/playback-timing";
import { estimateSoloRevealFit } from "../lib/solo-text-fit";
import { useMeasuredLines, type MeasuredLayoutBudget } from "../hooks/useMeasuredLines";
import { useWordSequenceFit } from "../hooks/useWordSequenceFit";
import { WordSequenceLines } from "./WordSequenceLines";

export type WordSequenceTextProps = {
  spec: CanvasSpec;
  playKey: number;
  paused: boolean;
  revealed: boolean;
  canvasWidth: number;
  measure?: boolean;
  onFitScale?: (scale: number) => void;
  disableFit?: boolean;
  background?: string | null;
  photoBackdrop?: boolean;
  entranceSeed?: string;
  /**
   * Authored word entrance. Given, it replaces the personality auto-picked from
   * `entranceSeed`; omitted — every community post — the pick stays seed-driven, so
   * `spec.entrance` alone never changes how a post's words arrive.
   */
  entrance?: Entrance;
  fitAsUnit?: boolean;
  /**
   * Multiplier on the line-to-line advance. 1 keeps the renderer's own compact
   * display rhythm; a caller that needs reading air (the vocabulary card) passes
   * 1.2. Line pitch is made of two parts — `lineHeight` plus the explicit
   * per-line margin/gap — so both are scaled together and the requested factor is
   * the factor the reader actually gets. Never touches glyph width.
   */
  lineSpacingScale?: number;
  /** Optional upstream emphasis annotations; only phrases occurring in this page's text match. */
  dataEmphasis?: string[];
  /**
   * Phrases the source text marked as ONE word ("ba lô"). On a packed page each is an
   * unbreakable segment — it moves to the next line whole rather than leaving a syllable
   * behind — and a highlight never covers only part of one.
   */
  boundPhrases?: string[];
  /**
   * Optional second highlight drawn with its own effect. It bypasses both the
   * annotation budget and the per-language one-word cap, so a page can carry two
   * marks that read differently — the vocabulary letter-count clue boxes its
   * starting initial while the count keeps the primary mark.
   */
  secondaryEmphasis?: { phrase: string; variant: EmphasisVariant };
  /**
   * Whether an emphasised word may be drawn inside the box-shaped `frame`. The box adds
   * padding and a border around the word, which is height a landscape card does not
   * have; such a caller passes false and the frame is drawn as an underline. It also
   * applies to `secondaryEmphasis`. Defaults to true, so every other surface is unchanged.
   */
  allowFrameEmphasis?: boolean;
  /**
   * The highlight effects the emphasised words may draw from. A reveal style authors a short
   * pool so the effect reads as a property of the style; absent, the global pool applies and
   * every other surface looks exactly as it did.
   */
  emphasisPool?: readonly EmphasisVariant[];
  /**
   * Multiplier on how fast the words are read out — every word's start delay and its
   * entrance length, springs included. 1 keeps the tempo's own pace; the vocabulary
   * card raises it for a reader who picked a slower reading speed.
   */
  timeScale?: number;
  /**
   * Lay a Vietnamese page out from measured widths instead of the character-count
   * estimate: every unbreakable segment is measured as drawn, and the line breaks and
   * the font size are solved together inside these limits (see useMeasuredLines).
   * Omitted — every community post — the estimate-packed lines and the fit solver stand
   * exactly as before. Han pages keep their own packing either way.
   */
  measuredLayout?: MeasuredLayoutBudget;
  /**
   * Token indexes at which an authored phrase begins, for a page whose own text no
   * longer carries the mark (a Japanese `|` chunk). Merged into the layout's phrase
   * rule: a line ends on an edge when it can and never one 文節 beside one.
   */
  phraseEdges?: readonly number[];
};

/**
 * Render fitted kinetic words for one post text page.
 * @param props - WordSequenceTextProps fields
 * @returns Rendered UI
 */
export function WordSequenceText({
  spec,
  playKey,
  paused,
  revealed,
  canvasWidth,
  measure = false,
  onFitScale,
  disableFit = false,
  background,
  photoBackdrop = false,
  entranceSeed,
  entrance,
  fitAsUnit = false,
  lineSpacingScale = 1,
  dataEmphasis,
  boundPhrases,
  phraseEdges,
  secondaryEmphasis,
  allowFrameEmphasis = true,
  emphasisPool,
  timeScale = 1,
  measuredLayout,
}: WordSequenceTextProps): ReactElement {
  // A Han page tokenizes per character before anything else: a whole Chinese sample
  // sentence is one whitespace token, and as one token it rendered as a single
  // shrunken line. Split per glyph, it earns the Vietnamese treatment exactly —
  // packed staggered lines, same font size band, same scene filled with words.
  // A Japanese page is checked first: kanji-heavy clue text can look Chinese, but its
  // kana say it must pack per 文節 with no inter-word gap and never per glyph.
  const isJapanese = !fitAsUnit && isLikelyJapaneseText(spec.text);
  const isHan = !isJapanese && !fitAsUnit && isLikelyChineseText(spec.text);
  const words = useMemo(
    () => (fitAsUnit ? [spec.text.trim()] : isHan ? getHanTokens(spec.text) : getWords(spec.text)),
    [fitAsUnit, isHan, spec.text],
  );
  const isVietnamese =
    !isJapanese && !isHan && words.length > 1 && isLikelyVietnameseText(spec.text);
  // Vietnamese syllables, Han glyphs and Japanese 文節 share every downstream decision
  // that is not about glyph width: packed unbreakable lines, left anchor, tight leading,
  // and the packed-page fit floor. `fitAsUnit` pages (solo reveals) always stay one line.
  const isPackedLines = isVietnamese || isHan || isJapanese;
  const emphasized = useMemo(
    () => getEmphasizedWordIndexes(words, dataEmphasis, boundPhrases),
    [words, dataEmphasis, boundPhrases],
  );
  // Read the primitives, not the object, so a caller re-creating the literal each
  // render cannot churn the memo and rebuild the index set every frame.
  const secondaryPhrase = secondaryEmphasis?.phrase;
  const secondaryVariant = secondaryEmphasis?.variant;
  // Resolved against this page's own tokens, so a phrase pagination moved onto
  // another page simply matches nothing here.
  const secondaryEmphasized = useMemo(() => {
    if (!secondaryPhrase) return undefined;
    const indexes = new Set<number>();
    for (const span of getDataEmphasisWordSpans(words, [secondaryPhrase])) {
      for (let offset = 0; offset < span.length; offset += 1) indexes.add(span.start + offset);
    }
    return indexes.size > 0 ? indexes : undefined;
  }, [words, secondaryPhrase]);
  const hasEmphasis = emphasized.size > 0 || !!secondaryEmphasized?.size;
  // Annotated compounds act as bound phrases everywhere below: unbreakable line
  // segments plus one shared emphasis variant across all their syllables. The same
  // treatment is owed to every highlighted run, which the selection already decided
  // reads as one word — otherwise an unannotated compound can be packed apart and
  // each syllable hashes a different effect.
  const phraseKeys = useMemo(
    () => [
      ...getEmphasisPhraseKeysForLayout(dataEmphasis),
      ...getEmphasisPhraseKeysForLayout(boundPhrases),
      ...getEmphasizedRunPhraseKeys(words, emphasized),
    ],
    [dataEmphasis, boundPhrases, words, emphasized],
  );
  // What the packer may not break. The full keys above keep the shared effect for every
  // syllable of a run; a highlighted sweep of three or more tokens is not a compound
  // though, and gluing it whole can leave an eight-em block no page can set at reading
  // size. Those runs may split across lines — one effect either way. Authored joins
  // ("Phan_Xi_Păng") stay unbreakable at any length.
  const layoutPhraseKeys = useMemo(
    () => [
      ...getEmphasisPhraseKeysForLayout(dataEmphasis),
      ...getEmphasisPhraseKeysForLayout(boundPhrases),
      ...getEmphasizedRunLayoutPhraseKeys(words, emphasized),
      // A Han word stays whole across a line break, and that is all it means: unlike the
      // keys above it shares no effect, so it stays out of phraseKeys.
      ...(isHan
        ? getHanWordSpans(words).map((span) => span.map((token) => getCompoundTokenKey(token)))
        : []),
    ],
    [dataEmphasis, boundPhrases, words, emphasized, isHan],
  );
  const isSolo = words.length <= 1;
  const visualScaleGuard = Math.max(
    hasEmphasis && !isSolo ? EMPHASIS_SCALE_FIT_GUARD : 1,
    isPackedLines ? VIETNAMESE_SCALE_FIT_GUARD : 1,
  );
  const packedLayout = useMemo(
    () =>
      isPackedLines
        ? isJapanese
          ? getJapaneseLayoutMetrics(
              words,
              canvasWidth,
              spec.size,
              visualScaleGuard,
              layoutPhraseKeys,
            )
          : isHan
            ? getHanLayoutMetrics(words, canvasWidth, spec.size, visualScaleGuard, layoutPhraseKeys)
            : getVietnameseLayoutMetrics(
                words,
                canvasWidth,
                spec.size,
                visualScaleGuard,
                layoutPhraseKeys,
              )
        : { lines: [], suggestedFitScale: 1 },
    [
      isPackedLines,
      isJapanese,
      isHan,
      words,
      canvasWidth,
      spec.size,
      visualScaleGuard,
      layoutPhraseKeys,
    ],
  );
  const entranceStyle = getEntranceStyle(entranceSeed ?? spec.text, spec.rhythm, entrance);
  const layoutMode = getKineticTextLayoutMode(spec.text, isPackedLines, words.length, emphasized);
  const leftAnchoredText = layoutMode !== "center";
  const spotlightEmphasis = layoutMode === "left-spotlight";
  const soloInitialFit = isSolo
    ? estimateSoloRevealFit(
        spec.text,
        spec.size,
        canvasWidth,
        visualScaleGuard,
        spec.font,
        hasEmphasis ? 900 : spec.weight,
        hasEmphasis ? EMPHASIS_FONT_SCALE : 1,
      )
    : 1;
  const initialFit = isSolo
    ? soloInitialFit
    : isPackedLines && !disableFit
      ? packedLayout.suggestedFitScale
      : 1;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const staticRender = revealed || measure;
  // Everything that can change how wide a segment is drawn. The measured layout keeps
  // its measurements for as long as this stands.
  const measuredSignature = useMemo(
    () =>
      [
        spec.text,
        spec.font,
        spec.weight,
        spec.letterSpacing,
        lineSpacingScale,
        allowFrameEmphasis,
        [...emphasized].join(","),
        secondaryEmphasized ? [...secondaryEmphasized].join(",") : "",
        secondaryVariant ?? "",
        emphasisPool?.join(",") ?? "",
        phraseKeys.map((key) => key.join(" ")).join("|"),
      ].join("\u0001"),
    [
      spec.text,
      spec.font,
      spec.weight,
      spec.letterSpacing,
      lineSpacingScale,
      allowFrameEmphasis,
      emphasized,
      secondaryEmphasized,
      secondaryVariant,
      emphasisPool,
      phraseKeys,
    ],
  );
  // Where the page's phrases meet. Vietnamese reads the edges off its own punctuation —
  // a comma, full stop or semicolon closes the phrase it ends. Japanese carries them from
  // the deck's `|` chunks, because those marks are display-only and cannot survive in
  // `spec.text`. Either way a break is welcome right after an edge, never one word away.
  const layoutPhraseEdges = useMemo(
    () =>
      isJapanese
        ? phraseEdges
        : isPackedLines
          ? getPunctuationPhraseEdges(words)
          : undefined,
    [isJapanese, isPackedLines, phraseEdges, words],
  );
  const measuredLines = useMeasuredLines({
    budget: measuredLayout,
    enabled: (isPackedLines || isJapanese) && !measure,
    lines: packedLayout.lines,
    signature: measuredSignature,
    phraseEdges: layoutPhraseEdges,
    softPhraseEdges: isHan,
    // A Vietnamese line never holds more than four syllables; Han and Japanese text have no such cap.
    maxLineSyllables: isVietnamese ? VIETNAMESE_MAX_LINE_SYLLABLES : undefined,
    // Japanese 文節 are drawn flush; the gap belongs to spaced scripts only.
    segmentGapEm: isJapanese ? 0 : undefined,
    lineSpacingScale,
    wrapperRef,
    textRef,
  });
  // The words are mounted afresh whenever the breaks change. Moving a word to another
  // line remounts it on its own otherwise, part-way through an entrance its neighbours
  // are already running; starting the block again keeps every word on one clock.
  const layoutKey = measuredLines
    ? measuredLines.lines.map((line) => line.segments.length).join(".")
    : "estimate";
  const { fontSize, soloInlineScale, safeCenterY } = useWordSequenceFit({
    // A measured page arrives at its size already; the solver only places it.
    initialFit: measuredLines ? 1 : initialFit,
    measurementKey: `${playKey}-${staticRender}-${layoutKey}`,
    canvasWidth,
    background,
    spec: measuredLines ? { ...spec, size: measuredLines.fontSize } : spec,
    disableFit: (disableFit || !!measuredLines) && !isSolo,
    onFitScale,
    isSolo,
    isPackedLines,
    leftAnchoredText,
    visualScaleGuard,
    wrapperRef,
    textRef,
  });
  const textColor = photoBackdrop
    ? resolveTextColorOnPhotoBackdrop(spec)
    : getCanvasTextColor(spec, background);
  const emphasisColor = getCanvasEmphasisColor({ ...spec, color: textColor }, background);
  const photoTextShadow = photoBackdrop ? getPhotoBackdropTextShadow(textColor) : undefined;
  const textSafeMaxWidth = hasVisibleStickerAccent(spec.stickers, spec.text)
    ? "min(90%, calc(100% - 2.5rem))"
    : TEXT_SAFE_MAX_WIDTH;
  const loopAnimation = getLoopAnimation(spec.loop, spec.tempo);
  const entranceClock = useEntranceClock(paused, `${playKey}-${staticRender}`);

  return (
    <EntranceClockContext.Provider value={entranceClock}>
      <div
        ref={wrapperRef}
        aria-hidden={measure || undefined}
        className="pointer-events-none absolute select-none"
        style={{
          left: `${spec.x}%`,
          top: `${safeCenterY}%`,
          transform: "translate(-50%, -50%)",
          width: textSafeMaxWidth,
          maxWidth: textSafeMaxWidth,
          visibility: measure ? "hidden" : undefined,
        }}
      >
        <motion.div
          ref={textRef}
          key={`${playKey}-${staticRender ? "revealed" : "animated"}-${layoutKey}`}
          className={
            isPackedLines
              ? "flex flex-col items-stretch"
              : leftAnchoredText
                ? "flex flex-wrap items-baseline justify-start"
                : "flex flex-wrap items-center justify-center"
          }
          initial={staticRender ? false : "hidden"}
          animate="show"
          style={{
            width: "100%",
            // A solo page is one unbreakable span, so it cannot wrap anyway; naming the
            // intent keeps the single-line answer from depending on that accident.
            flexWrap: isSolo ? "nowrap" : undefined,
            columnGap: isPackedLines ? undefined : "0.34em",
            rowGap: isPackedLines ? undefined : `${0.08 * lineSpacingScale}em`,
            fontFamily: spec.font,
            fontSize,
            color: textColor,
            fontWeight: spec.weight,
            letterSpacing: `${spec.letterSpacing}em`,
            lineHeight: (isPackedLines ? 1.04 : 0.9) * lineSpacingScale,
            textAlign: leftAnchoredText ? "left" : "center",
            textShadow: photoTextShadow ?? "0 4px 40px rgba(0,0,0,0.45)",
            transform: `rotate(${spec.rotation}deg)`,
            animation: loopAnimation
              ? `${loopAnimation} ${paused ? "paused" : "running"}`
              : undefined,
          }}
        >
          <WordSequenceLines
            isVietnamese={isPackedLines}
            segmentGapEm={isJapanese ? 0 : undefined}
            lineSpacingScale={lineSpacingScale}
            vietnameseLines={measuredLines?.lines ?? packedLayout.lines}
            words={words}
            emphasized={emphasized}
            phraseKeys={phraseKeys}
            secondaryEmphasized={secondaryEmphasized}
            secondaryVariant={secondaryVariant}
            allowFrame={allowFrameEmphasis}
            pool={emphasisPool}
            spotlightEmphasis={spotlightEmphasis}
            spec={spec}
            staticRender={staticRender}
            paused={paused}
            isSolo={isSolo}
            soloInlineScale={soloInlineScale}
            leftAnchoredText={leftAnchoredText}
            textColor={textColor}
            emphasisColor={emphasisColor}
            entranceStyle={entranceStyle}
            timeScale={timeScale}
          />
        </motion.div>
      </div>
    </EntranceClockContext.Provider>
  );
}
