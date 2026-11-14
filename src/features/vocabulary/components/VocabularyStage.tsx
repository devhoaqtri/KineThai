/** Readable clue text and reveal detail, reusing existing kinetic primitives. Exports: VocabularyStage. Depends on: canvas, kinetic-text, stages, motion tokens. */
import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { AnimatePresence, motion, type MotionValue, type Variants } from "framer-motion";
import type { CanvasSpec } from "@/features/canvas";
import { WordSequenceText } from "@/features/post-player";
import type { EmphasisVariant } from "@/features/kinetic-text";
import { EASE, SPRING } from "@/lib/motion";
import type { VocabularyWord } from "../lib/schema";
import type { LearningStage } from "../lib/stages";
import { VOCAB_LINE_SPACING_SCALE } from "../lib/presets";
import { pickBurstVariant } from "../lib/burst-variants";
import { posLabelEn, posLabelVi } from "../lib/i18n";
import { ANSWER_HEAD_PX, allocateAnswer, type AnswerAllocation } from "../lib/answer-allocation";
import { FilledUsage, MarkedText } from "./MarkedText";
import { RevealBurst } from "./RevealBurst";
import { ShareChallengeButton } from "./ShareChallengeButton";
import { WordGrammar } from "./WordGrammar";

/** Horizontal travel of a clue page as it arrives and leaves, in px. */
const PAGE_ENTER_OFFSET = 34;
const PAGE_EXIT_OFFSET = 52;
/** Beat of stillness before the answer lands, so the reveal reads as an event. */
const REVEAL_HOLD_SECONDS = 0.14;
/**
 * The burst's clock starts this long after the answer page mounts, so its inhale begins as
 * the word fades in and its release lands with the word's spring, not on the outgoing clue.
 */
const BURST_LEAD_SECONDS = REVEAL_HOLD_SECONDS + 0.06;
/** The meaning follows the word instead of competing with it. */
const DETAILS_DELAY_SECONDS = 0.34;
/**
 * Clearance between the answer's layout box and the meaning panel. Landscape uses the
 * same 16px as its own seam (--vocab-reveal-seam).
 */
const PANEL_SEAM_PX = 16;
/** Clear space between text inside the meaning panel and the top-right share button. */
const SHARE_TEXT_GAP_PX = 6;

/**
 * The share tab sits at the panel's top-right (`data-share-top`); this
 * returns the right-float box that keeps the first lines of text clear of that button.
 */
function useShareTopFloat({
  panel,
  scroll,
  enabled,
}: {
  panel: RefObject<HTMLElement | null>;
  scroll: RefObject<HTMLElement | null>;
  enabled: boolean;
}): { width: number; height: number } | null {
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const element = panel.current;
    if (!enabled || !element) {
      setBox(null);
      return;
    }
    let key = "";
    const measure = () => {
      const scroller = scroll.current;
      const button = element.querySelector<HTMLElement>(".vocab-share-button");
      const dock = button?.parentElement;
      if (!scroller || !button || !dock) {
        if (key !== "") {
          key = "";
          setBox(null);
        }
        return;
      }
      const borderTop = element.clientTop;
      const borderLeft = element.clientLeft;
      const borderRight = element.offsetWidth - borderLeft - element.clientWidth;
      const shareBottom = borderTop + dock.offsetHeight;
      const shareLeft = element.offsetWidth - borderRight - button.offsetWidth;
      const top = scroller.offsetTop + borderTop;
      const right = scroller.offsetLeft + borderLeft + scroller.clientWidth;
      // Only as deep as the text itself so the float never stretches a short scroller.
      let rows = 0;
      for (const child of Array.from(scroller.children) as HTMLElement[]) {
        if (child.classList.contains("vocab-reveal-share-float")) continue;
        rows = Math.max(rows, child.offsetTop - scroller.offsetTop + child.offsetHeight);
      }
      rows = Math.min(rows, scroller.clientHeight);
      const width = Math.ceil(Math.max(0, right - (shareLeft - SHARE_TEXT_GAP_PX)));
      const height = Math.min(rows, Math.ceil(Math.max(0, shareBottom - top + 1)));
      const next = width > 0 && height > 0 ? { width, height } : null;
      const nextKey = next ? `${next.width}x${next.height}` : "";
      if (nextKey === key) return;
      key = nextKey;
      setBox(next);
    };
    measure();
    const frame = requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [panel, scroll, enabled]);
  return box;
}

