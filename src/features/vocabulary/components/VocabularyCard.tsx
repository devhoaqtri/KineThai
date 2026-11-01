/** One independent vocabulary learning card; clue navigation and heart/bookmark reactions stay on-device, and the reveal is followed by a spelling coda (letter-by-letter for Latin, stroke-by-stroke for Han). Exports: VocabularyCard. Depends on: presets, playback, VocabularyStage, SpellingAnimation, HanziStrokeSpelling, reactions. */
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { blendOklch, getCanvasPatternTheme, getCanvasSceneTheme } from "@/features/canvas";
import {
  PostCanvasBackdrop,
  getSlidingCanvasBackground,
  getPageDuration,
  getUniformPageTextSize,
} from "@/features/post-player";
import {
  AnimatePresence,
  MotionConfig,
  animate,
  motion,
  useMotionValue,
  type Variants,
} from "framer-motion";
import { SPRING, getBeatSeconds } from "@/lib/motion";
import { Bookmark, Heart, Pause, Play } from "lucide-react";
import {
  VOCAB_TEXT_BUDGET_LINE_EM,
  buildVocabularyCanvas,
  choosePresentation,
  fitVocabularyTextSize,
  getVocabularyTextHeightBudget,
} from "../lib/presets";
import { getWideRevealY, isShortViewport } from "../lib/landscape-geometry";
import { buildStages } from "../lib/stages";
import { resolveClue } from "../lib/clues";
import { t } from "../lib/ui-copy";
import { useLocale } from "../lib/useLocale";
import { requestDurableStorage } from "../lib/durable-storage";
import { getExportStageBox, type CardExportLayout } from "../lib/export-layout";
import { hasReportedWord } from "../lib/reported-words";
import { sceneSkipLimiter } from "../lib/skip-limiter";
import { getSpellingDurationMs, pickSpellingVariant } from "../lib/spelling";
import { getStrokeSpellingDurationMs, isHanAnswer } from "../lib/hanzi";
import { prefetchHanziStrokes } from "../lib/hanzi-strokes";
import {
  REACTIONS_EVENT,
  REACTIONS_KEY,
  addEmojiComment,
  flipReaction,
  getEmojiComments,
  getTapCount,
  hasReaction,
  type ReactionKind,
} from "../lib/reactions";
import { EMOJI_PALETTE, formatEmojiTotal, mockEmojiTotals, withLocalEmojis } from "../lib/emoji";
import { useLearningPlayback } from "../hooks/useLearningPlayback";
import { usePresence } from "@/hooks/use-presence";
import type { FeedEntry, Presentation, ReadingPace } from "../types";
import { EmojiBurst } from "./EmojiBurst";
import { SpellingAnimation } from "./SpellingAnimation";
import { VocabularyStage } from "./VocabularyStage";
import { WordReportButton, WordReportPanel } from "./WordReportControl";
import { feedLog } from "../lib/feed-log";

/**
 * The CJK stroke coda is lazy: Hanzi Writer plus the vendored stroke dataset load only
 * when a Han answer actually reaches its coda, so the English feed chunk never carries
 * them. The named export is re-exposed as a default for React.lazy.
 */
const HanziStrokeSpelling = lazy(() =>
  import("./HanziStrokeSpelling").then((module) => ({ default: module.HanziStrokeSpelling })),
);

/** Matches the report panel's exit keyframes (--dur-quick) in vocabulary.css. */
const REPORT_EXIT_MS = 180;
/** Resume button exit: grows away while its tint and blur drain to nothing. */
const RESUME_EXIT = {
  scale: 1.25,
  backgroundColor: "rgba(0, 0, 0, 0)",
  backdropFilter: "blur(0px) saturate(100%)",
  transition: { duration: 0.2, ease: "easeIn" },
} as const;
const RESUME_ICON_EXIT = {
  opacity: 0,
  transition: { duration: 0.16, ease: "easeIn" },
} as const;
/** Clue-page duration multipliers; "fast" is the stream's native timing. */
const PACE_FACTOR: Record<ReadingPace, number> = { slow: 1.75, normal: 1.35, fast: 1 };

const EASE_OUT = [0.22, 1, 0.36, 1] as const;
const EASE_IN = [0.5, 0, 0.75, 0] as const;
const STRIP_STAGGER_S = 0.026;
const STRIP_DROP_S = 0.3;
/**
 * How long the stream waits before moving on so the strip can finish leaving: the
 * last of nine pieces starts 8 staggers in and drops for STRIP_DROP_S.
 */
const STRIP_EXIT_MS = Math.round((8 * STRIP_STAGGER_S + STRIP_DROP_S) * 1000) + 20;

/**
 * The answer strip. It fades in as one piece on reveal; when the word ends each
 * button hops, then drops off the bottom edge in a left-to-right wave. "leave" waits
 * for its children so AnimatePresence holds the strip until the wave has passed.
 */
const stripVariants: Variants = {
  hidden: { opacity: 0, scale: 0.85, filter: "blur(4px)" },
  shown: {
    opacity: 1,
    scale: 1,
    filter: "blur(0px)",
    transition: { duration: 0.28, ease: EASE_OUT },
  },
  leave: {
    opacity: 0,
    transition: { when: "afterChildren", staggerChildren: STRIP_STAGGER_S, duration: 0.01 },
  },
};
// `filter` is absent from both resting states on purpose. Nothing blurs these buttons on
// the way IN — only the leave wave does, and it names its own `blur(0px)` start — so
// resting on one meant every button in the strip sat under a filter for its whole visible
// life. A zero-radius blur still establishes a filter region clipped to the element's box,
// which cuts anything a child paints outside it (a glow, a text-shadow).
const stripItemVariants: Variants = {
  hidden: { opacity: 1, y: 0, scale: 1, rotate: 0 },
  shown: { opacity: 1, y: 0, scale: 1, rotate: 0 },
  leave: (index: number) => ({
    opacity: [1, 1, 0],
    y: [0, -7, 46],
    scale: [1, 1.08, 0.55],
    rotate: [0, 0, index % 2 ? 9 : -9],
    filter: ["blur(0px)", "blur(0px)", "blur(3px)"],
    transition: { duration: STRIP_DROP_S, times: [0, 0.28, 1], ease: EASE_IN },
  }),
};

/**
 * The default row (reveal pill, heart, bookmark): each piece springs up from below
 * with a small overshoot, one after another, the first time the card is the word on
 * screen — and again after the strip leaves on a replay.
 */
