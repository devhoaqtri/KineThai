/** Bounded, full-screen vocabulary stream and network states. Exports: VocabularyStream. Depends on: feed/window hooks, backfill bounds, VocabularyCard. */
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { useVocabularyFeed } from "../hooks/useVocabularyFeed";
import { useVocabularyWindow } from "../hooks/useVocabularyWindow";
import { useFeedPagination } from "../hooks/useFeedPagination";
import { canWalkFurther, getWalkedPositions } from "../lib/backfill";
import { formatCountdown, isWordAllowed, nextAvailableAt, type ViewHistory } from "../lib/history";
import { t } from "../lib/ui-copy";
import { useLocale } from "../lib/useLocale";
import type { FeedPage, Presentation, TargetLocale, VocabularyFilters } from "../types";
import type { VocabularyWord } from "../lib/schema";
import { VocabularyCard } from "./VocabularyCard";

// Admin-only, and only on demand: readers never download the export studio.
const ExportStudio = lazy(() =>
  import("./ExportStudio").then((module) => ({ default: module.ExportStudio })),
);

/** How long a word must hold the screen before it counts as seen. */
const VIEW_DWELL_MS = 900;

/**
 * TEMPORARY, KineThai-only: never park on a dead end. The ja/th listings are
 * small, so a reader burns through every word and the repeat caps then block
 * the whole pool ("seen everything" + countdown) or the walk ends at the
 * restart panel. While this is on, blocked words keep showing (repeats) and a
 * finished walk reshuffles itself, so the feed runs endlessly. Revert when the
 * listing grows; never merge upstream.
 */
const ENDLESS_STREAM = true;

/** Row id of the page that closes the stream once every word in the pool has been shown. */
const FEED_END_ID = "feed-end";