/**
 * The panel top that sets its first divider (the rule over the example, or over the grammar
 * row when there is no example) through the saved drawer tab's vertical centre, in the
 * panel's offsetParent coordinates, or null when there is no visible tab or no divider.
 * Read from layout boxes, not painted rects, because the panel springs in under a scale.
 */
function tabAlignedPanelTop(panel: HTMLElement): number | null {
  const handle = document.querySelector<HTMLElement>(
    ".vocab-saved-dock:not([data-hidden]) .vocab-saved-handle",
  );
  const parent = panel.offsetParent as HTMLElement | null;
  const scroller = panel.querySelector<HTMLElement>(":scope > .vocab-reveal-scroll");
  const divider = scroller?.querySelector<HTMLElement>(
    ":scope > :is(.vocab-example, .vocab-grammar)",
  );
  if (!handle || !parent || !scroller || !divider) return null;
  const handleRect = handle.getBoundingClientRect();
  if (handleRect.height === 0) return null;
  let offset = 0;
  for (let el: HTMLElement | null = divider; el !== panel; el = el.offsetParent as HTMLElement) {
    if (!el) return null;
    offset += el.offsetTop;
  }
  // offsetTop is measured from the panel's padding edge; the panel's `top` places its border.
  offset += panel.clientTop - scroller.scrollTop;
  const tabMid =
    handleRect.top + handleRect.height / 2 - parent.getBoundingClientRect().top - parent.clientTop;
  return tabMid - offset;
}

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
  | "secondaryEmphasis"
  | "allowFrameEmphasis"
  | "emphasisPool"
  | "accentColor"
  | "timeScale"
  | "measuredLayout"
  | "fitInsets"
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
  still = false,
  playKey,
  direction,
  dragX,
  allowFrameEmphasis,
  emphasisPool,
  accentColor,
  revealY,
  timeScale = 1,
  textBudget,
  expandGrammar = false,
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
  /** A still image: the page is painted finished, with no entrance, loop or burst. */
  still?: boolean;
  playKey: number;
  /** 1 when the reader moved forward to this page, -1 when they stepped back. */
  direction: number;
  /** Live horizontal offset while a finger is dragging the page. */
  dragX: MotionValue<number>;
  /** False on a landscape card, where the boxed highlight is drawn as an underline. */
  allowFrameEmphasis: boolean;
  /** The highlight effects the reveal style authored for itself. */
  emphasisPool?: readonly EmphasisVariant[];
  /** The colour highlighted words take; absent, the player picks one (a deep card). */
  accentColor?: string;
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
  /** The reader's Settings choice to open the answer's grammar section on every word. */
  expandGrammar?: boolean;
  /** The reader opened (true) or closed (false) the answer's grammar section by hand. */
  onGrammarHold?: (held: boolean) => void;
}) {
  const details = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [panelTop, setPanelTop] = useState<number | null>(null);
  /**
   * The answer page's height shared out when the word and the panel do not both fit as
   * laid out (lib/answer-allocation): the box the word is fitted into, in its band's
   * coordinates, and the panel's text scale.
   */
  const [answerFit, setAnswerFit] = useState<{
    word: { top: number; bottom: number; y: number } | null;
    panelScale: number;
  } | null>(null);
  useLayoutEffect(() => {
    if (details.current) details.current.scrollTop = 0;
  }, [stage.id, playKey]);
  /**
   * The meaning panel starts under the answer, not on a fixed midline. The answer is
   * fitted per word, so a short one leaves the lower half mostly empty while a tall one
   * comes within a few pixels of the 50% mark. Measuring the answer's layout box lets
   * the panel take whatever height is actually free, and the fixed midline is kept only
   * when the word already reaches it. A wide card lays the two out in columns and sets
   * its own top, so it is left alone.
   *
   * When the two do not both fit (a short word on a wide, short card such as a folded
   * iPhone Duo, or anything on an Android split-screen half), the height is shared out
   * from the room there really is (allocateAnswer): the panel gets what its text needs,
   * the word is fitted into what is left under the toolbar, and if that would leave the
   * word too small the panel's text is set smaller instead. The share holds for the rest
   * of the page once given, because the panel it made room for would otherwise look roomy
   * again and hand the height back; it only tightens if the text still overflows.
   */
  useLayoutEffect(() => {
    setPanelTop(null);
    setAnswerFit(null);
    if (!stage.reveal || still) return;
    const stageEl = stageRef.current;
    const card = stageEl?.closest<HTMLElement>(".vocab-card");
    const panel = panelRef.current;
    // The answer's own band, not an outgoing clue page that is still in AnimatePresence.
    const band = stageEl?.querySelector<HTMLElement>(".vocab-stage-band[data-reveal]");
    const box = band?.querySelector<HTMLElement>("[data-word-box]");
    if (!card || !band || !box) return;
    let given: AnswerAllocation | null = null;
    let applied = "";
    // A guard, not a budget: the share is a pure function of the room and the panel's
    // text, so it settles within a pass or two.
    let changes = 0;
    let cardHeight = card.clientHeight;
    // Whether this page's panel was moved down onto the drawer tab. Held once given, so a
    // panel that grows afterwards (the reader opening "Nâng cao") scrolls inside its cap
    // rather than jumping back up under the reader's finger.
    let tabHeld = false;
    const measure = () => {
      if (card.dataset.revealSplit === "two-column") {
        setPanelTop(null);
        setAnswerFit(null);
        return;
      }
      // A wide card that stacks the two places its panel itself (the short-viewport tier);
      // only a share given below moves it.
      const cardRect = card.getBoundingClientRect();
      const wide = cardRect.width > cardRect.height;
      if (card.clientHeight !== cardHeight) {
        cardHeight = card.clientHeight;
        given = null;
        applied = "";
        changes = 0;
        tabHeld = false;
        setAnswerFit(null);
      }
      // The answer's own layout box, not its painted rect: the page enters under a
      // scale, and a transform never resizes the box the ResizeObserver watches.
      const bottom = band.offsetTop + box.offsetTop + box.offsetHeight / 2;
      const midline = cardHeight / 2;
      const top = bottom + PANEL_SEAM_PX < midline ? bottom + PANEL_SEAM_PX : midline;
      const laidTop = wide ? (panel?.offsetTop ?? top) : top;
      const scroller = panel?.querySelector<HTMLElement>(".vocab-reveal-scroll");
      if (panel && scroller && changes < 8) {
        // The cap: how tall the panel may grow, read by asking for more than it allows.
        // Restored in the same task, so nothing is drawn or observed in between.
        const height = panel.style.height;
        panel.style.height = "100000px";
        const capBottom = panel.offsetTop + panel.offsetHeight;
        panel.style.height = height;
        // What the panel adds around its text, read from its styles rather than its
        // laid-out height, which a cap or a pass not yet drawn can squeeze. It follows the
        // share tab's seat: a shared-height panel drops the band kept at its foot for the tab.
        const px = (value: string) => parseFloat(value) || 0;
        const panelStyle = getComputedStyle(panel);
        const scrollerStyle = getComputedStyle(scroller);
        const fixed =
          px(panelStyle.paddingTop) +
          px(panelStyle.paddingBottom) +
          px(panelStyle.borderTopWidth) +
          px(panelStyle.borderBottomWidth) +
          px(scrollerStyle.marginTop) +
          px(scrollerStyle.marginBottom);
        // The text at its own size: the scroller is set at the given scale.
        const content = scroller.scrollHeight / (given?.panelScale ?? 1);
        const next = allocateAnswer({
          capBottom,
          panelTop: laidTop,
          panelFixed: fixed,
          panelContent: content,
          // A word already given a box is taken as filling it, so the share is sized
          // again from the room and never handed back to a word it already shrank.
          wordBottom: given?.wordFoot != null ? Infinity : bottom,
        });
        const settled = next ?? (given ? { wordFoot: null, panelScale: 1 } : null);
        const rounded = settled && {
          wordFoot: settled.wordFoot === null ? null : Math.floor(settled.wordFoot),
          panelScale: Math.floor(settled.panelScale * 100) / 100,
        };
        const key = JSON.stringify(rounded);
        if (rounded && key !== applied) {
          applied = key;
          changes += 1;
          given = rounded;
          const wordFoot = rounded.wordFoot;
          const bandTop = band.offsetTop;
          const bandHeight = band.offsetHeight;
          setAnswerFit({
            panelScale: rounded.panelScale,
            word:
              wordFoot === null
                ? null
                : {
                    top: ANSWER_HEAD_PX - bandTop,
                    bottom: bandTop + bandHeight - wordFoot,
                    y: (((ANSWER_HEAD_PX + wordFoot) / 2 - bandTop) / bandHeight) * 100,
                  },
          });
        }
      }
      if (!wide) {
        // On a tall portrait screen the panel ends well above the bottom chrome, and its
        // divider runs past the drawer tab at no particular height. Where the panel can drop
        // to put that divider through the tab's centre and still end inside its cap, it
        // does, so the two read as one line. Only ever down: `top` is already as high as
        // the answer allows. Never on a page whose height had to be shared out.
        const aligned =
          given === null && panel && card.dataset.export === undefined
            ? tabAlignedPanelTop(panel)
            : null;
        let placed = top;
        if (aligned !== null && aligned >= top) {
          if (!tabHeld) {
            const height = panel!.style.height;
            panel!.style.height = "100000px";
            const capBottom = panel!.offsetTop + panel!.offsetHeight;
            panel!.style.height = height;
            const natural = panel!.offsetHeight;
            tabHeld = aligned + natural <= capBottom;
          }
          if (tabHeld) placed = aligned;
        } else {
          tabHeld = false;
        }
        setPanelTop(placed !== top || top < midline ? placed : null);
      } else setPanelTop(given?.wordFoot != null ? bottom + PANEL_SEAM_PX : null);
    };
    measure();
    const frame = requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    observer.observe(card);
    if (panel) observer.observe(panel);
    // The fit solver moves the answer by changing the wrapper's `top` percentage, which
    // is not a resize; without this the panel would keep the seam it measured a frame
    // before the word settled.
    const position = new MutationObserver(measure);
    position.observe(box, { attributes: true, attributeFilter: ["style"] });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      position.disconnect();
    };
  }, [stage.reveal, stage.id, word.id, playKey, still]);
  // The share tab always sits in the panel's top-right corner. It used to move up there
  // only when the page's height had been shared out (answerFit), and sat in the bottom-
  // right corner otherwise, so the reader found it in one place on one word and the other
  // place on the next.
  const shareTop = true;
  const shareFloat = useShareTopFloat({
    panel: panelRef,
    scroll: details,
    enabled: !!stage.reveal && !still,
  });
  const pageMotion: PageMotion = { direction, reveal: !!stage.reveal };
  return (
    <motion.div
      ref={stageRef}
      className="vocab-stage"
      style={{ x: dragX }}
      aria-live={active ? "polite" : "off"}
      aria-atomic="true"
    >
      <p className="sr-only" lang={stage.lang}>
        {stage.text}
      </p>
      {/* The burst takes its turn in the rotation by word, freezes with the card (a pause
          or an overlay) and, under reduced motion, plays its calm form instead of
          disappearing. */}
      {stage.reveal && staged && !still && (
        <RevealBurst
          key={playKey}
          variant={pickBurstVariant(word.id)}
          originY={revealY}
          paused={!playing}
          delay={reducedMotion ? 0 : BURST_LEAD_SECONDS}
          reducedMotion={reducedMotion}
          seed={word.id}
        />
      )}
      {/* No `initial={false}` here. It read as "do not slide the first page in", but
          AnimatePresence hands that flag to EVERY motion component underneath, so on a card
          that was born playing — the first word of a stream, whenever its fonts were ready
          before its data — the whole page, words included, was painted finished and never
          animated. Every later card dodged it only because it mounts off screen first.
          A still wants exactly that, so it alone asks for it. */}
      <AnimatePresence custom={pageMotion} initial={still ? false : undefined}>
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
                  y: stage.reveal ? (answerFit?.word?.y ?? revealY) : 46,
                  loop: stage.reveal && !still ? spec.loop : "none",
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
                secondaryEmphasis={stage.secondaryEmphasis}
                allowFrameEmphasis={allowFrameEmphasis}
                emphasisPool={emphasisPool}
                accentColor={accentColor}
                timeScale={timeScale}
                // The answer is one word fitted as a unit; only clue pages are broken
                // into lines.
                measuredLayout={stage.reveal ? undefined : textBudget}
                fitInsets={
                  stage.reveal && answerFit?.word
                    ? { top: answerFit.word.top, bottom: answerFit.word.bottom }
                    : undefined
                }
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {stage.reveal && (
        <motion.div
          ref={panelRef}
          className="vocab-reveal-details"
          tabIndex={0}
          aria-label="Nghĩa và ví dụ của từ"
          data-share-top={shareTop ? "" : undefined}
          style={
            panelTop === null
              ? undefined
              : ({ "--vocab-reveal-top": `${panelTop}px` } as CSSProperties)
          }
          initial={reducedMotion || still ? false : { opacity: 0, y: 30, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={
            reducedMotion ? { duration: 0 } : { ...SPRING.gentle, delay: DETAILS_DELAY_SECONDS }
          }
        >
          {/* The text scrolls in here, not on the panel itself, so the share leaf
              seated in the panel's corner stays put instead of scrolling away with
              the definition. `details` follows the scroller, because its one job is
              resetting scrollTop when the word changes. */}
          <div
            className="vocab-reveal-scroll"
            ref={details}
            // Set smaller only when the page's height was shared out and the text would
            // not otherwise fit beside a word of readable size.
            style={
              answerFit && answerFit.panelScale < 1
                ? { fontSize: `${answerFit.panelScale}em` }
                : undefined
            }
          >
            {/* Shortens only the top lines that pass beside the top-right share button. */}
            {shareFloat && (
              <span className="vocab-reveal-share-float" aria-hidden="true" style={shareFloat} />
            )}
            {/* Show the English word type next to the phonetic while keeping the Vietnamese
                pill beside the gloss below. */}
            {(word.ipa || word.pos) && (
              <p
                className="vocab-pronunciation"
                lang={stage.lang === "ja" || stage.lang === "ko" ? stage.lang : "en"}
              >
                {word.ipa}
                {word.pos && (
                  <span>
                    {word.ipa ? " · " : ""}
                    {posLabelEn(word.pos)}
                  </span>
                )}
              </p>
            )}
            {/* The gloss, not the definition. `defVi` is written to work as a CLUE
                before the answer is known — a sentence describing the word without
                naming it — and that is the wrong register once the reader can see the
                word: they want the equivalent, not a description. Decks authored before
                `meaningVi` existed fall back to the sentence they do have. */}
            <p className="vocab-meaning" lang="vi">
              <MarkedText text={word.meaningVi || word.defVi} />
              {/* The word type in Vietnamese ("danh từ", "động từ"…): a new learner reads
                  the deck's "noun" / "adj" as jargon. */}
              {word.pos && <span className="vocab-meaning-pos">{posLabelVi(word.pos)}</span>}
            </p>
            {word.usage.map((example, index) => (
              <div className="vocab-example" key={index}>
                {/* A Han deck writes this sentence in Chinese, and `lang` picks its glyphs. */}
                <p lang={stage.lang}>
                  <FilledUsage text={example.en} word={example.fill ?? word.word} />
                </p>
              </div>
            ))}
            {word.grammar && (
              <WordGrammar
                // Flipping the choice with this word on screen moves its section too.
                key={String(expandGrammar)}
                grammar={word.grammar}
                expanded={expandGrammar}
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