const rowVariants: Variants = {
  hidden: { transition: { when: "afterChildren", staggerChildren: 0.03, staggerDirection: -1 } },
  shown: { transition: { staggerChildren: 0.075, delayChildren: 0.05 } },
};
const rowItemVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 30,
    scale: 0.6,
    filter: "blur(6px)",
    transition: { duration: 0.16, ease: EASE_IN },
  },
  shown: {
    opacity: 1,
    y: 0,
    scale: 1,
    filter: "blur(0px)",
    transition: {
      y: { type: "spring", stiffness: 520, damping: 22, mass: 0.7 },
      scale: { type: "spring", stiffness: 480, damping: 16, mass: 0.7 },
      opacity: { duration: 0.18, ease: EASE_OUT },
      filter: { duration: 0.26, ease: EASE_OUT },
    },
  },
};
/** Where the answer word sits in its band, as a percentage of the band's height. */
const PORTRAIT_REVEAL_Y = 34;
/**
 * Two-column answer page: on a landscape phone the word and its meaning sit SIDE BY
 * SIDE rather than stacked. Stacking them splits ~200px of free height two ways and
 * left the meaning panel with about two lines; side by side each gets the full height
 * and the panel gets the room it needs.
 *
 * The card decides when it applies (a wide card no taller than SHORT_VIEWPORT_MAX_H)
 * and publishes both the flag (`data-reveal-split`) and the column width
 * (`--vocab-word-col`) to CSS, so the stylesheet never restates the breakpoint and the
 * two can never disagree about when or how wide.
 */
/** The answer word's share of the width. */
const WIDE_WORD_COLUMN = 0.6;
/** The meaning panel's share. The remainder is the gap between them and the edges. */
const WIDE_PANEL_COLUMN = 0.35;

/** Horizontal travel before a drag starts moving the page, in px. */
const DRAG_SLOP_PX = 10;
/** Share of the finger's travel the page follows — under 1 so it feels held, not loose. */
const DRAG_FOLLOW = 0.42;

