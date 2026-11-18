/** Public vocabulary page orchestration. Exports: VocabularyFeedPage. Depends on: controls, stream, reduced-motion preference, font readiness, track rotation. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { useStreak } from "../hooks/useStreak";
import { useQuery } from "@tanstack/react-query";
import { useScreenWakeLock } from "@/hooks/use-screen-wake-lock";
import { useShellHeightVar } from "@/hooks/use-shell-height-var";
import type { FeedPage, Presentation, VocabularyFilters } from "../types";
import type { VocabularyLevel, VocabularyWord } from "../lib/schema";
import { rememberRecallWord } from "../lib/recall-words";
import { clampDifficultyToDeck, DIFFICULTY_ALL } from "../lib/difficulty";
import { SHORT_VIEWPORT_MAX_H } from "../lib/landscape-geometry";
import { useCanExport } from "@/features/admin/hooks/useCanExport";
import { useFontsReady } from "../hooks/useFontsReady";
import { useTrackRotation } from "../hooks/useTrackRotation";
import { useViewHistory } from "../hooks/useViewHistory";
import { useLevelProgress } from "../hooks/useLevelProgress";
import { useDailyGoal } from "../hooks/useDailyGoal";
import {
  dailyBadgeBlurb,
  dailyBadgeSubtitle,
  dailyBadgeTitle,
  dailyTier,
} from "../lib/streak-tiers";
import { usePresence } from "@/hooks/use-presence";
import { getActiveVocabWording } from "@/features/admin/api/wording.functions";
import { FeedControls } from "./FeedControls";
import { VocabularyStream, type StreamDemo } from "./VocabularyStream";
import { SavedDrawer } from "./SavedDrawer";
import { StorageAccessDialog } from "./StorageAccessDialog";
import { StreakCelebration } from "./StreakCelebration";
import { wordBadgeBlurb, wordBadgeTitle, wordTier } from "../lib/word-badges";
import { DifficultyOnboarding } from "./DifficultyOnboarding";
import { levelLadderFor } from "../lib/level-ladder";
import { readDifficultyChoice, writeDifficultyChoice } from "../lib/difficulty-choice";
import {
  DEMO_BADGE_MS,
  WORD_HOOK,
  demoDifficulty,
  readDemoSeen,
  writeDemoSeen,
} from "../lib/first-visit";
import { HANDOVER_CHROME_MS, HANDOVER_RECEDE_MS, pickerEntrance } from "../lib/picker-entrance";
import { readDialectChoice, writeDialectChoice } from "../lib/dialect-choice";
import { readGrammarExpand, writeGrammarExpand } from "../lib/grammar-expand";
import type { TargetLocale } from "../lib/target-language";
import { CUSTOM_PACK_EVENT, clearCustomPack, readCustomPack } from "../lib/custom-pack";
import { DeckLocaleContext } from "../lib/deck-locale";
import { loadDemoDeck } from "../lib/demo-deck";
import { useServedWord } from "../hooks/useServedWord";
import { Link } from "@tanstack/react-router";

// The export studio and the recorder's scenes style themselves from this sheet. The recorder
// drives this page too, so it loads here on the dev server; production builds never see it.
// Optional-chained like ambient.ts so bare-Node guard scripts can import this module safely.
if ((import.meta as { env?: { DEV?: boolean } }).env?.DEV === true)
  void import("../vocabulary-export.css");
import "../vocabulary.css";

/** How long the "Gói của bạn" bar stays up after a pack starts playing. */
const PACK_NOTICE_MS = 4000;
/** Its fade-out; matches .vocab-custom-pack-chip[data-closing] in vocabulary.css. */
const PACK_NOTICE_EXIT_MS = 320;

function newSeed(): string {
  const values = new Uint32Array(4);
  globalThis.crypto.getRandomValues(values);
  return Array.from(values, (value) => value.toString(16).padStart(8, "0")).join("");
}

/** Every word, no category and no difficulty track. */
const ALL_FILTERS: VocabularyFilters = { topic: "", level: "", difficulty: DIFFICULTY_ALL };

/**
 * Open the word stream without authentication or persistent storage.
 * @param props.locale Visited address's deck locale; the toolbar title follows it.
 * @returns Public feed and preferences.
 */
