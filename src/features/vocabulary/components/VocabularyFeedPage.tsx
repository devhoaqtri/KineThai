/** Public vocabulary page orchestration. Exports: VocabularyFeedPage. Depends on: controls, stream, reduced-motion preference, font readiness, track rotation. */
import { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { useStreak } from "../hooks/useStreak";
import { useQuery } from "@tanstack/react-query";
import { useScreenWakeLock } from "@/hooks/use-screen-wake-lock";
import { useShellHeightVar } from "@/hooks/use-shell-height-var";
import type { FeedPage, Presentation, VocabularyFilters } from "../types";
import { DIFFICULTY_ALL } from "../lib/difficulty";
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
import { dailyBadgeBlurb, dailyBadgeTitle, dailyTier } from "../lib/streak-tiers";
import { usePresence } from "@/hooks/use-presence";
import { getActiveVocabWording } from "@/features/admin/api/wording.functions";
import { FeedControls } from "./FeedControls";
import { VocabularyStream } from "./VocabularyStream";
import { SavedDrawer } from "./SavedDrawer";
import { StreakCelebration } from "./StreakCelebration";
import { wordBadgeBlurb, wordBadgeTitle, wordTier } from "../lib/word-badges";
import { DifficultyOnboarding } from "./DifficultyOnboarding";
import { levelLadderFor } from "../lib/level-ladder";
import { readDifficultyChoice, writeDifficultyChoice } from "../lib/difficulty-choice";
import { readDialectChoice, writeDialectChoice } from "../lib/dialect-choice";
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
  }));
  // The dialect is a device-level preference: remember it the moment it flips so
  // the next visit to this host opens in the same visual language.
  const handlePresentation = useCallback(
    (next: Presentation) => {
      if (next.dialect !== presentation.dialect) writeDialectChoice(next.dialect ?? "default");
      setPresentation(next);
    },
    [presentation.dialect],
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
  // page is server-rendered), then either the first-load level picker or the feed. The
  // stream is not mounted before that, so it never starts on "every level" only to be
  // thrown away a moment later for the level the reader actually keeps.
  const [stage, setStage] = useState<"pending" | "onboarding" | "feed">("pending");
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
      setStage("onboarding");
      return;
    }
    setFilters((current) => ({ ...current, difficulty: stored }));
    setStage("feed");
  }, [effectiveLocale, preferredJapaneseLevel]);
  const pickDifficulty = useCallback((difficulty: string) => {
    writeDifficultyChoice(difficulty);
    setFilters((current) => ({ ...current, difficulty }));
    setSeed(newSeed());
    setStage("feed");
  }, []);
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
  // On-device only, like the saved words beside it: no account, no table, nothing leaves.
  const streak = useStreak();
  // The daily goals count the same finished words as the streak, so one handler feeds both.
  const daily = useDailyGoal();
  const ui = useLocale();
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
  // Each word that comes on screen is logged to the viewing history and counted
  // towards the current music track's run.
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
      const level = wordTrackLevel(word);
      // An imported pack's words are not the catalog's, so they do not fill its levels.
      if (level && !packName) recordLevel(level, word.id);
      music.wordStarted();
    },
    [recordView, recordLevel, packName, music],
  );
  const shuffle = () => {
    setSeed(newSeed());
    setOptionsOpen(false);
  };
  if (stage !== "feed") {
    return (
      <main className="vocabulary-shell" ref={shell}>
        {stage === "onboarding" && (
          <DifficultyOnboarding
            metadata={levelLadderFor(effectiveLocale)}
            locale={effectiveLocale}
            onPick={pickDifficulty}
          />
        )}
      </main>
    );
  }
  return (
    <DeckLocaleContext.Provider value={effectiveLocale}>
      <main className="vocabulary-shell" ref={shell}>
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
            // The level chosen here is the one the next visit opens on.
            if (value.difficulty !== filters.difficulty) writeDifficultyChoice(value.difficulty);
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
            <button type="button" onClick={clearCustomPack} aria-label={t(ui, "pack.chipClose")}>
              ×
            </button>
          </div>
        )}
        <SavedDrawer open={savedOpen} onOpenChange={setSavedOpen} />
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
              unit: t(ui, "onboard.wordsUnit"),
              count: daily.celebrating.times,
              title: dailyBadgeTitle(daily.celebrating.goal, daily.celebrating.times, ui),
              blurb: dailyBadgeBlurb(daily.celebrating.goal, daily.celebrating.times, ui),
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
                unit: t(ui, "onboard.wordsUnit"),
                title: wordBadgeTitle(wordCelebration, effectiveLocale, ui),
                blurb: wordBadgeBlurb(wordCelebration, effectiveLocale, ui),
              }}
            />
          )
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
            streak.celebrating !== null ||
            wordCelebration !== null ||
            daily.celebrating !== null
          }
          exportOpen={isAdmin && exportOpen}
          onCloseExport={closeExport}
          history={viewHistory.history}
          onRecordView={handleRecordView}
          onWordEnding={music.wordEnding}
          onWordFinished={handleWordFinished}
          onClearHistory={viewHistory.clear}
          onMetadata={setMetadata}
          onRestart={shuffle}
          onClearFilters={() => {
            writeDifficultyChoice(ALL_FILTERS.difficulty);
            rememberJapaneseLevel("");
            setFilters(ALL_FILTERS);
          }}
          revealButtonLabel={activeWording?.reveal_button}
          onToggleAutoplay={() => setPresentation((p) => ({ ...p, autoplay: !p.autoplay }))}
        />
      </main>
    </DeckLocaleContext.Provider>
  );
}