/** Play a single occurrence, keeping answer content hidden until reveal. @param props Entry/display settings. @returns Full-height card. */
export function VocabularyCard({
  entry,
  presentation,
  active,
  current = active,
  reducedMotion,
  matching,
  canAdvance,
  onAdvance,
  onWordEnding,
  onWordFinished,
  exportLayout,
  revealButtonLabel,
  onToggleAutoplay,
}: {
  entry: FeedEntry;
  presentation: Presentation;
  /** This card is the word on screen AND nothing is covering the feed: it plays. */
  active: boolean;
  /**
   * This card is the word on screen, whether or not it is playing. It stays true while a
   * sheet, the saved drawer or the rotate gate covers the feed — which is how the card
   * tells "paused" (hold everything exactly where it is) from "the reader moved on".
   * Defaults to `active` for callers with nothing that can cover the card.
   */
  current?: boolean;
  reducedMotion: boolean;
  matching: number;
  canAdvance: boolean;
  onAdvance: () => void;
  /**
   * Called when this card, while on screen, reaches its final page (the spelling
   * coda), with the milliseconds left before the stream moves on — 0 when pages are
   * turned by hand and there is no telling. Lets the music bow out with the word.
   */
  onWordEnding?: (remainingMs: number) => void;
  /**
   * This word was finished, and should count towards the reader's daily streak. Carries
   * `word.id` and never `occurrenceId`: the same word can be admitted twice in one stream,
   * and the id is the only thing stable across a shuffle or a remount.
   */
  onWordFinished?: (wordId: string) => void;
  /**
   * Render for video export instead of for a reader: the text is confined to the
   * given clear zone, the interactive chrome is hidden and gestures are off. The
   * animation, timing and palette are exactly the feed's.
   */
  exportLayout?: CardExportLayout;
  /** Custom label for the reveal button, from admin wording presets. */
  revealButtonLabel?: string;
  /** Toggle autoplay from the center tap zone; threads up to the page-level presentation state. */
  onToggleAutoplay?: () => void;
}) {
  const { theme, style } = choosePresentation(entry.occurrenceId, presentation, entry.position);
  // Card stages follow the active UI locale (Japanese by default); the reveal stays English.
  const ui = useLocale();
  const stages = useMemo(() => buildStages(entry.word, style.id, ui), [entry.word, style.id, ui]);
  const canvas = useMemo(() => buildVocabularyCanvas(theme, style), [theme, style]);
  // The spelling coda is one extra page appended after the reveal stage, so the
  // playback timer — not the animation component — decides when the card ends.
  const spellingVariant = useMemo(
    () => pickSpellingVariant(entry.occurrenceId),
    [entry.occurrenceId],
  );
  // A Han answer draws stroke-by-stroke instead of popping letters. The branch is decided
  // by pure script detection (lib/hanzi imports no stroke data), so this card chunk stays
  // lean for the English feed and the coda duration needs only the character count.
  const isHan = isHanAnswer(entry.word.word);
  const spellingDuration = useMemo(
    () =>
      isHan
        ? getStrokeSpellingDurationMs(entry.word.word, reducedMotion)
        : getSpellingDurationMs(entry.word.word, spellingVariant, reducedMotion),
    [isHan, entry.word.word, spellingVariant, reducedMotion],
  );
  // Warm the lazy stroke chunk and this answer's stroke files as soon as a Han card mounts,
  // so the coda never waits on a dynamic import or a fetch mid-animation; the clue pages
  // give both ample time to arrive.
  useEffect(() => {
    if (!isHan) return;
    void import("./HanziStrokeSpelling");
    prefetchHanziStrokes(entry.word.word);
  }, [isHan, entry.word.word]);
  const revealPage = stages.length - 1;
  const pageCount = stages.length + 1;
  /** Progress-bar keys: one per clue stage plus the trailing spelling coda. */
  const pageKeys = useMemo(() => [...stages.map((item) => item.id), "spelling"], [stages]);
  const cardRef = useRef<HTMLElement>(null);
  const actionBarRef = useRef<HTMLDivElement>(null);
  const emojiStripRef = useRef<HTMLDivElement>(null);
  // `chromeSide` is --vocab-chrome-side read back off the card. The text is fitted to the
  // BAND, which that variable has already narrowed; fitting it to the card instead sizes it
  // for room it does not have, and a long answer word then runs out past the inset that was
  // added to keep it clear of a platform's crop.
  const [{ width, height, chromeSide }, setSize] = useState({
    width: 390,
    height: 844,
    chromeSide: 0,
  });
  useLayoutEffect(() => {
    const element = cardRef.current;
    if (!element) return;
    const measure = () =>
      setSize({
        width: element.clientWidth,
        height: element.clientHeight,
        chromeSide:
          Number.parseFloat(getComputedStyle(element).getPropertyValue("--vocab-chrome-side")) || 0,
      });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  // Pace stretches the clue pages twice over, in step: how long each page stays up, and
  // how slowly its words are read out onto it. The spelling coda keeps its own timing.
  const paceFactor = exportLayout ? 1 : PACE_FACTOR[presentation.pace ?? "normal"];
  /** One duration per page: every clue stage plus the trailing spelling coda. */
  const pageDurations = useMemo(
    () => [
      ...stages.map((stage) =>
        Math.round(
          getPageDuration(
            [
              stage.text,
              stage.reveal
                ? ui === "ja" && entry.word.meaningJP
                  ? entry.word.meaningJP
                  : resolveClue(entry.word, "def", ui)
                : "",
            ]
              .filter(Boolean)
              .join(" "),
            style.tempo,
            style.rhythm,
          ) * paceFactor,
        ),
      ),
      spellingDuration,
    ],
    [stages, entry.word, ui, style.tempo, style.rhythm, spellingDuration, paceFactor],
  );
  const looping = presentation.advance === false && !exportLayout;
  // While the report panel is open the card holds still: the reader is describing
  // THIS page, and the stream must not move on underneath them.
  const [reportOpen, setReportOpen] = useState(false);
  /** The reader opened the answer's grammar section by hand; playback waits for them. */
  const [grammarHeld, setGrammarHeld] = useState(false);
  // Visual feedback for the side zones of the three-zone tap: briefly washes the
  // tapped side (left = rewind, right = fast-forward) for 350ms.
  const [tapZone, setTapZone] = useState<"left" | "right" | null>(null);
  // Bumped by a center tap that pauses: keys the pause icon that pops out and vanishes.
  const [pausePop, setPausePop] = useState(0);
  const tapZoneTimer = useRef<number | undefined>(undefined);
  const [reported, setReported] = useState(() => hasReportedWord(entry.word.id));
  const reportButton = useRef<HTMLButtonElement>(null);
  const closeReport = useCallback(() => {
    setReportOpen(false);
    reportButton.current?.focus();
  }, []);
  const report = usePresence(reportOpen, REPORT_EXIT_MS);
  const markReported = useCallback(() => setReported(true), []);
  // Ending a word plays the strip's exit first, then moves on. Advances only come from
  // the answer (auto-finish or a coda tap), so the strip is always what is showing.
  const [leaving, setLeaving] = useState(false);
  const leaveTimer = useRef<number | undefined>(undefined);
  /**
   * Count this word towards the streak.
   *
   * `viaTimer` is the coda's own clock running out. That is the only thing that counts
   * normally — a reader who taps the coda away has not waited for the word, and right-zone
   * taps are not rate-limited, so counting a dismissal would make a streak reachable with a
   * thumb.
   *
   * Reduced motion is the exception, and it is not optional. useLearningPlayback gates
   * `playing` on `!reducedMotion` and calls `onFinish` inside that gate, so for a reader
   * with the OS setting on, the timer NEVER fires: timer-only would hand them a permanently
   * zero streak for a preference they may never connect to it. Their coda dismissal is the
   * only exit they have, so it counts.
   *
   * Loop mode earns nothing either way: the card returns to page 0 and bumps `replay`
   * rather than finishing. Accepted — loop means "stay on this word".
   */
  const markWordFinished = useCallback(
    (viaTimer: boolean) => {
      if (exportLayout) return;
      if (!viaTimer && !reducedMotion) return;
      onWordFinished?.(entry.word.id);
    },
    [exportLayout, reducedMotion, onWordFinished, entry.word.id],
  );
  const advanceWithExit = useCallback(() => {
    if (leaveTimer.current !== undefined) return;
    if (reducedMotion || !canAdvance || exportLayout) {
      onAdvance();
      return;
    }
    setLeaving(true);
    leaveTimer.current = window.setTimeout(() => {
      leaveTimer.current = undefined;
      onAdvance();
      setLeaving(false);
    }, STRIP_EXIT_MS);
  }, [reducedMotion, canAdvance, exportLayout, onAdvance]);
  useEffect(() => () => window.clearTimeout(leaveTimer.current), []);
  // An overlay opening mid-exit must not let the timer carry the stream on to the next
  // word underneath it. Drop the exit; the playback clock for this page is already spent,
  // so it asks to advance again the moment the card is playing.
  useEffect(() => {
    if (active || leaveTimer.current === undefined) return;
    window.clearTimeout(leaveTimer.current);
    leaveTimer.current = undefined;
    setLeaving(false);
  }, [active]);
  // The page's text is on stage from the first moment this card PLAYS and stays there
  // until the reader leaves the word. It used to be tied straight to `active`, so anything
  // that paused the feed (the options sheet, the saved drawer) unmounted the text and its
  // return re-ran the page's whole entrance — the scene "starting again". Waiting for the
  // first play, rather than for `current`, is what still holds the opening word back
  // until its typeface is ready.
  const [started, setStarted] = useState(active);
  if (active && !started) setStarted(true);
  if (!current && started) setStarted(false);
  // The default row makes its entrance the first time this card is the word on screen,
  // not on mount: neighbours are pre-rendered off screen, where it would go unseen.
  const [entered, setEntered] = useState(active);
  useEffect(() => {
    if (active) setEntered(true);
  }, [active]);
  const playback = useLearningPlayback({
    count: pageCount,
    active,
    current,
    // The report sheet and a hand-opened grammar section both hold the card where it is
    // without touching the reader's autoplay setting.
    autoplay: presentation.autoplay && !reportOpen && !grammarHeld,
    reducedMotion,
    durations: pageDurations,
    canAdvance,
    revealPage,
    loop: looping,
    onFinish: () => {
      markWordFinished(true);
      advanceWithExit();
    },
  });
  // Which way the reader last moved, derived during render so the outgoing page
  // already knows its exit direction on the same pass that swaps it out.
  const [nav, setNav] = useState({ page: 0, direction: 1 });
  if (nav.page !== playback.page) {
    setNav({ page: playback.page, direction: playback.page > nav.page ? 1 : -1 });
  }
  const isSpelling = playback.page > revealPage;
  const autoAdvancing = playback.playing && canAdvance && !looping;
  useEffect(() => {
    if (!active || !isSpelling) return;
    onWordEnding?.(autoAdvancing ? spellingDuration : 0);
  }, [active, isSpelling, autoAdvancing, spellingDuration, onWordEnding]);
  // The reveal page and the spelling coda both belong to the answer, so the emoji
  // burst stays mounted across the flip instead of remounting and restarting.
  const isRevealed = playback.page >= revealPage;
  // The burst fills both pages and fades out as the spelled word leaves.
  const burstSpanSeconds = ((pageDurations[revealPage] ?? 0) + spellingDuration) / 1000;
  // During the coda there is no matching stage; the answer stage stays mounted
  // underneath so its reveal details and unlocked reactions persist.
  const stage = stages[Math.min(playback.page, revealPage)]!;
  // The emoji strip is the chrome for the WHOLE answer — the reveal page and the
  // trailing spelling coda — and is dropped only when a new word's card mounts. It no
  // longer swaps away at the reveal→spelling flip, which flickered the strip (and its
  // badge counts) off mid-answer for no reason.
  const showEmojiStrip = isRevealed;
  const playKey = playback.replay * pageCount + playback.page;
  // The burst billows out of each emoji's OWN button instead of out of the card's
  // corners, so every button's launch point is measured from the strip. The strip now
  // stays mounted across the whole answer, so this runs once when it appears and the
  // base positions of glyphs already in flight never move on the reveal→spelling flip.
  const [burstOrigin, setBurstOrigin] = useState({ x: 195, y: 702 });
  const [emojiOrigins, setEmojiOrigins] = useState<Record<string, { x: number; y: number }>>({});
  useLayoutEffect(() => {
    const card = cardRef.current;
    const bar = actionBarRef.current;
    if (!card || !bar || !showEmojiStrip) return;
    const cardRect = card.getBoundingClientRect();
    const barRect = bar.getBoundingClientRect();
    setBurstOrigin({
      x: barRect.left - cardRect.left + barRect.width / 2,
      y: barRect.top - cardRect.top,
    });
    const strip = emojiStripRef.current;
    if (!strip) return;
    const next: Record<string, { x: number; y: number }> = {};
    strip
      .querySelectorAll<HTMLButtonElement>(".vocab-emoji-strip-btn[data-emoji]")
      .forEach((button) => {
        const emoji = button.dataset.emoji;
        if (!emoji) return;
        const rect = button.getBoundingClientRect();
        next[emoji] = {
          x: rect.left - cardRect.left + rect.width / 2,
          y: rect.top - cardRect.top + rect.height / 2,
        };
      });
    setEmojiOrigins(next);
  }, [showEmojiStrip, width, height]);
  const sceneTheme = getCanvasSceneTheme(canvas.backgroundScene);
  const patternTheme = getCanvasPatternTheme(canvas.backgroundPattern);
  const sliding =
    sceneTheme || patternTheme
      ? null
      : getSlidingCanvasBackground(
          canvas,
          theme.background,
          reducedMotion ? 0 : playback.page,
          // Blend each step perceptually so the strip keeps its color through the
          // middle of the card, matching the static `theme.paint` on idle cards.
          blendOklch,
        );
  // Diagnostic log (dev builds only, see lib/feed-log): what this card showed while it was
  // the word on screen, how long it stayed, and each page it turned to.
  const loggedPage = useRef({ page: playback.page, stage: "" });
  loggedPage.current = { page: playback.page, stage: isSpelling ? "spelling" : stage.id };
  const backdropKind = sceneTheme
    ? "scene"
    : patternTheme
      ? "pattern"
      : sliding
        ? "strip"
        : "static";
  useEffect(() => {
    if (!current || exportLayout) return;
    const shownAt = performance.now();
    // Logged a tick late: development mounts every effect twice, and an arrival that is
    // cancelled before it is logged must not leave a phantom 0ms "word … leave" pair in
    // the log — those would read as exactly the flashes the log exists to find.
    let logged = false;
    const arrive = window.setTimeout(() => {
      logged = true;
      feedLog("word", {
        word: entry.word.word,
        id: entry.occurrenceId,
        level: entry.word.level ?? null,
        theme: theme.id,
        tone: theme.tone,
        backdrop: backdropKind,
        pages: pageCount,
      });
    }, 0);
    return () => {
      window.clearTimeout(arrive);
      if (!logged) return;
      feedLog("leave", {
        word: entry.word.word,
        shownMs: Math.round(performance.now() - shownAt),
        lastPage: loggedPage.current.page,
        lastStage: loggedPage.current.stage,
      });
    };
    // Once per spell on screen; the details are read as they were when it arrived.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, entry.occurrenceId]);
  const lastLoggedPage = useRef("");
  useEffect(() => {
    if (!current || exportLayout) return;
    // Development runs effects twice; the same page turn is logged once.
    const key = `${entry.occurrenceId}:${playback.replay}:${playback.page}`;
    if (lastLoggedPage.current === key) return;
    lastLoggedPage.current = key;
    feedLog("page", {
      word: entry.word.word,
      page: playback.page,
      stage: loggedPage.current.stage,
      replay: playback.replay,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, playback.page, playback.replay]);
  // Only the single active card animates the sweeping transition backdrop. Inactive
  // neighbours keep a static gradient, so a transient active-index flip can never make
  // every visible background strobe at once.
  // Keyed to `started`, not `active`: a pause must not switch the backdrop back to its
  // static form and then restart the drift from its first frame when playback resumes.
  const sweep = !!sliding && !reducedMotion && started;
  // Once a card has drifted it never goes back to its untouched form while it is mounted:
  // leaving the word only FREEZES the drift where it is. Dropping it instead put the
  // backdrop back at its starting offset while the card was still sliding off screen —
  // the colours of the word being left jumped in the middle of the swipe.
  const [drifted, setDrifted] = useState(sweep);
  if (sweep && !drifted) setDrifted(true);
  const cluePages = stages.filter((item) => !item.reveal).map((item) => item.text);
  // In an export the text lives in the frame's clear zone, so that zone — not the
  // whole card — is the width and height everything is fitted to.
  const exportBox = exportLayout ? getExportStageBox(width, height, exportLayout) : null;
  // A card wider than it is tall has width to spare and height to protect. The boxed
  // highlight spends height (padding and a border around the word), so it is a portrait-
  // only effect; on a landscape card the same word is underlined instead.
  const landscape = width > height;
  // On a landscape card the answer page also splits the height between the word and
  // its meaning by proportion (the landscape tier in vocabulary.css); the word is then
  // centred in its own band rather than pinned at the portrait 34%.
  const wideCard = !exportLayout && landscape;
  // Only a SHORT landscape card goes two-column: a landscape desktop window is tall
  // enough that the stacked proportional split still reads well, and splitting it
  // would leave both columns half empty.
  const twoColumn = wideCard && isShortViewport(height);
  // A wide card's answer band is stretched by the fit solver's uneven margins (72px
  // above, 132px below), so the middle of the room the word is given is NOT the middle
  // of the band; it is derived from the same geometry the stylesheet lays out, which is
  // also where the celebration burst is aimed.
  const revealY = wideCard ? getWideRevealY(height, twoColumn) : PORTRAIT_REVEAL_Y;
  // The export frame carries its own safe box; everywhere else the text lives inside the
  // band, so the side inset comes off both edges before anything is fitted to it.
  const textWidth = exportBox?.textWidth ?? Math.max(1, width - 2 * chromeSide);
  // The answer shares the card with its meaning panel now, so it is fitted to its own
  // column instead of the whole width — otherwise it is sized for space it does not have.
  const revealCanvasWidth = twoColumn ? Math.round(textWidth * WIDE_WORD_COLUMN) : textWidth;
  const textHeight = exportBox?.textHeight ?? height;
  const textReserve = exportBox ? 0 : undefined;
  const uniformTextSize = getUniformPageTextSize(
    Math.max(96, Math.min(160, textWidth * 0.13)),
    cluePages,
    cluePages.join(" "),
  );
  const textSize = fitVocabularyTextSize(
    stage.text,
    uniformTextSize,
    textWidth,
    textHeight,
    textReserve,
  );
  // The size above comes from a character-count estimate and is only where a clue page
  // STARTS. Once the page is drawn its words are measured and the breaks and the size are
  // solved together inside these limits: never larger than the card's uniform size, never
  // taller than the room the estimate was budgeting for.
  const textBudgetHeight = getVocabularyTextHeightBudget(textWidth, textHeight, textReserve);
  const textBudget = useMemo(
    () => ({
      maxSize: uniformTextSize,
      budgetHeight: textBudgetHeight,
      budgetLineEm: VOCAB_TEXT_BUDGET_LINE_EM,
    }),
    [uniformTextSize, textBudgetHeight],
  );
  // Every role comes from one validated palette. `--vocab-button-ink` is the
  // palette's on-accent color, which the audit already proved clears 4.5:1 against
  // both accents, so a label painted on an accent fill can never go unreadable.
  const colors = {
    "--vocab-ink": theme.ink,
    "--vocab-accent": theme.accent,
    "--vocab-accent-alt": theme.accentAlt,
    "--vocab-button-ink": theme.onAccent,
    // One pulse per card: emphasis loops, the backdrop drift and the blank slot are
    // all whole multiples of this, so the page moves to the style's tempo.
    "--kinetic-beat": `${getBeatSeconds(style.tempo)}s`,
    background: theme.paint,
    color: theme.ink,
    fontFamily: `${theme.font}, sans-serif`,
    ...(exportLayout && exportBox
      ? {
          "--safe-top": `${exportLayout.safe.top * 100}%`,
          "--safe-right": `${exportLayout.safe.right * 100}%`,
          "--safe-bottom": `${exportLayout.safe.bottom * 100}%`,
          "--safe-left": `${exportLayout.safe.left * 100}%`,
          "--export-stage-top": `${exportBox.top}px`,
          "--export-stage-bottom": `${exportBox.bottom}px`,
          "--export-stage-bottom-band": `${exportBox.bottomBand}px`,
        }
      : {}),
  } as CSSProperties;

  // Gesture handling: tap left/right + horizontal swipe for clue navigation.
  const gestureStart = useRef<{ x: number; y: number; t: number } | null>(null);
  // The page follows the finger while it is dragged sideways and springs back on
  // release, so a swipe is felt before it commits rather than jumping at a threshold.
  const dragX = useMotionValue(0);
  const handlePointerMove = useCallback(
    (clientX: number, clientY: number) => {
      const start = gestureStart.current;
      if (!start || reducedMotion) return;
      const dx = clientX - start.x;
      const dy = clientY - start.y;
      // Only a clearly horizontal drag moves the page; vertical travel belongs to the
      // stream's own scroll and must not wobble the text.
      if (Math.abs(dx) > DRAG_SLOP_PX && Math.abs(dx) > Math.abs(dy) * 1.2) {
        dragX.set(dx * DRAG_FOLLOW);
      }
    },
    [dragX, reducedMotion],
  );
  const releaseDrag = useCallback(() => {
    if (dragX.get() !== 0) animate(dragX, 0, SPRING.snappy);
  }, [dragX]);
  const handlePointerStart = useCallback(
    (clientX: number, clientY: number, target: EventTarget | null) => {
      if (
        target instanceof Element &&
        target.closest("button, a, input, select, textarea, [data-no-gesture]")
      ) {
        // Element (not HTMLElement): taps land on SVG icons inside buttons, and
        // SVGElement must be excluded or reaction taps would also flip pages.
        gestureStart.current = null;
        return;
      }
      gestureStart.current = { x: clientX, y: clientY, t: Date.now() };
    },
    [],
  );
  const handlePointerEnd = useCallback(
    (clientX: number, clientY: number) => {
      const start = gestureStart.current;
      gestureStart.current = null;
      releaseDrag();
      if (!start) return;
      const dx = clientX - start.x;
      const dy = clientY - start.y;
      const dt = Date.now() - start.t;
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);
      // Forward skips share one limiter; once it trips, the gesture is swallowed silently.
      const canSkip = () => sceneSkipLimiter.tryConsume();
      // Rewinding or skipping is a request to watch, so it ends a pause: the page must
      // never move on while the resting play button still says the stream is stopped.
      const resume = () => {
        if (!presentation.autoplay && !reducedMotion) onToggleAutoplay?.();
      };
      // Horizontal swipe
      if ((ax > 44 || ay > 44) && ax > ay) {
        if (dx < -44) {
          if (isSpelling) {
            if (canSkip()) {
              resume();
              markWordFinished(false);
              advanceWithExit();
            }
          } else if (!stage.reveal && canSkip()) {
            resume();
            playback.next();
          }
        } else if (dx > 44) {
          resume();
          playback.previous();
        }
        return;
      }
      // Vertical swipe is handled by VocabularyStream for word navigation; ignore here.
      if (ay > 44 && ay > ax) return;
      // Tap
      if (dt < 600 && ax < 16 && ay < 16) {
        // During the spelling coda a tap means "I have it" — skip to the next word.
        if (isSpelling) {
          if (canSkip()) {
            resume();
            markWordFinished(false);
            advanceWithExit();
          }
          return;
        }
        const rect = cardRef.current?.getBoundingClientRect();
        if (!rect) return;
        const relX = clientX - rect.left;
        const leftZone = rect.width * 0.35;
        const rightZone = rect.width * 0.65;
        // Determine which zone was tapped and show visual feedback.
        let zone: "left" | "right";
        if (relX < leftZone) {
          zone = "left";
          resume();
          playback.previous();
        } else if (relX > rightZone) {
          zone = "right";
          resume();
          playback.next();
        } else {
          // The center answers with the pause pop and the resting play button, not a wash.
          if (presentation.autoplay) setPausePop((count) => count + 1);
          onToggleAutoplay?.();
          return;
        }
        // Flash the zone highlight for 350ms.
        clearTimeout(tapZoneTimer.current);
        setTapZone(zone);
        tapZoneTimer.current = window.setTimeout(() => setTapZone(null), 350);
      }
    },
    [
      playback,
      isSpelling,
      markWordFinished,
      advanceWithExit,
      releaseDrag,
      onToggleAutoplay,
      presentation.autoplay,
      reducedMotion,
      stage.reveal,
    ],
  );

  void matching;

  // Heart / bookmark: everything stays on-device. Both the toggle flag and the
  // cumulative tap counter live in localStorage, so no request is made and no
  // account exists — the numbers shown are this reader's own.
  const wordId = entry.word.id;
  const [reactions, setReactions] = useState(() => ({
    heart: hasReaction(wordId, "heart"),
    bookmark: hasReaction(wordId, "bookmark"),
  }));
  const [taps, setTaps] = useState(() => ({
    heart: getTapCount(wordId, "heart"),
    bookmark: getTapCount(wordId, "bookmark"),
  }));
  // This device's own emoji taps, folded on top of the mocked aggregate so a tap
  // visibly adds to the crowd. Held in state (not read during render) so its
  // identity is stable and the burst cannot restart on an unrelated re-render.
  const [emojiComments, setEmojiComments] = useState(() => getEmojiComments(wordId));
  const readLocalReactions = useCallback(() => {
    setReactions({
      heart: hasReaction(wordId, "heart"),
      bookmark: hasReaction(wordId, "bookmark"),
    });
    setTaps({
      heart: getTapCount(wordId, "heart"),
      bookmark: getTapCount(wordId, "bookmark"),
    });
    setEmojiComments(getEmojiComments(wordId));
  }, [wordId]);
  useEffect(() => {
    readLocalReactions();
  }, [readLocalReactions, active]);
  // The cycling stream can mount the same word twice, and the saved-words page
  // writes the same key, so re-read on both the cross-tab and same-tab signal.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === REACTIONS_KEY) readLocalReactions();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(REACTIONS_EVENT, readLocalReactions);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(REACTIONS_EVENT, readLocalReactions);
    };
  }, [readLocalReactions]);
  // Bumped each time a reaction is switched ON, and used as a React key on the icon:
  // a fresh key remounts it, which replays the pop. Starting at 0 means an already
  // saved word does not celebrate itself every time its card scrolls into view.
  // `onStrip` records which row the tap happened in: the action row and the emoji
  // strip each render their own heart/bookmark, and the strip mounting at the reveal
  // must not replay a pop that was earned on the other row.
  const [pops, setPops] = useState({ heart: 0, bookmark: 0, onStrip: false });
  const toggleReaction = useCallback(
    (kind: ReactionKind) => {
      // Reactions are always live — no pre-reveal lock. flipReaction bumps the tap
      // counter itself when the reaction turns on.
      const turningOn = !hasReaction(wordId, kind);
      flipReaction(wordId, kind);
      readLocalReactions();
      if (turningOn) {
        requestDurableStorage();
        setPops((current) => ({
          ...current,
          [kind]: current[kind] + 1,
          onStrip: showEmojiStrip,
        }));
      }
    },
    [wordId, readLocalReactions, showEmojiStrip],
  );
  const heartsLabel = formatReactionCount(taps.heart);
  const bookmarksLabel = formatReactionCount(taps.bookmark);

  // The reveal page billows the word's mocked emoji aggregate out of the reaction
  // button. The aggregate is deterministic per word id, so a replay looks the
  // same and neighbouring cards differ.
  const emojiTotals = useMemo(() => mockEmojiTotals(wordId), [wordId]);
  // The badges show the mocked crowd plus this device's taps per emoji; the flying
  // glyphs stay keyed to the mocked aggregate alone so a tap cannot restart the long
  // flight.
  const emojiCounts = useMemo(
    () => withLocalEmojis(emojiTotals, emojiComments).counts,
    [emojiTotals, emojiComments],
  );
  // The last emoji tapped and how many taps there have been, so that emoji alone
  // replays its bounce and floats a "+1" — feedback the strip never gave before.
  const [emojiTap, setEmojiTap] = useState<{ emoji: string; count: number }>();
  // Every tap launches its OWN emoji into the scene, so tapping 🔥 five times sends five
  // 🔥 rising from the button rather than swapping a single stamp. Each flight is tagged
  // with a process-wide sequence id (so reusing the same emoji still gets a distinct key)
  // and retires itself the moment its animation ends, keeping the mounted set bounded.
  const [emojiFlights, setEmojiFlights] = useState<
    Array<{ id: number; emoji: string; origin: { x: number; y: number } }>
  >([]);
  const flightSeq = useRef(0);
  const handleEmojiTap = useCallback(
    (emoji: string, button: HTMLElement) => {
      addEmojiComment(wordId, emoji);
      setEmojiComments(getEmojiComments(wordId));
      // Measure the tapped button's own card-local centre so this reader's emoji rises
      // from the exact glyph they pressed — not the shared action-bar fallback, which is
      // what makes it read as "mine", not the community puff.
      const cardRect = cardRef.current?.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
      const origin = cardRect
        ? {
            x: buttonRect.left - cardRect.left + buttonRect.width / 2,
            y: buttonRect.top - cardRect.top + buttonRect.height / 2,
          }
        : (emojiOrigins[emoji] ?? burstOrigin);
      const id = (flightSeq.current += 1);
      setEmojiTap((current) => ({ emoji, count: (current?.count ?? 0) + 1 }));
      setEmojiFlights((current) => [...current, { id, emoji, origin }]);
    },
    [wordId, emojiOrigins, burstOrigin],
  );
  // Drop a flight from the mounted set once its rise finishes, so held taps don't pile up.
  const retireEmojiFlight = useCallback((id: number) => {
    setEmojiFlights((current) => current.filter((flight) => flight.id !== id));
  }, []);

  return (
    <article
      ref={cardRef}
      className="vocab-card"
      style={
        twoColumn
          ? ({
              ...colors,
              "--vocab-word-col": `${(WIDE_WORD_COLUMN * 100).toFixed(2)}%`,
              "--vocab-panel-col": `${(WIDE_PANEL_COLUMN * 100).toFixed(2)}%`,
            } as CSSProperties)
          : colors
      }
      data-reveal-split={twoColumn ? "two-column" : undefined}
      data-theme={theme.id}
      data-tone={theme.tone}
      data-dialect={presentation.dialect === "douyin" ? "douyin" : undefined}
      data-export={exportLayout ? "" : undefined}
      data-export-progress={exportLayout?.showProgress || undefined}
      data-stage={isSpelling ? "spelling" : stage.id}
      inert={!active}
      aria-hidden={!active}
      aria-label={t(ui, "card.aria", { position: entry.position + 1 })}
      aria-posinset={entry.position + 1}
      aria-setsize={-1}
      onTouchStart={(e) => {
        const t = e.touches[0];
        if (t) handlePointerStart(t.clientX, t.clientY, e.target);
      }}
      onTouchMove={(e) => {
        const t = e.touches[0];
        if (t) handlePointerMove(t.clientX, t.clientY);
      }}
      onTouchEnd={(e) => {
        const t = e.changedTouches[0];
        if (t) handlePointerEnd(t.clientX, t.clientY);
      }}
      onTouchCancel={() => {
        gestureStart.current = null;
        releaseDrag();
      }}
      onMouseDown={(e) => {
        // Only for desktop click preview; store for mouse up
        if (e.button !== 0) return;
        handlePointerStart(e.clientX, e.clientY, e.target);
      }}
      onMouseUp={(e) => handlePointerEnd(e.clientX, e.clientY)}
    >
      <div className="vocab-backdrop" aria-hidden="true">
        {/* The backdrop, not the text, carries the idle motion: a slow sideways
            drift of the gradient itself. It only moves colors that are already in
            the palette, so the audited contrast floors hold wherever it drifts. */}
        <div
          className="vocab-backdrop-drift"
          // `data-strip` sizes the wrapper for the sliding strip and is set on EVERY card
          // that has one, playing or not, so a neighbour scrolling into view already shows
          // exactly the colours it will show as the word on screen.
          data-strip={sliding ? "" : undefined}
          data-drift={sweep ? "on" : drifted ? "held" : undefined}
        >
          <PostCanvasBackdrop
            postId={entry.occurrenceId}
            backgroundShiftPage={reducedMotion ? 0 : playback.page}
            sceneTheme={sceneTheme}
            patternTheme={patternTheme}
            slidingCanvasBackground={sliding}
            staticCanvasBackground={theme.paint}
            hasTransitionBackground={sweep || drifted}
          />
        </div>
      </div>
      {tapZone && !exportLayout && (
        <div className="vocab-tap-zone-highlight" data-zone={tapZone} aria-hidden="true" />
      )}
      {!exportLayout && (
        <>
          {/* Neither control ever animates its own opacity: an element below full opacity
              cannot sample what lies behind it, so its backdrop blur paints as a hard
              unblurred square until the fade ends. They fade by growing the tint and the
              blur radius from zero instead, with only the icon's opacity moving. */}
          {pausePop > 0 && !presentation.autoplay && !reducedMotion && (
            <div
              key={`pop-${pausePop}`}
              className="vocab-pause-pop"
              aria-hidden="true"
              onAnimationEnd={(event) => {
                if (event.target === event.currentTarget) setPausePop(0);
              }}
            >
              <Pause size={30} fill="currentColor" strokeWidth={0} />
            </div>
          )}
          <AnimatePresence>
            {current && !presentation.autoplay && !reducedMotion && pausePop === 0 && (
              <motion.button
                key="resume"
                type="button"
                className="vocab-resume"
                aria-label={t(ui, "card.resume")}
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1, transition: SPRING.gentle }}
                exit={RESUME_EXIT}
                whileTap={{ scale: 0.9 }}
                onClick={() => onToggleAutoplay?.()}
              >
                <motion.span exit={RESUME_ICON_EXIT}>
                  <Play size={30} fill="currentColor" strokeWidth={0} />
                </motion.span>
              </motion.button>
            )}
          </AnimatePresence>
        </>
      )}
      {isSpelling ? (
        isHan ? (
          <Suspense fallback={null}>
            <HanziStrokeSpelling word={entry.word.word} reducedMotion={reducedMotion} />
          </Suspense>
        ) : (
          <SpellingAnimation
            word={entry.word.word}
            variant={spellingVariant}
            reducedMotion={reducedMotion}
          />
        )
      ) : (
        <VocabularyStage
          stage={stage}
          word={entry.word}
          spec={{ ...canvas, text: stage.text, size: stage.reveal ? 128 : textSize }}
          background={theme.background}
          canvasWidth={stage.reveal ? revealCanvasWidth : textWidth}
          active={active}
          staged={started}
          playing={playback.playing}
          reducedMotion={reducedMotion}
          playKey={playKey}
          direction={nav.direction}
          dragX={dragX}
          allowFrameEmphasis={!landscape}
          // The highlight comes from the reveal style's own short pool, so the effect is a
          // property of the style and not of whichever word happened to land there.
          emphasisPool={style.emphasis}
          textBudget={textBudget}
          revealY={revealY}
          timeScale={paceFactor}
          onGrammarHold={exportLayout ? undefined : setGrammarHeld}
        />
      )}
      {isRevealed && (
        <EmojiBurst
          wordId={wordId}
          totals={emojiTotals}
          width={width}
          height={height}
          origins={emojiOrigins}
          originX={burstOrigin.x}
          originY={burstOrigin.y}
          spanSeconds={burstSpanSeconds}
          reducedMotion={reducedMotion}
        />
      )}
      {/* The reader's OWN reaction, kept separate from the community smoke: the burst
          above is keyed to the mocked crowd totals and deliberately ignores taps, so a
          tap used to only hop the strip badge. Each tap stamps the tapped emoji straight
          into the scene — crisp (no blur), larger, near-fully opaque. Every flight mounts
          and retires on its own, so tapping 🔥 five times sends five 🔥, not one redraw.
          A deterministic per-flight horizontal drift fans simultaneous taps out so the
          count reads as several distinct glyphs instead of one overlapping stack. */}
      {isRevealed &&
        emojiFlights.map((flight) => {
          const drift = ((flight.id % 5) - 2) * 9;
          return (
            <motion.span
              key={`emoji-self-${flight.id}`}
              className="vocab-emoji-self"
              style={{ left: flight.origin.x, top: flight.origin.y }}
              initial={{ opacity: 0, scale: 0.5, x: 0, y: 0 }}
              animate={
                reducedMotion
                  ? {
                      opacity: [0, 1, 1, 0],
                      scale: [0.5, 1.12, 1.12, 1],
                      x: [0, drift * 0.4, drift, drift],
                      y: 0,
                    }
                  : {
                      opacity: [0, 1, 1, 0],
                      scale: [0.5, 1.35, 1.22, 1.06],
                      x: [0, drift * 0.4, drift, drift],
                      y: [0, -height * 0.12, -height * 0.3, -height * 0.44],
                    }
              }
              transition={{
                duration: reducedMotion ? 0.6 : 1.25,
                ease: "easeOut",
                times: [0, 0.2, 0.7, 1],
              }}
              onAnimationComplete={() => retireEmojiFlight(flight.id)}
              aria-hidden="true"
            >
              {flight.emoji}
            </motion.span>
          );
        })}
      {exportLayout?.showBrand && (
        <p className="vocab-export-brand" aria-hidden="true">
          anh.chay<span>Lá</span>
        </p>
      )}
      {!isSpelling && <p className="vocab-stage-label">{stage.label}</p>}
      <div className="vocab-progress" aria-label={`Trang ${playback.page + 1} / ${pageCount}`}>
        {pageKeys.map((key, index) => (
          <span key={key} data-complete={index < playback.page}>
            {index === playback.page && (
              <i
                // Keyed on the page alone. `playing` used to be part of the key, which
                // remounted the bar — refilling it from empty — on every pause and resume;
                // animation-play-state below is what actually holds it in place.
                key={playKey}
                style={{
                  animationDuration: `${playback.duration}ms`,
                  animationPlayState: playback.playing ? "running" : "paused",
                }}
              />
            )}
          </span>
        ))}
      </div>

      {!exportLayout && report.mounted && (
        <WordReportPanel
          closing={report.closing}
          wordId={wordId}
          stageId={isSpelling ? "spelling" : stage.id}
          alreadyReported={reported}
          onSent={markReported}
          onClose={closeReport}
        />
      )}
      <div
        className="vocab-action-bar"
        ref={actionBarRef}
        data-anticipation={showEmojiStrip || undefined}
        data-no-gesture
      >
        {/* The report button keeps the left end of the row to itself and stays put
            across the reveal; the reveal / heart / bookmark group (and later the emoji
            strip) is centred in the room beside it. */}
        <WordReportButton
          buttonRef={reportButton}
          open={reportOpen}
          reported={reported}
          onToggle={() => (reportOpen ? closeReport() : setReportOpen(true))}
        />
        <MotionConfig reducedMotion={reducedMotion ? "always" : "never"}>
          <div className="vocab-action-main">
            <AnimatePresence mode="wait">
              {showEmojiStrip ? (
                <motion.div
                  key="emoji-strip"
                  ref={emojiStripRef}
                  className="vocab-emoji-strip"
                  variants={stripVariants}
                  initial="hidden"
                  animate={leaving ? "leave" : "shown"}
                  exit="leave"
                  inert={leaving || undefined}
                >
                  {EMOJI_PALETTE.map((emoji, index) => {
                    const count = emojiCounts[emoji] ?? 0;
                    const tapped = emojiTap?.emoji === emoji;
                    return (
                      // The wrapper carries the motion so the button's own :active
                      // press scale is never overwritten by an inline transform.
                      <motion.span
                        key={emoji}
                        className="vocab-motion-item"
                        variants={stripItemVariants}
                        custom={index}
                      >
                        <button
                          type="button"
                          className="vocab-emoji-strip-btn"
                          data-emoji={emoji}
                          onClick={(e) => handleEmojiTap(emoji, e.currentTarget)}
                          aria-label={`React with ${emoji}${count ? `, ${count} so far` : ""}`}
                        >
                          <span
                            key={`glyph-${tapped ? emojiTap.count : 0}`}
                            className="vocab-emoji-glyph"
                            data-pop={tapped || undefined}
                          >
                            {emoji}
                          </span>
                          {tapped && (
                            <span
                              key={`plus-${emojiTap.count}`}
                              className="vocab-emoji-plus"
                              aria-hidden="true"
                            >
                              +1
                            </span>
                          )}
                          {count > 0 && (
                            // Keyed on the value so a changed count rolls in instead of
                            // silently swapping its digits.
                            <span
                              key={`count-${count}`}
                              className="vocab-emoji-strip-count"
                              aria-hidden="true"
                            >
                              {formatEmojiTotal(count)}
                            </span>
                          )}
                        </button>
                      </motion.span>
                    );
                  })}
                  <motion.div
                    className="vocab-emoji-strip-sep"
                    aria-hidden="true"
                    variants={stripItemVariants}
                    custom={EMOJI_PALETTE.length}
                  />
                  <motion.span
                    className="vocab-motion-item"
                    variants={stripItemVariants}
                    custom={EMOJI_PALETTE.length + 1}
                  >
                    <button
                      type="button"
                      className="vocab-emoji-strip-btn vocab-reaction-heart"
                      data-on={reactions.heart || undefined}
                      onClick={() => toggleReaction("heart")}
                      aria-label={reactions.heart ? t(ui, "card.unheart") : t(ui, "card.heart")}
                    >
                      <span
                        key={pops.heart}
                        className="vocab-pop"
                        data-pop={(pops.onStrip && pops.heart > 0) || undefined}
                      >
                        <Heart size={16} fill={reactions.heart ? "currentColor" : "none"} />
                      </span>
                    </button>
                  </motion.span>
                  <motion.span
                    className="vocab-motion-item"
                    variants={stripItemVariants}
                    custom={EMOJI_PALETTE.length + 2}
                  >
                    <button
                      type="button"
                      className="vocab-emoji-strip-btn vocab-reaction-bookmark"
                      data-on={reactions.bookmark || undefined}
                      onClick={() => toggleReaction("bookmark")}
                      aria-label={reactions.bookmark ? t(ui, "card.unsave") : t(ui, "card.save")}
                    >
                      <span
                        key={pops.bookmark}
                        className="vocab-pop"
                        data-pop={(pops.onStrip && pops.bookmark > 0) || undefined}
                      >
                        <Bookmark size={16} fill={reactions.bookmark ? "currentColor" : "none"} />
                      </span>
                    </button>
                  </motion.span>
                </motion.div>
              ) : (
                <motion.div
                  key="action-bar"
                  className="vocab-action-row"
                  variants={rowVariants}
                  initial="hidden"
                  animate={entered || exportLayout ? "shown" : "hidden"}
                  exit="hidden"
                >
                  {!stage.reveal && (
                    <motion.span className="vocab-motion-item" variants={rowItemVariants}>
                      <button
                        type="button"
                        className="vocab-reveal-button vocab-reveal-pill"
                        onClick={playback.reveal}
                        aria-label={t(ui, "card.revealAria")}
                      >
                        {revealButtonLabel || t(ui, "card.reveal")}
                      </button>
                    </motion.span>
                  )}
                  <motion.div className="vocab-reaction" variants={rowItemVariants}>
                    <button
                      type="button"
                      className="vocab-reaction-button vocab-reaction-heart"
                      data-on={reactions.heart || undefined}
                      onClick={() => toggleReaction("heart")}
                      aria-label={reactions.heart ? t(ui, "card.unheart") : t(ui, "card.heart")}
                    >
                      <span
                        key={pops.heart}
                        className="vocab-pop"
                        data-pop={(!pops.onStrip && pops.heart > 0) || undefined}
                      >
                        <Heart size={17} fill={reactions.heart ? "currentColor" : "none"} />
                      </span>
                    </button>
                    <span key={heartsLabel} className="vocab-reaction-count">
                      {heartsLabel}
                    </span>
                  </motion.div>
                  <motion.div className="vocab-reaction" variants={rowItemVariants}>
                    <button
                      type="button"
                      className="vocab-reaction-button vocab-reaction-bookmark"
                      data-on={reactions.bookmark || undefined}
                      onClick={() => toggleReaction("bookmark")}
                      aria-label={reactions.bookmark ? t(ui, "card.unsave") : t(ui, "card.save")}
                    >
                      <span
                        key={pops.bookmark}
                        className="vocab-pop"
                        data-pop={(!pops.onStrip && pops.bookmark > 0) || undefined}
                      >
                        <Bookmark size={17} fill={reactions.bookmark ? "currentColor" : "none"} />
                      </span>
                    </button>
                    <span key={bookmarksLabel} className="vocab-reaction-count">
                      {bookmarksLabel}
                    </span>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </MotionConfig>
      </div>
    </article>
  );
}

/** Compact local tap-count label shown under a reaction button. */
function formatReactionCount(value: number): string {
  if (!value) return "";
  if (value >= 1000) {
    const thousands = value / 1000;
    return `${thousands >= 10 ? Math.round(thousands) : thousands.toFixed(1).replace(/\.0$/, "")}k`;
  }
  return String(value);
}