export function VocabularyFeedPage({
  locale,
  sharedCode,
}: {
  locale?: TargetLocale;
  /**
   * A shared link's word code (`/w/<code>`): the feed opens on that word, played like any
   * other, and carries on with the reader's own stream after it.
   */
  sharedCode?: string;
}) {
  // The shared word is fetched before the stream mounts, so it is the first word on
  // screen rather than one that slides in above a word already playing. A code the deck no
  // longer has (or a failed lookup) opens the feed as usual.
  const sharedLookup = useMemo(() => (sharedCode ? { code: sharedCode } : null), [sharedCode]);
  const { word: sharedWord } = useServedWord(sharedLookup);
  const sharedPending = sharedCode !== undefined && sharedWord === undefined;
  // Passed to one stream only: the first to mount takes it, and a later one (a new level,
  // the feed after the level picker) opens on its own words.
  const [sharedTaken, setSharedTaken] = useState(false);
  const takeShared = useCallback(() => setSharedTaken(true), []);
  const [seed, setSeed] = useState(newSeed);
  const [filters, setFilters] = useState<VocabularyFilters>(ALL_FILTERS);
  const [presentation, setPresentation] = useState<Presentation>(() => ({
    theme: "mix",
    style: "mix",
    autoplay: true,
    advance: true,
    pace: "normal",
    // Only the Chinese host honors the stored Douyin-dialect preference; every
    // other address renders the default visuals even on a device that switched.
    dialect: locale === "zh" ? readDialectChoice() : "default",
    expandGrammar: readGrammarExpand(),
  }));
  // The dialect is a device-level preference: remember it the moment it flips so
  // the next visit to this host opens in the same visual language.
  const handlePresentation = useCallback(
    (next: Presentation) => {
      if (next.dialect !== presentation.dialect) writeDialectChoice(next.dialect ?? "default");
      if (next.expandGrammar !== presentation.expandGrammar) {
        writeGrammarExpand(!!next.expandGrammar);
      }
      setPresentation(next);
    },
    [presentation.dialect, presentation.expandGrammar],
  );
  const [metadata, setMetadata] = useState<FeedPage>();
  // "pending" until the stored choice has been read (storage is not readable while the
  // page is server-rendered), then the feed, or for a reader with no level yet the
  // first-visit demo (lib/first-visit) followed by the level picker. The stream is not
  // mounted before that, so it never starts on "every level" only to be thrown away a
  // moment later for the level the reader actually keeps. "handover" is the stretch between
  // the two where the finished demo word recedes under the picker building up over it
  // (lib/picker-entrance): both are mounted until the picker covers the screen.
  const [stage, setStage] = useState<"pending" | "demo" | "handover" | "onboarding" | "feed">(
    "pending",
  );
  // The demo's words are still on screen through the handover, and are still not the
  // reader's: nothing they do counts, and nothing they touch is stored.
  const inDemo = stage === "demo" || stage === "handover";
  // The picker says so when it follows the demo, rather than opening cold.
  const [afterDemo, setAfterDemo] = useState(false);
  // Imported pack (browser-only). Its own levels may not match a stored track, so it
  // skips onboarding, plays every word, and keeps theme/style on random mix.
  const [packName, setPackName] = useState<string | null>(null);
  // The "Gói của bạn" bar announces a pack when it starts, then gets out of the way: the
  // title's sub-line keeps naming the pack, and the picker is where it is changed.
  const [packNotice, setPackNotice] = useState(false);
  useEffect(() => {
    if (!packName) {
      setPackNotice(false);
      return;
    }
    setPackNotice(true);
    const timer = window.setTimeout(() => setPackNotice(false), PACK_NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [packName]);
  const packNoticePresence = usePresence(packNotice, PACK_NOTICE_EXIT_MS);
  useEffect(() => {
    const sync = () => {
      const pack = readCustomPack();
      setPackName(pack?.catalog.name ?? null);
      // metadata always describes the LAST page served, and pages come from whichever
      // source is now active — the pack or the built-in deck. Drop it on every transition
      // so the difficulty clamp (below) never reads levels from the source the reader has
      // just left; the next fetch replaces it with the current source's levels.
      setMetadata(undefined);
      if (pack) {
        setFilters(ALL_FILTERS);
        setPresentation((p) => ({ ...p, theme: "mix", style: "mix" }));
        setStage("feed");
      } else {
        // Back to the built-in deck on the reader's own level, not on "every level": a
        // pack plays all of its words, but that was never a choice to keep afterwards.
        // The saved choice is the right source — it is what a fresh visit opens on, and a
        // level confirmed while the pack played has already been written to it.
        setFilters((current) => ({
          ...current,
          difficulty: readDifficultyChoice(locale ?? "en") ?? DIFFICULTY_ALL,
        }));
      }
      setSeed(newSeed());
    };
    window.addEventListener(CUSTOM_PACK_EVENT, sync);
    return () => window.removeEventListener(CUSTOM_PACK_EVENT, sync);
  }, []);
  useEffect(() => {
    const pack = readCustomPack();
    if (pack) {
      setPackName(pack.catalog.name);
      setStage("feed");
      return;
    }
    const stored = readDifficultyChoice(locale ?? "en");
    if (stored === null) {
      if (readDemoSeen()) {
        setStage("onboarding");
        return;
      }
      // The demo plays the easiest level the deck has. That is not a choice: no level is
      // written until the reader picks one, so the next visit still asks.
      const difficulty = demoDifficulty(locale ?? "en", levelLadderFor(locale ?? "en"));
      // Start fetching the demo's word list now rather than when the stream mounts.
      void loadDemoDeck(locale ?? "en").catch(() => null);
      setFilters((current) => ({ ...current, difficulty }));
      setStage("demo");
      return;
    }
    setFilters((current) => ({ ...current, difficulty: stored }));
    setStage("feed");
  }, []);
  // A difficulty chosen on another language's deck can name a track this deck has not
  // reached — the ids are shared, the ceilings are not — and would stream nothing. Once the
  // served page reports its levels, drop any such choice to "every level" so the feed is
  // never blank, and remember the correction. It watches filters.difficulty, so it also
  // catches a selection made here, not just the stored one. The sync handler above clears
  // metadata on every pack/deck transition, so the levels here always describe the source
  // the reader is on — never a stale page from the one they just left.
  useEffect(() => {
    if (packName) return; // an imported pack plays every word; nothing to clamp
    if (inDemo) return; // the demo's level is not the reader's; never store it
    if (!metadata?.levels?.length) return;
    const safe = clampDifficultyToDeck(filters.difficulty, metadata.levels);
    if (safe === filters.difficulty) return;
    writeDifficultyChoice(locale ?? "en", safe);
    setFilters((current) => ({ ...current, difficulty: safe }));
    setSeed(newSeed());
  }, [metadata, packName, filters.difficulty, inDemo]);
  const pickDifficulty = useCallback((difficulty: string) => {
    writeDifficultyChoice(locale ?? "en", difficulty);
    setFilters((current) => ({ ...current, difficulty }));
    setSeed(newSeed());
    setStage("feed");
  }, []);
  // The demo is spent the moment it is on screen: this browser never shows it again, even
  // to a reader who leaves halfway, unless its storage is cleared. Written here rather than
  // where the stage is decided, which React's dev double-run would otherwise read back as
  // "already seen" and skip straight to the picker.
  useEffect(() => {
    if (stage === "demo") writeDemoSeen();
  }, [stage]);
  // The first demo word to play to its end hands the reader to the level picker: not in
  // one cut, but through the handover, which keeps that word on screen under the picker
  // as it builds up.
  const finishDemo = useCallback(() => {
    setAfterDemo(true);
    setStage("handover");
  }, []);
  // The demo plays its own short list from the page (lib/demo-deck), so a newcomer's first
  // word never waits on the server, but only on the demo's own filters: a level or topic the
  // reader picks mid-demo streams from the server like any feed.
  const deckLocale = locale ?? "en";
  const demoDeck =
    inDemo &&
    !packName &&
    filters.topic === "" &&
    filters.level === "" &&
    filters.difficulty === demoDifficulty(deckLocale, levelLadderFor(deckLocale))
      ? deckLocale
      : undefined;
  const demo = useMemo<StreamDemo | undefined>(
    () =>
      inDemo
        ? { badge: WORD_HOOK, badgeMs: DEMO_BADGE_MS, onDone: finishDemo, deck: demoDeck }
        : undefined,
    [inDemo, finishDemo, demoDeck],
  );
  // The saved drawer suspends the feed behind it rather than navigating away.
  const [savedOpen, setSavedOpen] = useState(false);
  // The landscape chrome measures itself against this, not against dvh, and the
  // short-viewport tier is keyed on the same measurement (data-short-viewport).
  const shell = useRef<HTMLElement>(null);
  useShellHeightVar(shell, { shortMaxHeight: SHORT_VIEWPORT_MAX_H });
  const [optionsOpen, setOptionsOpen] = useState(false);
  // Video export is a local admin tool: a production build has no control and no studio.
  const canExport = useCanExport();
  const [exportOpen, setExportOpen] = useState(false);
  const openExport = useCallback(() => {
    setOptionsOpen(false);
    setExportOpen(true);
  }, []);
  const closeExport = useCallback(() => setExportOpen(false), []);
  const viewHistory = useViewHistory();
  // How far into each level the reader has got: lasts beyond the week the history keeps.
  const levelProgress = useLevelProgress(locale ?? "en");
  const reducedMotion = !!useReducedMotion();
  // Once the picker covers the screen the demo word under it is taken off. The picker keeps
  // its place in the tree, so its entrance runs on undisturbed.
  useEffect(() => {
    if (stage !== "handover") return;
    const timer = setTimeout(
      () => setStage("onboarding"),
      pickerEntrance(true, reducedMotion).coverMs,
    );
    return () => clearTimeout(timer);
  }, [stage, reducedMotion]);
  // On-device only, like the saved words beside it: no account, no table, nothing leaves.
  const streak = useStreak();
  // The daily goals count the same finished words as the streak, so one handler feeds both.
  const daily = useDailyGoal();
  const finishStreak = streak.finish;
  const finishDaily = daily.finish;
  const releaseLevel = levelProgress.release;
  const handleWordFinished = useCallback(
    (wordId: string) => {
      finishStreak(wordId);
      finishDaily(wordId);
      // A word milestone was earned when the word was viewed; it is shown now, at the
      // word's end, with the streak and daily badges (useLevelProgress).
      releaseLevel();
    },
    [finishStreak, finishDaily, releaseLevel],
  );
  // No rotate-to-portrait gate here: the feed has its own landscape layout (two-column
  // answer page, compact chrome, measured shell height). The post-player surfaces, which
  // only letterbox, keep theirs. Keep the screen lit while the feed is open.
  useScreenWakeLock(true);
  // The stream still mounts and fetches while fonts load; only the text is held.
  const fontsReady = useFontsReady();
  // Each word that comes on screen counts towards the current music track's run; only a
  // word fully viewed (its answer held the screen) enters the viewing history.
  const music = useTrackRotation();
  const recordView = viewHistory.record;
  // Fetch the active wording preset for the reveal button label
  const { data: activeWording } = useQuery({
    queryKey: ["vocab-active-wording"],
    queryFn: getActiveVocabWording,
    staleTime: 60_000, // Cache for 1 minute
  });
  const recordLevel = levelProgress.record;
  const wordCelebration = levelProgress.celebrating;
  const handleRecordView = useCallback(
    (word: VocabularyWord) => {
      recordView(word.id);
      rememberRecallWord(word);
      // An imported pack's words are not the catalog's, so they do not fill its levels. Nor
      // do the demo's: they were played for the reader, not chosen by them.
      if (word.level && !packName && !inDemo) recordLevel(word.level, word.id);
    },
    [recordView, recordLevel, packName, inDemo],
  );
  const shuffle = () => {
    setSeed(newSeed());
    setOptionsOpen(false);
  };
  // Nothing is mounted while the stage is pending. The picker sits after the feed in the
  // same <main> in every stage, so the handover's switch from "handover" to "onboarding"
  // takes the feed off without remounting the picker mid-entrance.
  const showFeed = stage === "demo" || stage === "handover" || stage === "feed";
  const showPicker = stage === "handover" || stage === "onboarding";
  return (
    <DeckLocaleContext.Provider value={locale ?? "en"}>
      <main
        className="vocabulary-shell"
        ref={shell}
        data-handover={stage === "handover" ? "" : undefined}
        style={
          {
            "--handover-chrome": `${HANDOVER_CHROME_MS}ms`,
            "--handover-recede": `${HANDOVER_RECEDE_MS}ms`,
          } as React.CSSProperties
        }
      >
        {showFeed && (
          <>
            <FeedControls
              metadata={metadata}
              levelProgress={levelProgress.seen}
              filters={filters}
              locale={locale}
              presentation={presentation}
              onFilters={(value) => {
                // Confirming a picker without changing anything is not a new stream. A fresh
                // seed remounts the whole feed on a different word, so "Xong" on an untouched
                // difficulty list — or re-picking the topic already chosen — used to throw away
                // the word on screen for no reason the reader could see.
                if (
                  value.topic === filters.topic &&
                  value.level === filters.level &&
                  value.difficulty === filters.difficulty
                )
                  return;
                // The level chosen here is the one the next visit opens on. Picked during the
                // demo, it is also the reader's answer to the picker the demo leads to, so the
                // feed carries straight on with it.
                if (value.difficulty !== filters.difficulty) {
                  writeDifficultyChoice(locale ?? "en", value.difficulty);
                  if (inDemo) setStage("feed");
                }
                setFilters(value);
                setSeed(newSeed());
              }}
              onPresentation={handlePresentation}
              open={optionsOpen}
              onOpen={setOptionsOpen}
              reducedMotion={reducedMotion}
              history={viewHistory.history}
              historyStats={viewHistory.stats}
              onClearHistory={viewHistory.clear}
              onExport={canExport ? openExport : undefined}
            />
            {packName && packNoticePresence.mounted && (
              <div
                className="vocab-custom-pack-chip"
                role="status"
                data-closing={packNoticePresence.closing || undefined}
              >
                <Link to="/feed/library" className="vocab-custom-pack-name">
                  Gói của bạn: {packName}
                </Link>
                <button type="button" onClick={clearCustomPack} aria-label="Thoát gói của bạn">
                  ×
                </button>
              </div>
            )}
            <SavedDrawer open={savedOpen} onOpenChange={setSavedOpen} />
            {/* Why a greyed-out on-device control is off, opened by tapping one. */}
            <StorageAccessDialog />
            {/* Beside the drawer rather than inside the card: the word is finished at the moment
          the stream starts scrolling to the next one, so a card-level badge would ride out
          of frame half-played. Keyed on the milestone so each one replays from its start.
          It covers the screen, so it suspends the stream below like any other overlay. */}
            {streak.celebrating !== null ? (
              <StreakCelebration
                key={streak.celebrating}
                days={streak.celebrating}
                reducedMotion={reducedMotion}
                onDone={streak.dismiss}
              />
            ) : wordCelebration === null && daily.celebrating !== null ? (
              // A daily goal waits behind the other two, for the same reason.
              <StreakCelebration
                key={`daily:${daily.celebrating.goal}:${daily.celebrating.times}`}
                days={daily.celebrating.goal}
                reducedMotion={reducedMotion}
                onDone={daily.dismiss}
                badge={{
                  tier: dailyTier(daily.celebrating.goal),
                  unit: "từ",
                  count: daily.celebrating.times,
                  title: dailyBadgeTitle(daily.celebrating.goal, daily.celebrating.times),
                  subtitle: dailyBadgeSubtitle(daily.celebrating.times),
                  blurb: dailyBadgeBlurb(daily.celebrating.goal, daily.celebrating.times),
                }}
              />
            ) : (
              // A word milestone waits its turn behind a streak one rather than stacking on it.
              wordCelebration && (
                <StreakCelebration
                  key={`${wordCelebration.scope}:${wordCelebration.words}`}
                  days={wordCelebration.words}
                  reducedMotion={reducedMotion}
                  onDone={levelProgress.dismiss}
                  badge={{
                    tier: wordTier(wordCelebration),
                    unit: "từ",
                    title: wordBadgeTitle(wordCelebration, locale ?? "en"),
                    blurb: wordBadgeBlurb(wordCelebration, locale ?? "en"),
                  }}
                />
              )
            )}
            {!sharedPending && (
              <VocabularyStream
                key={`${packName ?? ""}:${seed}:${filters.topic}:${filters.level}:${filters.difficulty}`}
                seed={seed}
                filters={filters}
                presentation={presentation}
                reducedMotion={reducedMotion}
                suspended={
                  optionsOpen ||
                  savedOpen ||
                  !fontsReady ||
                  exportOpen ||
                  streak.celebrating !== null ||
                  wordCelebration !== null ||
                  daily.celebrating !== null ||
                  stage === "handover"
                }
                exportOpen={canExport && exportOpen}
                onCloseExport={closeExport}
                history={viewHistory.history}
                onRecordView={handleRecordView}
                onWordShown={music.wordStarted}
                onWordEnding={music.wordEnding}
                onWordEndingCancelled={music.wordEndingCancelled}
                // A demo word is not the reader's yet: it counts towards no streak or goal.
                onWordFinished={demo ? undefined : handleWordFinished}
                onClearHistory={viewHistory.clear}
                onMetadata={setMetadata}
                onRestart={shuffle}
                onClearFilters={() => {
                  if (!demo) writeDifficultyChoice(locale ?? "en", ALL_FILTERS.difficulty);
                  setFilters(ALL_FILTERS);
                }}
                revealButtonLabel={activeWording?.reveal_button}
                onToggleAutoplay={() => setPresentation((p) => ({ ...p, autoplay: !p.autoplay }))}
                demo={demo}
                lead={sharedTaken ? undefined : (sharedWord ?? undefined)}
                onLeadTaken={takeShared}
              />
            )}
          </>
        )}
        {showPicker && (
          <DifficultyOnboarding
            metadata={levelLadderFor(locale ?? "en")}
            locale={locale ?? "en"}
            onPick={pickDifficulty}
            afterDemo={afterDemo}
            reducedMotion={reducedMotion}
          />
        )}
      </main>
    </DeckLocaleContext.Provider>
  );
}
