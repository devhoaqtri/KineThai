/** Readable clue text and reveal detail, reusing existing kinetic primitives. Exports: VocabularyStage. Depends on: canvas, kinetic-text, stages, motion tokens. */
import { useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion, type MotionValue, type Variants } from "framer-motion";
import type { CanvasSpec } from "@/features/canvas";
import { WordSequenceText } from "@/features/post-player";
import type { EmphasisVariant } from "@/features/kinetic-text";
import { EASE, SPRING } from "@/lib/motion";
import type { VocabularyWord } from "../lib/schema";
import type { LearningStage } from "../lib/stages";
import { resolveClue } from "../lib/clues";
import { t } from "../lib/ui-copy";
import { useLocale } from "../lib/useLocale";
import { VOCAB_LINE_SPACING_SCALE } from "../lib/presets";
import { FilledUsage, MarkedText } from "./MarkedText";
import { RevealBurst } from "./RevealBurst";
import { ShareChallengeButton } from "./ShareChallengeButton";
import { WordGrammar } from "./WordGrammar";
import { WordPronunciation } from "./WordPronunciation";

/** Horizontal travel of a clue page as it arrives and leaves, in px. */
const PAGE_ENTER_OFFSET = 34;
const PAGE_EXIT_OFFSET = 52;
/** Beat of stillness before the answer lands, so the reveal reads as an event. */
const REVEAL_HOLD_SECONDS = 0.14;
/** The meaning follows the word instead of competing with it. */
const DETAILS_DELAY_SECONDS = 0.34;

type PageMotion = { direction: number; reveal: boolean };

/**
 * A clue page slides in from the side the reader is heading towards and leaves
 * the other way, so paging has a direction instead of a cross-fade. The outgoing
 * page is quicker than the incoming one and the two overlap — the old sequential
 * fade spent almost half a second per page showing nothing at all.
 *
 * The answer is the exception: it does not slide, it lands — a short hold, then
 * an overshooting spring.
 */
const PAGE_VARIANTS: Variants = {
  enter: ({ direction, reveal }: PageMotion) =>
    reveal ? { opacity: 0, scale: 0.72 } : { opacity: 0, x: direction * PAGE_ENTER_OFFSET },
  center: ({ reveal }: PageMotion) => ({
    opacity: 1,
    x: 0,
    scale: 1,
    transition: reveal
      ? {
          scale: { ...SPRING.bouncy, delay: REVEAL_HOLD_SECONDS },
          opacity: { duration: 0.16, delay: REVEAL_HOLD_SECONDS },
        }
      : { x: SPRING.gentle, opacity: { duration: 0.22, ease: EASE.out } },
  }),
  exit: ({ direction }: PageMotion) => ({
    opacity: 0,
    x: direction * -PAGE_EXIT_OFFSET,
    transition: { duration: 0.18, ease: EASE.in },
  }),
};

/** The band has no motion of its own; it exists to pass these states to the page inside. */
const BAND_VARIANTS: Variants = { enter: {}, center: {}, exit: {} };

const STILL_VARIANTS: Variants = {
  enter: { opacity: 1 },
  center: { opacity: 1 },
  exit: { opacity: 0, transition: { duration: 0 } },
};

/**
 * One page's kinetic text, with the animate-or-not decision made ONCE, when the page
 * arrives.
 *
 * WordSequenceText keys its whole subtree on `revealed`, so flipping that prop remounts the
 * text. It used to be passed `!playing` live: pausing swapped the text for its static twin
 * and resuming swapped it back to a fresh animated one, which replayed the entrance from
 * the first word. The page is mounted under a key of its own (stage + play count), so a
 * value latched in state here lasts exactly as long as the page does — a page that arrives
 * while nothing is playing (autoplay off, pages turned by hand) is still shown at once,
 * and one that arrives playing keeps its entrance no matter what pauses it afterwards.
 */
