/** Public vocabulary page orchestration. Exports: VocabularyFeedPage. Depends on: controls, stream, reduced-motion preference, font readiness, track rotation. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { useStreak } from "../hooks/useStreak";
import { useQuery } from "@tanstack/react-query";
import { useScreenWakeLock } from "@/hooks/use-screen-wake-lock";
import { useShellHeightVar } from "@/hooks/use-shell-height-var";
import type { FeedPage, Presentation, VocabularyFilters } from "../types";
import { DIFFICULTY_ALL, clampDifficultyToDeck } from "../lib/difficulty";
import {
  isJapaneseLevel,
  wordTrackLevel,
  type VocabularyLevel,
  type VocabularyWord,
} from "../lib/schema";
import { rememberRecallWord } from "../lib/recall-words";
import { SHORT_VIEWPORT_MAX_H } from "../lib/landscape-geometry";
import { useIsAdmin } from "@/features/admin/hooks/useIsAdmin";
import { useFontsReady } from "../hooks/useFontsReady";
import { useTrackRotation } from "../hooks/useTrackRotation";
import { useViewHistory } from "../hooks/useViewHistory";
import { useLevelProgress } from "../hooks/useLevelProgress";
import { useDailyGoal } from "../hooks/useDailyGoal";
import { useBadgeInbox } from "../hooks/useBadgeInbox";
import { badgeKey } from "../lib/badge-inbox";
import { dailyBadgeBlurb, dailyBadgeTitle, dailyTier } from "../lib/streak-tiers";
import { usePresence } from "@/hooks/use-presence";
import { getActiveVocabWording } from "@/features/admin/api/wording.functions";
import { FeedControls } from "./FeedControls";
import { VocabularyStream, type StreamDemo } from "./VocabularyStream";
import { SavedDrawer } from "./SavedDrawer";
import { StreakCelebration } from "./StreakCelebration";
import { wordBadgeBlurb, wordBadgeTitle, wordTier } from "../lib/word-badges";
import { DifficultyOnboarding } from "./DifficultyOnboarding";
import { levelLadderFor } from "../lib/level-ladder";
import { readDifficultyChoice, writeDifficultyChoice } from "../lib/difficulty-choice";
import {
  DEMO_BADGE_MS,
  demoDifficulty,
  readDemoSeen,
  writeDemoSeen,
} from "../lib/first-visit";
import { HANDOVER_CHROME_MS, HANDOVER_RECEDE_MS, pickerEntrance } from "../lib/picker-entrance";
import { readDialectChoice, writeDialectChoice } from "../lib/dialect-choice";
import { readGrammarExpand, writeGrammarExpand } from "../lib/grammar-expand";
import { readPreferences, writePreferences } from "@/features/settings/lib/preferences";
import { DEFAULT_TARGET, type TargetLocale } from "../lib/target-language";
import { CUSTOM_PACK_EVENT, clearCustomPack, readCustomPack } from "../lib/custom-pack";
import { DeckLocaleContext } from "../lib/deck-locale";
import { t } from "../lib/ui-copy";
import { useLocale } from "../lib/useLocale";
import { Link } from "@tanstack/react-router";
import "../vocabulary.css";

/** How long the "your pack" bar stays up after a pack starts playing. */
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
export function VocabularyFeedPage({ locale }: { locale?: TargetLocale }) {
  const [prefs] = useState(() => readPreferences());
  // Use targetLanguage from preferences if set, otherwise use the host-based locale.
  const effectiveLocale: TargetLocale =
    (prefs.targetLanguage as TargetLocale) || locale || DEFAULT_TARGET;
  // Settings only exposes the Japanese proficiency for a Japanese deck.
  // A non-empty level seeds the level filter only; difficulty remains independent.
  const preferredJapaneseLevel: VocabularyLevel | "" =
    effectiveLocale === "ja" && isJapaneseLevel(prefs.japaneseLevel) ? prefs.japaneseLevel : "";
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
    dialect: effectiveLocale === "zh" ? readDialectChoice() : "default",
    expandGrammar: readGrammarExpand(),
  }));
  // The dialect is a device-level preference: remember it the moment it flips so
  // the next visit to this host opens in the same visual language.
  const handlePresentation = useCallback(
    (next: Presentation) => {
      if (next.dialect !== presentation.dialect) writeDialectChoice(next.dialect ?? "default");
      if (next.expandGrammar !== presentation.expandGrammar)
        writeGrammarExpand(!!next.expandGrammar);
      setPresentation(next);
    },
    [presentation.dialect, presentation.expandGrammar],
  );
  // Keep the Settings proficiency in step with a level chosen from the feed itself.
  // Difficulty choices never write this preference.
  const rememberJapaneseLevel = useCallback(
    (level: VocabularyFilters["level"]) => {
      if (effectiveLocale !== "ja") return;
      const japaneseLevel = isJapaneseLevel(level) ? level : "";
      const current = readPreferences();
      if (current.japaneseLevel === japaneseLevel) return;
      writePreferences({ ...current, japaneseLevel });
    },
    [effectiveLocale],
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
  // The pack bar announces a pack when it starts, then gets out of the way: the title's
  // sub-line keeps naming the pack, and the picker is where it is changed.
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
      if (pack) {
        setFilters(ALL_FILTERS);
        setPresentation((p) => ({ ...p, theme: "mix", style: "mix" }));
        setStage("feed");
      } else {
        // Back to the built-in deck on the reader's own level, not on "every level": a
        // pack plays all of its words, but that was never a choice to keep afterwards.
        // The Japanese school level (a separate filter) is restored from Settings too.
        setFilters((current) => ({
          ...current,
          level: preferredJapaneseLevel,
          difficulty: readDifficultyChoice(effectiveLocale) ?? DIFFICULTY_ALL,
        }));
      }
      setSeed(newSeed());
    };
    window.addEventListener(CUSTOM_PACK_EVENT, sync);
    return () => window.removeEventListener(CUSTOM_PACK_EVENT, sync);
  }, [effectiveLocale, preferredJapaneseLevel]);
  useEffect(() => {
    const pack = readCustomPack();
    if (pack) {
      setPackName(pack.catalog.name);
      setStage("feed");
      return;
    }
    const stored = readDifficultyChoice(effectiveLocale);
    // The Settings level seeds only the level filter; the stored difficulty choice is
    // applied alongside it, never replaced by it.
    if (preferredJapaneseLevel) {
      setFilters({
        ...ALL_FILTERS,
        level: preferredJapaneseLevel,
        difficulty: stored ?? DIFFICULTY_ALL,
      });
      setStage("feed");
      return;
    }
    if (stored === null) {
      // Japanese is the app's default deck. A first-time reader should see the
      // complete catalog immediately, not a level picker that hides words until
      // they choose; the difficulty menu can still narrow the stream afterwards.
      if (effectiveLocale === "ja") {
        setFilters(ALL_FILTERS);
        setStage("feed");
        return;
      }
      if (readDemoSeen()) {
        setStage("onboarding");
        return;
      }
      // The demo plays the easiest level the deck has. That is not a choice: no level is
      // written until the reader picks one, so the next visit still asks.
      const difficulty = demoDifficulty(effectiveLocale, levelLadderFor(effectiveLocale));
      setFilters((current) => ({ ...current, difficulty }));
      setStage("demo");
      return;
    }
    setFilters((current) => ({ ...current, difficulty: stored }));
    setStage("feed");
  }, [effectiveLocale, preferredJapaneseLevel]);
  // A stored track that this deck has not shipped yet ("vỡ lòng" on a deck that starts at
  // N3, say) would stream 0 matching words and strand the reader on "no words match". As
  // soon as the catalog's populated levels arrive, step the choice down to the tracks the
  // deck can serve and persist that, so subsequent visits open straight on words.
  // Keyed on `metadata` (not `locale`): `metadata` only arrives from the mounted stream's
  // first page, so `metadata.trackLevels ?? metadata.levels` is guaranteed to describe the deck
  // the reader is on — never a stale page from the one they just left.
  useEffect(() => {
    if (packName) return; // an imported pack plays every word; nothing to clamp
    if (inDemo) return; // the demo's level is not the reader's; never store it
    const availableLevels = metadata?.trackLevels ?? metadata?.levels;
    if (!availableLevels?.length) return;
    const safe = clampDifficultyToDeck(filters.difficulty, availableLevels);
    if (safe === filters.difficulty) return;
    writeDifficultyChoice(effectiveLocale, safe);
    setFilters((current) => ({ ...current, difficulty: safe }));
    setSeed(newSeed());
  }, [metadata, packName, filters.difficulty, inDemo, effectiveLocale]);
  const pickDifficulty = useCallback(
    (difficulty: string) => {
      writeDifficultyChoice(effectiveLocale, difficulty);
      setFilters((current) => ({ ...current, difficulty }));
      setSeed(newSeed());
      setStage("feed");
    },
    [effectiveLocale],
  );
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
  const ui = useLocale();
  const demo = useMemo<StreamDemo | undefined>(
    () =>
      inDemo
        ? { badge: t(ui, "demo.wordHook"), badgeMs: DEMO_BADGE_MS, onDone: finishDemo }
        : undefined,
    [inDemo, finishDemo, ui],
  );
  // The saved drawer suspends the feed behind it rather than navigating away.
  const [savedOpen, setSavedOpen] = useState(false);
  // The landscape chrome measures itself against this, not against dvh, and the
  // short-viewport tier is keyed on the same measurement (data-short-viewport).
  const shell = useRef<HTMLElement>(null);
  useShellHeightVar(shell, { shortMaxHeight: SHORT_VIEWPORT_MAX_H });
  const [optionsOpen, setOptionsOpen] = useState(false);
  // Video export is an admin tool; for everyone else the control is never rendered
  // and the studio's code is never downloaded.
  const isAdmin = useIsAdmin();
  const [exportOpen, setExportOpen] = useState(false);
  const openExport = useCallback(() => {
    setOptionsOpen(false);
    setExportOpen(true);
  }, []);
  const closeExport = useCallback(() => setExportOpen(false), []);
  const viewHistory = useViewHistory();
  // How far into each level the reader has got: lasts beyond the week the history keeps.
  const levelProgress = useLevelProgress(effectiveLocale);
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
  // A badge waits here until it has really been shown, so a reload can't lose it.
  const inbox = useBadgeInbox();
  const badge = inbox.current;
  const finishStreak = streak.finish;
  const finishDaily = daily.finish;
  const handleWordFinished = useCallback(
    (wordId: string) => {
      finishStreak(wordId);
      finishDaily(wordId);
    },
    [finishStreak, finishDaily],
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
  const handleRecordView = useCallback(
    (word: VocabularyWord) => {
      recordView(word.id);
      rememberRecallWord(word);
      const level = wordTrackLevel(word);
      // An imported pack's words are not the catalog's, so they do not fill its levels. Nor
      // do the demo's: they were played for the reader, not chosen by them.
      if (level && !packName && !inDemo) recordLevel(level, word.id);
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
    <DeckLocaleContext.Provider value={effectiveLocale}>
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
              locale={effectiveLocale}
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
                  writeDifficultyChoice(effectiveLocale, value.difficulty);
                  if (inDemo) setStage("feed");
                }
                if (value.level !== filters.level) rememberJapaneseLevel(value.level);
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
              onExport={isAdmin ? openExport : undefined}
            />
            {packName && packNoticePresence.mounted && (
              <div
                className="vocab-custom-pack-chip"
                role="status"
                data-closing={packNoticePresence.closing || undefined}
              >
                <Link to="/feed/library" className="vocab-custom-pack-name">
                  {t(ui, "pack.chipLabel", { name: packName })}
                </Link>
                <button
                  type="button"
                  onClick={clearCustomPack}
                  aria-label={t(ui, "pack.chipClose")}
                >
                  ×
                </button>
              </div>
            )}
            <SavedDrawer open={savedOpen} onOpenChange={setSavedOpen} />
            {/* Beside the drawer rather than inside the card: the word is finished at the moment
            the stream starts scrolling to the next one, so a card-level badge would ride out
            of frame half-played. Keyed on the milestone so each one replays from its start.
            It covers the screen, so it suspends the stream below like any other overlay. */}
            {badge?.kind === "streak" && (
              <StreakCelebration
                key={badgeKey(badge)}
                days={badge.days}
                reducedMotion={reducedMotion}
                onDone={inbox.dismiss}
              />
            )}
            {badge?.kind === "daily" && (
              <StreakCelebration
                key={badgeKey(badge)}
                days={badge.goal}
                reducedMotion={reducedMotion}
                onDone={inbox.dismiss}
                badge={{
                  tier: dailyTier(badge.goal),
                  unit: t(ui, "onboard.wordsUnit"),
                  count: badge.times,
                  title: dailyBadgeTitle(badge.goal, badge.times, ui),
                  blurb: dailyBadgeBlurb(badge.goal, badge.times, ui),
                }}
              />
            )}
            {badge?.kind === "word" && (
              <StreakCelebration
                key={badgeKey(badge)}
                days={badge.milestone.words}
                reducedMotion={reducedMotion}
                onDone={inbox.dismiss}
                badge={{
                  tier: wordTier(badge.milestone),
                  unit: t(ui, "onboard.wordsUnit"),
                  title: wordBadgeTitle(badge.milestone, effectiveLocale, ui),
                  blurb: wordBadgeBlurb(badge.milestone, effectiveLocale, ui),
                }}
              />
            )}
            <VocabularyStream
              key={`${packName ?? ""}:${seed}:${filters.topic}:${filters.level}:${filters.difficulty}`}
              seed={seed}
              filters={filters}
              locale={effectiveLocale}
              presentation={presentation}
              reducedMotion={reducedMotion}
              suspended={
                optionsOpen ||
                savedOpen ||
                !fontsReady ||
                exportOpen ||
                badge !== null ||
                stage === "handover"
              }
              exportOpen={isAdmin && exportOpen}
              onCloseExport={closeExport}
              history={viewHistory.history}
              onRecordView={handleRecordView}
              onWordShown={music.wordStarted}
              onWordEnding={music.wordEnding}
              // A demo word is not the reader's yet: it counts towards no streak or goal.
              onWordFinished={demo ? undefined : handleWordFinished}
              onClearHistory={viewHistory.clear}
              onMetadata={setMetadata}
              onRestart={shuffle}
              onClearFilters={() => {
                if (!demo) writeDifficultyChoice(effectiveLocale, ALL_FILTERS.difficulty);
                rememberJapaneseLevel("");
                setFilters(ALL_FILTERS);
              }}
              revealButtonLabel={activeWording?.reveal_button}
              onToggleAutoplay={() => setPresentation((p) => ({ ...p, autoplay: !p.autoplay }))}
              demo={demo}
            />
          </>
        )}
        {showPicker && (
          <DifficultyOnboarding
            metadata={levelLadderFor(effectiveLocale)}
            locale={effectiveLocale}
            onPick={pickDifficulty}
            afterDemo={afterDemo}
            reducedMotion={reducedMotion}
          />
        )}
      </main>
    </DeckLocaleContext.Provider>
  );
}