/** Render a single mounted session; remount on shuffle/filter changes. @param props Session and UI choices. @returns Virtualized feed. */
export function VocabularyStream({
  seed,
  filters,
  locale,
  presentation,
  reducedMotion,
  suspended,
  history,
  onRecordView,
  onWordEnding,
  onWordFinished,
  exportOpen = false,
  onCloseExport,
  onClearHistory,
  onMetadata,
  onRestart,
  onClearFilters,
  revealButtonLabel,
  onToggleAutoplay,
}: {
  seed: string;
  filters: VocabularyFilters;
  /** Visited host's deck locale; keeps fallback paging on the same deck as the page. */
  locale?: TargetLocale;
  presentation: Presentation;
  reducedMotion: boolean;
  suspended: boolean;
  history: ViewHistory;
  /** A word was read: its id, and its level when it has one (for level progress). */
  onRecordView: (word: VocabularyWord) => void;
  /** The on-screen word reached its final page; ms left before the stream moves on. */
  onWordEnding?: (remainingMs: number) => void;
  /** A word was finished; the feed records it against the reader's daily streak. */
  onWordFinished?: (wordId: string) => void;
  /** Show the video-export studio for the on-screen word (the caller gates this to admins). */
  exportOpen?: boolean;
  onCloseExport?: () => void;
  onClearHistory: () => void;
  onMetadata: (page: FeedPage) => void;
  onRestart: () => void;
  onClearFilters: () => void;
  /** Custom label for the reveal button, from admin wording presets. */
  revealButtonLabel?: string;
  /** Toggle autoplay from the card's center tap zone; flips presentation.autoplay. */
  onToggleAutoplay?: () => void;
}) {
  const query = useVocabularyFeed(seed, filters, locale);
  // Empty states, status line and feed landmark read in the active UI locale.
  const ui = useLocale();
  // Tick so day-window expiries re-evaluate without a reload.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  // Occurrences admitted before they were recorded stay mounted so the
  // current card never vanishes the moment its view is stored.
  const admitted = useRef(new Set<string>());
  const visibleEntries = useMemo(() => {
    const out: typeof query.entries = [];
    for (const entry of query.entries) {
      if (admitted.current.has(entry.occurrenceId)) {
        out.push(entry);
        continue;
      }
      if (isWordAllowed(history, entry.word.id, now)) {
        admitted.current.add(entry.occurrenceId);
        out.push(entry);
      }
    }
    // Endless mode: when caps would block the whole buffer, show it anyway
    // (repeats) instead of stranding the reader on the seen-everything panel.
    if (ENDLESS_STREAM && out.length === 0 && query.entries.length > 0) {
      return query.entries;
    }
    return out;
  }, [query.entries, history, now]);

  // Paging ceiling: the endpoint permutes the same pool forever, so hasNextPage stays
  // true even when every word it can offer is already buffered (and blocked by the
  // day history). Without this bound the backfill effect below re-arms on every
  // response — measured at ~144 requests/second with the pool exhausted — and each
  // cycle re-renders the empty-state panel, which is why the “Xóa lịch sử xem”
  // button flickered too fast to read or tap while no word ever played.
  const canFetchMorePositions = canWalkFurther(
    query.metadata?.matching ?? 0,
    getWalkedPositions(query.entries),
  );
  // Every word the pool holds is buffered: the stream ends on a page of its own after
  // the last word, rather than a toast that can only restart the feed.
  const poolDone = visibleEntries.length > 0 && (!query.hasNextPage || !canFetchMorePositions);
  const rows = useMemo(
    () => (poolDone ? [...visibleEntries, { occurrenceId: FEED_END_ID }] : visibleEntries),
    [poolDone, visibleEntries],
  );

  // Neighbours stay mounted (and paused) while an overlay covers the feed. Unmounting
  // them and remounting the lot on close made every neighbour re-run its entrance and
  // re-measure at once, which flashed through several scenes before settling.
  const windowState = useVocabularyWindow(rows, 2);
  const feedForPaging = useMemo(
    () => ({ ...query, entries: visibleEntries }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query.data, query.hasNextPage, query.hasPreviousPage, query.isFetching, visibleEntries],
  );
  const retry = useFeedPagination(
    feedForPaging as unknown as ReturnType<typeof useVocabularyFeed>,
    windowState,
    canFetchMorePositions,
  );
  const {
    viewport,
    height,
    activeIndex,
    virtualizer,
    onScroll,
    onKeyDown,
    advanceFrom,
    flick,
    touchStarted,
  } = windowState;
  useEffect(() => {
    if (query.metadata) onMetadata(query.metadata);
  }, [query.metadata, onMetadata]);

  // Record a view once per occurrence — but only for a word the reader actually stayed on.
  // Recording the instant a card became active meant every card the scroll merely passed
  // through (a long flick, a snap that overshot and came back) was written to the history
  // and blocked for a day without ever having been read. The dwell is short enough that a
  // word someone glances at and deliberately skips still counts.
  const recorded = useRef(new Set<string>());
  const activeEntry = visibleEntries[activeIndex];
  const activeOccurrenceId = activeEntry?.occurrenceId;
  const activeWord = activeEntry?.word;
  useEffect(() => {
    if (!activeOccurrenceId || !activeWord || suspended) return;
    if (recorded.current.has(activeOccurrenceId)) return;
    const timer = setTimeout(() => {
      recorded.current.add(activeOccurrenceId);
      onRecordView(activeWord);
    }, VIEW_DWELL_MS);
    return () => clearTimeout(timer);
  }, [activeOccurrenceId, activeWord, suspended, onRecordView]);

  // The export studio needs a word. Opened with none on screen (empty stream, every
  // word blocked) it would render nothing while still holding the feed suspended, so
  // hand the request straight back.
  useEffect(() => {
    if (exportOpen && !activeEntry) onCloseExport?.();
  }, [exportOpen, activeEntry, onCloseExport]);

  // Endless mode: walking onto the feed-end card reshuffles (same as its button:
  // clear history, restart) instead of parking. Once per mount; never while an
  // overlay covers the feed, so a sheet never closes onto a swapped word.
  const restartedAtEnd = useRef(false);
  useEffect(() => {
    if (!ENDLESS_STREAM || suspended || restartedAtEnd.current) return;
    if (rows[activeIndex]?.occurrenceId !== FEED_END_ID) return;
    restartedAtEnd.current = true;
    onClearHistory();
    onRestart();
  }, [activeIndex, rows, suspended, onClearHistory, onRestart]);

  // Lift the on-screen card's palette accent onto the shared .vocabulary-shell so the
  // difficulty popover — a sibling of the stream, not a descendant of the card — can
  // paint its glass highlight and "Xong" button with the SAME accent as the card behind
  // it. Custom properties only inherit downward, so the card's inline --vocab-accent
  // can't reach the toolbar on its own; we copy the computed values up to the ancestor
  // both the stream and the toolbar sit under.
  useEffect(() => {
    const shell = viewport.current?.closest(".vocabulary-shell") as HTMLElement | null;
    if (!shell) return;
    const card = viewport.current?.querySelector<HTMLElement>(
      ".vocab-slot[data-current] .vocab-card",
    );
    if (!card) {
      // No card on screen: drop the lifted values so the popover falls back to the
      // shell mint instead of sticking on a stale palette.
      shell.style.removeProperty("--popup-accent");
      shell.style.removeProperty("--popup-accent-ink");
      return;
    }
    const computed = getComputedStyle(card);
    const accent = computed.getPropertyValue("--vocab-accent").trim();
    const accentInk = computed.getPropertyValue("--vocab-button-ink").trim();
    if (accent) shell.style.setProperty("--popup-accent", accent);
    if (accentInk) shell.style.setProperty("--popup-accent-ink", accentInk);
  }, [activeIndex, activeEntry, presentation, suspended, viewport]);

  // Backfill: blocked words shrink the visible list, so pull more server
  // positions until enough showable words are buffered (bounded by maxPages and by
  // the paging ceiling above, which is what actually stops an exhausted pool).
  useEffect(() => {
    if (
      query.entries.length > 0 &&
      visibleEntries.length < 6 &&
      canFetchMorePositions &&
      query.hasNextPage &&
      !query.isFetching &&
      !query.isPaused &&
      !query.error
    ) {
      void query.fetchNextPage({ cancelRefetch: false });
    }
  }, [
    query.entries.length,
    visibleEntries.length,
    canFetchMorePositions,
    query.hasNextPage,
    query.isFetching,
    query.isPaused,
    query.error,
    query.fetchNextPage,
  ]);

  // Natural vertical flick gestures: flick up -> next word, flick down -> previous word
  const flickStart = useRef<{ x: number; y: number; t: number; index: number } | null>(null);
  const handleFlickStart = (x: number, y: number) => {
    // The row is captured HERE, at finger-down: by finger-up the native drag may already
    // have carried the feed onto the next word, and "one past whatever is on screen" would
    // then be two words on.
    flickStart.current = { x, y, t: Date.now(), index: touchStarted() };
  };
  const handleFlickEnd = (x: number, y: number) => {
    const start = flickStart.current;
    flickStart.current = null;
    if (!start || suspended) return;
    const dx = x - start.x;
    const dy = y - start.y;
    const dt = Date.now() - start.t;
    // Require a decisive vertical swipe; ignore horizontal card gestures
    if (Math.abs(dy) < 52 || Math.abs(dy) < Math.abs(dx) * 1.1) return;
    if (dt > 700) return;
    // Velocity hint: short duration + sufficient distance already gated; allow both directions
    // flick up -> next word, flick down -> previous word; always relative to the row the
    // gesture started on. The window clamps at either end.
    flick(start.index, dy < 0 ? 1 : -1, !reducedMotion);
  };

  const empty = query.isSuccess && !query.entries.length;
  const initialError = query.isError && !query.entries.length;
  // A prefetch that can no longer find unseen words must not hide the blocked state:
  // gating on bare isFetching made this panel blink once per request.
  const backfillInFlight = query.isFetching && canFetchMorePositions;
  const allBlocked =
    query.entries.length > 0 && visibleEntries.length === 0 && !backfillInFlight && !initialError;
  const nextUnlock = useMemo(() => {
    if (!allBlocked) return null;
    const ids = new Set(query.entries.map((entry) => entry.word.id));
    let target = Number.POSITIVE_INFINITY;
    for (const id of ids) target = Math.min(target, nextAvailableAt(history, id, now));
    return Number.isFinite(target) ? target : null;
  }, [allBlocked, query.entries, history, now]);

  return (
    <>
      <div
        ref={viewport}
        className="vocab-viewport"
        role="feed"
        aria-label={t(ui, "stream.feedAria")}
        aria-busy={query.isFetching}
        tabIndex={0}
        onScroll={onScroll}
        onKeyDown={onKeyDown}
        onTouchStart={(e) => {
          const t = e.touches[0];
          if (t) handleFlickStart(t.clientX, t.clientY);
        }}
        onTouchEnd={(e) => {
          const t = e.changedTouches[0];
          if (t) handleFlickEnd(t.clientX, t.clientY);
        }}
        inert={suspended}
      >
        {!visibleEntries.length && (
          <div className="vocab-empty" role="status">
            <p className="vocab-eyebrow">{t(ui, "stream.eyebrow")}</p>
            <h1>
              {initialError
                ? t(ui, "stream.empty.title")
                : empty
                  ? t(ui, "stream.noMatch")
                  : allBlocked
                    ? t(ui, "stream.seenAll")
                    : query.isPaused
                      ? t(ui, "stream.paused")
                      : query.entries.length
                        ? t(ui, "stream.searchingSeen")
                        : t(ui, "stream.searchingFirst")}
            </h1>
            <p>
              {initialError
                ? t(ui, "stream.loadError")
                : empty
                  ? t(ui, "stream.noMatchHint")
                  : allBlocked
                    ? `${t(ui, "stream.memory")}${
                        nextUnlock
                          ? t(ui, "stream.nextUnlock", {
                              countdown: formatCountdown(nextUnlock, now, ui),
                            })
                          : ""
                      }`
                    : t(ui, "stream.tagline")}
            </p>
            {initialError && !query.retryAt && (
              <button
                type="button"
                className="vocab-light-button"
                onClick={query.needsRestart ? onRestart : retry}
              >
                {query.needsRestart ? t(ui, "stream.restart") : t(ui, "stream.retry")}
              </button>
            )}
            {empty && (
              <button type="button" className="vocab-light-button" onClick={onClearFilters}>
                {t(ui, "stream.showAll")}
              </button>
            )}
            {allBlocked && (
              <button type="button" className="vocab-light-button" onClick={onClearHistory}>
                {t(ui, "stream.clearHistory")}
              </button>
            )}
          </div>
        )}
        <div className="vocab-virtual-track" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((item) => {
            if (rows[item.index]?.occurrenceId === FEED_END_ID) {
              return (
                <div
                  key={item.key}
                  className="vocab-slot"
                  style={{ height, transform: `translateY(${item.start}px)` }}
                >
                  <div className="vocab-empty vocab-feed-end" role="status">
                    <p className="vocab-eyebrow">{t(ui, "stream.feedEnd.eyebrow")}</p>
                    <h1>{t(ui, "stream.feedEnd.title")}</h1>
                    <p>{t(ui, "stream.feedEnd.body")}</p>
                    <button
                      type="button"
                      className="vocab-light-button"
                      onClick={() => {
                        onClearHistory();
                        onRestart();
                      }}
                    >
                      {t(ui, "stream.clearHistory")}
                    </button>
                  </div>
                </div>
              );
            }
            const entry = visibleEntries[item.index];
            if (!entry) return null;
            return (
              <div
                key={item.key}
                className="vocab-slot"
                // Marks the on-screen word even while the stream is suspended (every
                // card is inert then), so the floating chrome can keep following its
                // tone from CSS.
                data-current={item.index === activeIndex || undefined}
                style={{ height, transform: `translateY(${item.start}px)` }}
              >
                <VocabularyCard
                  key={`${entry.occurrenceId}:${presentation.style}:${presentation.dialect ?? ""}`}
                  entry={entry}
                  current={item.index === activeIndex}
                  active={item.index === activeIndex && !suspended}
                  presentation={presentation}
                  reducedMotion={reducedMotion}
                  matching={query.metadata?.matching ?? 0}
                  canAdvance={activeIndex < rows.length - 1}
                  onAdvance={() => advanceFrom(entry.occurrenceId)}
                  onWordEnding={onWordEnding}
                  onWordFinished={onWordFinished}
                  revealButtonLabel={revealButtonLabel}
                  onToggleAutoplay={onToggleAutoplay}
                />
              </div>
            );
          })}
        </div>
      </div>
      {exportOpen && activeEntry && onCloseExport && (
        <Suspense fallback={null}>
          <ExportStudio entry={activeEntry} presentation={presentation} onClose={onCloseExport} />
        </Suspense>
      )}
      {visibleEntries.length > 0 && (
        <>
          {(query.error || query.isPaused) && (
            <div className="vocab-stream-status" role="status">
              <span>
                {query.needsRestart
                  ? t(ui, "stream.newCatalog")
                  : query.isPaused
                    ? t(ui, "stream.offline")
                    : t(ui, "stream.loadMoreFail")}
              </span>
              <button
                type="button"
                onClick={query.needsRestart ? onRestart : retry}
                disabled={query.isFetching}
              >
                {query.needsRestart ? t(ui, "stream.restart") : t(ui, "stream.retry")}
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