function StageText({
  playing,
  reducedMotion,
  ...text
}: {
  playing: boolean;
  reducedMotion: boolean;
} & Pick<
  React.ComponentProps<typeof WordSequenceText>,
  | "spec"
  | "playKey"
  | "canvasWidth"
  | "background"
  | "entranceSeed"
  | "entrance"
  | "fitAsUnit"
  | "dataEmphasis"
  | "boundPhrases"
  | "phraseEdges"
  | "secondaryEmphasis"
  | "allowFrameEmphasis"
  | "emphasisPool"
  | "timeScale"
  | "measuredLayout"
>) {
  const [still] = useState(reducedMotion || !playing);
  return (
    <WordSequenceText
      {...text}
      paused={!playing}
      revealed={still || reducedMotion}
      lineSpacingScale={VOCAB_LINE_SPACING_SCALE}
    />
  );
}

/** Render only the current clue; answer details mount only on reveal. @param props Stage and presentation. @returns Accessible text. */
export function VocabularyStage({
  stage,
  word,
  spec,
  background,
  canvasWidth,
  active,
  staged,
  playing,
  reducedMotion,
  playKey,
  direction,
  dragX,
  allowFrameEmphasis,
  emphasisPool,
  revealY,
  timeScale = 1,
  textBudget,
  onGrammarHold,
}: {
  stage: LearningStage;
  word: VocabularyWord;
  spec: CanvasSpec;
  background: string;
  canvasWidth: number;
  active: boolean;
  /**
   * Whether the page's text is on stage. True from this card's first play until the reader
   * leaves the word, so a pause (which drops `active`) leaves the text exactly as it is.
   */
  staged: boolean;
  playing: boolean;
  reducedMotion: boolean;
  playKey: number;
  /** 1 when the reader moved forward to this page, -1 when they stepped back. */
  direction: number;
  /** Live horizontal offset while a finger is dragging the page. */
  dragX: MotionValue<number>;
  /** False on a landscape card, where the boxed highlight is drawn as an underline. */
  allowFrameEmphasis: boolean;
  /** The highlight effects the reveal style authored for itself. */
  emphasisPool?: readonly EmphasisVariant[];
  /**
   * Where the answer sits, as a percentage of its band's height. Portrait uses the fixed
   * 34% the card was designed at; a wide card passes the centre of the shorter band the
   * stylesheet gives the word there.
   */
  revealY: number;
  /** Reading-pace stretch on the words' read-out; matches the page-duration stretch. */
  timeScale?: number;
  /**
   * Limits for a clue page's measured layout: its largest font and its vertical budget.
   * With them, a Vietnamese clue is broken into lines from the real width of its words.
   */
  textBudget?: React.ComponentProps<typeof WordSequenceText>["measuredLayout"];
  /** The reader opened (true) or closed (false) the answer's grammar section by hand. */
  onGrammarHold?: (held: boolean) => void;
}) {
  const locale = useLocale();
  const details = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (details.current) details.current.scrollTop = 0;
  }, [stage.id, playKey]);
  const pageMotion: PageMotion = { direction, reveal: !!stage.reveal };
  return (
    <motion.div
      className="vocab-stage"
      style={{ x: dragX }}
      aria-live={active ? "polite" : "off"}
      aria-atomic="true"
    >
      <p className="sr-only" lang={stage.lang}>
        {stage.text}
      </p>
      {stage.reveal && staged && !reducedMotion && <RevealBurst key={playKey} />}
      {/* No `initial={false}` here. It read as "do not slide the first page in", but
          AnimatePresence hands that flag to EVERY motion component underneath, so on a card
          that was born playing — the first word of a stream, whenever its fonts were ready
          before its data — the whole page, words included, was painted finished and never
          animated. Every later card dodged it only because it mounts off screen first. */}
      <AnimatePresence custom={pageMotion}>
        {staged && (
          // Two layers per page. The outer BAND is the box the text is fitted to — the
          // fit pipeline reads its height — and it never transforms, so the page's
          // entrance scale cannot distort that reading. It only relays the page's
          // enter/centre/exit state to the inner layer, which does the moving. On a wide
          // card the stylesheet shrinks the answer page's band to the share of the
          // height the word is allowed, which is what keeps it clear of the meaning panel.
          <motion.div
            key={`${stage.id}-${playKey}`}
            className="vocab-stage-band"
            data-reveal={stage.reveal ? "" : undefined}
            custom={pageMotion}
            variants={BAND_VARIANTS}
            initial="enter"
            animate="center"
            exit="exit"
          >
            <motion.div
              className="vocab-stage-text"
              lang={stage.lang}
              aria-hidden="true"
              custom={pageMotion}
              variants={reducedMotion ? STILL_VARIANTS : PAGE_VARIANTS}
            >
              {/* Deck emphasis annotations for the whole word are passed every stage;
                  exact phrase matching keeps only the ones occurring in this stage's
                  text, so unrelated annotations never glow. The letter-count clue also
                  sends a second mark (its starting initial) drawn with its own effect.
                  A clue page's text block stays still (loop: "none") — a page of clue
                  text that bobs forever is harder to read; the life is in the backdrop
                  and in the emphasised word. The answer is one word and nothing is left
                  to read off it, so there the reveal style's own loop plays. */}
              <StageText
                spec={{
                  ...spec,
                  y: stage.reveal ? revealY : 46,
                  loop: stage.reveal ? spec.loop : "none",
                }}
                playKey={playKey}
                playing={playing}
                reducedMotion={reducedMotion}
                canvasWidth={canvasWidth}
                background={background}
                // The seed still varies the two poetic reveals from word to word; every
                // other rhythm arrives the way its reveal style says.
                entranceSeed={word.id}
                entrance={spec.entrance}
                fitAsUnit={!!stage.reveal}
                dataEmphasis={stage.dataEmphasis}
                boundPhrases={stage.boundPhrases}
                phraseEdges={stage.phraseEdges}
                secondaryEmphasis={stage.secondaryEmphasis}
                allowFrameEmphasis={allowFrameEmphasis}
                emphasisPool={emphasisPool}
                timeScale={timeScale}
                // The answer is one word fitted as a unit; only clue pages are broken
                // into lines.
                measuredLayout={stage.reveal ? undefined : textBudget}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {stage.reveal && (
        <motion.div
          className="vocab-reveal-details"
          tabIndex={0}
          aria-label={t(locale, "stage.details")}
          initial={reducedMotion ? false : { opacity: 0, y: 30, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={
            reducedMotion ? { duration: 0 } : { ...SPRING.gentle, delay: DETAILS_DELAY_SECONDS }
          }
        >
          {/* The text scrolls in here, not on the panel itself, so the share leaf
              seated in the panel's corner stays put instead of scrolling away with
              the definition. `details` follows the scroller, because its one job is
              resetting scrollTop when the word changes. */}
          <div className="vocab-reveal-scroll" ref={details}>
            <WordPronunciation word={word} showPos />
            {/* The gloss, not the definition. `defVi` is written to work as a CLUE
                before the answer is known — a sentence describing the word without
                naming it — and that is the wrong register once the reader can see the
                word: they want the equivalent, not a description. Decks authored before
                `meaningVi` existed fall back to the sentence they do have. */}
            <p className="vocab-meaning" lang={locale}>
              <MarkedText
                text={
                  locale === "ja" && word.meaningJP
                    ? word.meaningJP
                    : word.meaningVi || resolveClue(word, "def", locale)
                }
              />
            </p>
            {word.usage.map((example, index) => (
              <div className="vocab-example" key={index}>
                {/* A Han deck writes this sentence in Chinese, and `lang` picks its glyphs. */}
                <p lang={stage.lang}>
                  <FilledUsage text={example.en} word={word.word} />
                </p>
              </div>
            ))}
            {word.grammar && (
              <WordGrammar
                grammar={word.grammar}
                reducedMotion={reducedMotion}
                onHold={onGrammarHold}
              />
            )}
          </div>
          <ShareChallengeButton code={word.shareCode} />
        </motion.div>
      )}
    </motion.div>
  );
}
