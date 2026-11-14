/** Bounded, full-screen vocabulary stream and network states. Exports: VocabularyStream, StreamDemo. Depends on: feed/window hooks, backfill bounds, VocabularyCard. */
import { Suspense, lazy, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useVocabularyFeed } from "../hooks/useVocabularyFeed";
import { useVocabularyWindow } from "../hooks/useVocabularyWindow";
import { useFeedPagination } from "../hooks/useFeedPagination";
import {
  canWalkFurther,
  getBlockedRun,
  holdAnchorRows,
  selectVisibleEntries,
  VOCAB_MAX_PAGES,
  wantsWordsAhead,
} from "../lib/backfill";
import { formatCountdown, isWordAllowed, nextAvailableAt, type ViewHistory } from "../lib/history";
import type { FeedEntry, FeedPage, Presentation, VocabularyFilters } from "../types";
import type { VocabularyLevel, VocabularyWord } from "../lib/schema";
import { DeckLocaleContext } from "../lib/deck-locale";
import { languageName, type TargetLocale } from "../lib/target-language";
import { VocabularyCard } from "./VocabularyCard";
import { DemoBadge } from "./DemoBadge";
import { pickBadgeVariant } from "../lib/badge-variants";

// Local only: a production build has no export studio at all, and even in development it
// loads on demand, for an admin who opens it. Optional-chained like ambient.ts so bare-Node
// guard scripts can import this module without a top-level throw.
const ExportStudio =
  (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true
    ? lazy(() => import("./ExportStudio").then((module) => ({ default: module.ExportStudio })))
    : null;

/**
 * How long a word must hold the screen before it counts as having come on screen, for the
 * music's run of words only. Entering the history takes far more: the card's answer page
 * has to have held the screen (VocabularyCard onViewed, lib/history VIEW_ANSWER_MS).
 */
const SHOWN_DWELL_MS = 900;

/**
 * A first visit's demo (lib/first-visit). Every word that comes on screen opens with the
 * badge, its card held on the first frame of its first page until the badge has gone, and
 * the first word to play to its end calls `onDone` instead of moving the stream on.
 */
export type StreamDemo = {
  /** The badge's text. */
  badge: string;
  /** How long the badge holds each word back. */
  badgeMs: number;
  /** A demo word reached its end (auto-finish or a coda tap). */
  onDone: () => void;
  /**
   * The deck whose demo list (lib/demo-deck) plays from the page itself, with no server
   * request. Unset once the reader changes a filter mid-demo: that stream is the server's.
   */
  deck?: TargetLocale;
};

/** Row id of the page that closes the stream once every word in the pool has been shown. */
const FEED_END_ID = "feed-end";

/** Render a single mounted session; remount on shuffle/filter changes. @param props Session and UI choices. @returns Virtualized feed. */
/** Occurrence id prefix of a shared word leading the stream; no server id starts so. */
const SHARED_OCCURRENCE = "shared:";

export function VocabularyStream({
  seed,
  filters,
  presentation,
  reducedMotion,
  suspended,
  history,
  onRecordView,
  onWordShown,
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
  demo,
  lead,
  onLeadTaken,
}: {
  seed: string;
  filters: VocabularyFilters;
  presentation: Presentation;
  reducedMotion: boolean;
  suspended: boolean;
  history: ViewHistory;
  /**
   * A word was fully viewed (its answer held the screen), so it enters the history: its id,
   * and its level when it has one (for level progress).
   */
  onRecordView: (word: VocabularyWord) => void;
  /** A word has held the screen for a moment (the music counts its run of words by this). */
  onWordShown?: () => void;
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
  /** Play the stream as a first visit's demo. */
  demo?: StreamDemo;
  /**
   * A word someone shared (`/w/<code>`), played first and then the stream as usual. Taken
   * once, at mount: a stream that remounts (a new level, topic or seed) opens on its own.
   */
  lead?: VocabularyWord;
  /** The stream has put the shared word first; the page passes it to no later stream. */
  onLeadTaken?: () => void;
}) {
  const query = useVocabularyFeed(seed, filters, demo?.deck);
  // The shared word leads, as one extra occurrence outside every server page, and the
  // stream's own copy of it (if it has one) is dropped so it never plays twice.
  const [leadWord] = useState(lead);
  useEffect(() => {
    if (leadWord) onLeadTaken?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const streamEntries = useMemo<FeedEntry[]>(
    () =>
      leadWord
        ? [
            {
              occurrenceId: `${SHARED_OCCURRENCE}${leadWord.id}`,
              position: -1,
              cycle: 0,
              word: leadWord,
            },
            ...query.entries.filter((entry) => entry.word.id !== leadWord.id),
          ]
        : query.entries,
    [leadWord, query.entries],
  );
  // The word on screen never leaves the list under the reader. The query keeps ten pages and
  // drops the oldest as one arrives, whatever it holds; the rows from the on-screen one up to
  // the first that survived are kept in place until the reader has moved past them
  // (lib/backfill holdAnchorRows). The anchor is the previous render's word on screen.
  const anchorId = useRef<string | null>(null);
  const heldRows = useRef<readonly FeedEntry[]>([]);
  const entries = useMemo(
    () => holdAnchorRows(heldRows.current, streamEntries, anchorId.current),
    [streamEntries],
  );
  useEffect(() => {
    heldRows.current = entries;
  }, [entries]);
  // Deck locale drives the "tiếng X" copy in the reader's labels and empty states, so a
  // Korean host never reads "Vốn từ tiếng Anh vô tận". Falls back to English without a
  // provider (see DeckLocaleContext).
  const deckLanguage = languageName(useContext(DeckLocaleContext));
  // Tick so day-window expiries re-evaluate without a reload.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  // Occurrences admitted before they were recorded stay mounted so the
  // current card never vanishes the moment its view is stored. When no more words can be
  // loaded (every fallback failed, or the device is offline), words already on the device
  // are served even if seen today, rather than an error.
  // A shared word is admitted from the start: the reader came for it, so the day history
  // that hides words already seen never hides it.
  const admitted = useRef(new Set<string>(leadWord ? [`${SHARED_OCCURRENCE}${leadWord.id}`] : []));
  const loadStalled = query.entries.length > 0 && (query.isError || query.isPaused);
  const visibleEntries = useMemo(
    () =>
      selectVisibleEntries(
        entries,
        admitted.current,
        (id) => isWordAllowed(history, id, now),
        loadStalled,
      ),
    [entries, history, now, loadStalled],
  );
  const visibleIds = useMemo(
    () => new Set(visibleEntries.map((entry) => entry.occurrenceId)),
    [visibleEntries],
  );

  // Paging ceiling: the endpoint permutes the same pool forever, so hasNextPage stays
  // true even when every word it can offer is already buffered (and blocked by the
  // day history). Without this bound the backfill effect below re-arms on every
  // response — measured at ~144 requests/second with the pool exhausted — and each
  // cycle re-renders the empty-state panel, which is why the “Xóa lịch sử xem”
  // button flickered too fast to read or tap while no word ever played.
  const canFetchMorePositions = canWalkFurther(
    query.metadata?.matching ?? 0,
    getBlockedRun(query.entries, visibleIds),
  );
  // Every word the pool holds is buffered: the stream ends on a page of its own after
  // the last word, rather than a toast that can only restart the feed.
  // Only once the server has answered: a shared word can be on screen before the first
  // page, while hasNextPage still reads false, and must not be followed by the end page.
  const poolDone =
    query.entries.length > 0 &&
    visibleEntries.length > 0 &&
    (!query.hasNextPage || !canFetchMorePositions);
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
    [
      query.data,
      query.error,
      query.hasNextPage,
      query.hasPreviousPage,
      query.isFetching,
      query.failureKind,
      query.retryAt,
      visibleEntries,
    ],
  );
  // A full buffer drops a page for every page that arrives, so it fetches only to find the
  // very next word (lib/backfill wantsWordsAhead), never a lookahead.
  const bufferFull = (query.data?.pages.length ?? 0) >= VOCAB_MAX_PAGES;
  const retry = useFeedPagination(
    feedForPaging as unknown as ReturnType<typeof useVocabularyFeed>,
    windowState,
    canFetchMorePositions,
    bufferFull,
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

  // A word enters the history only once it has been fully viewed: its card reports that
  // its answer held the screen (onViewed). Counting a word the moment it had been on screen
  // for under a second let every word the feed merely passed through — a cascade of
  // changing words, a long flick, a background tab — fill the history with words nobody
  // read, each then blocked for a day. Recorded once per occurrence.
  const recorded = useRef(new Set<string>());
  const recordViewed = (entry: FeedEntry) => {
    if (recorded.current.has(entry.occurrenceId)) return;
    recorded.current.add(entry.occurrenceId);
    onRecordView(entry.word);
  };
  const activeEntry = visibleEntries[activeIndex];
  const activeOccurrenceId = activeEntry?.occurrenceId;
  useEffect(() => {
    if (activeOccurrenceId) anchorId.current = activeOccurrenceId;
  }, [activeOccurrenceId]);
  // The music counts a word that held the screen for a moment, read or not.
  const shown = useRef(new Set<string>());
  useEffect(() => {
    if (!activeOccurrenceId || suspended || !onWordShown) return;
    if (shown.current.has(activeOccurrenceId)) return;
    const timer = setTimeout(() => {
      shown.current.add(activeOccurrenceId);
      onWordShown();
    }, SHOWN_DWELL_MS);
    return () => clearTimeout(timer);
  }, [activeOccurrenceId, suspended, onWordShown]);

  // The demo badge: the occurrence whose badge has already gone, so its card may play. It
  // only keeps the last one, so a word scrolled back to opens with the badge again, which
  // matches the card itself starting that word over. The clock does not run while the feed
  // is suspended (fonts still loading, a sheet open), so the badge is never spent unseen.
  const [introShown, setIntroShown] = useState<string | null>(null);
  const demoBadgeMs = demo?.badgeMs;
  const introPending =
    demoBadgeMs !== undefined && !!activeOccurrenceId && introShown !== activeOccurrenceId;
  useEffect(() => {
    if (!introPending || suspended || !activeOccurrenceId) return;
    const timer = setTimeout(() => setIntroShown(activeOccurrenceId), demoBadgeMs);
    return () => clearTimeout(timer);
  }, [introPending, suspended, activeOccurrenceId, demoBadgeMs]);

  // The export studio needs a word. Opened with none on screen (empty stream, every
  // word blocked) it would render nothing while still holding the feed suspended, so
  // hand the request straight back.
  useEffect(() => {
    if (exportOpen && !activeEntry) onCloseExport?.();
  }, [exportOpen, activeEntry, onCloseExport]);

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
      (!bufferFull || wantsWordsAhead(visibleEntries.length - 1 - activeIndex, true)) &&
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
    bufferFull,
    activeIndex,
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
        aria-label={`Vốn từ tiếng ${deckLanguage} vô tận`}
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
            <p className="vocab-eyebrow">Mỗi từ là một khởi đầu</p>
            <h1>
              {initialError
                ? query.retryAt
                  ? "Chờ một chút nhé."
                  : "Thử lại nhé."
                : empty
                  ? "Chưa có từ nào khớp."
                  : allBlocked
                    ? "Bạn đã xem hết mọi từ rồi."
                    : query.isPaused
                      ? "Đang chờ kết nối."
                      : query.entries.length
                        ? "Đang tìm một từ bạn chưa xem…"
                        : "Đang tìm từ đầu tiên của bạn…"}
            </h1>
            <p>
              {initialError
                ? query.retryAt
                  ? `Mạng của bạn vừa mở quá nhiều dòng từ. Từ sẽ tự tải lại sau ${formatCountdown(query.retryAt, now)}.`
                  : "Không tải được dòng từ. Cài đặt của bạn vẫn được giữ nguyên."
                : empty
                  ? "Hãy thử một cấp độ hoặc chủ đề khác."
                  : allBlocked
                    ? `Bộ nhớ trên thiết bị giữ mỗi từ ở mức một lần mỗi ngày, hai lần trong ba ngày, ba lần mỗi tuần.${
                        nextUnlock
                          ? ` Từ tiếp theo sẽ mở sau ${formatCountdown(nextUnlock, now)}.`
                          : ""
                      }`
                    : `Gợi ý tiếng Việt, từ mới tiếng ${deckLanguage}.`}
            </p>
            {initialError && !query.retryAt && (
              <button
                type="button"
                className="vocab-light-button"
                onClick={query.needsRestart ? onRestart : retry}
              >
                {query.needsRestart ? "Bắt đầu dòng mới" : "Thử lại"}
              </button>
            )}
            {empty && (
              <button type="button" className="vocab-light-button" onClick={onClearFilters}>
                Xem tất cả từ
              </button>
            )}
            {allBlocked && (
              <button type="button" className="vocab-light-button" onClick={onClearHistory}>
                Xóa lịch sử xem
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
                    <p className="vocab-eyebrow">Hết dòng từ</p>
                    <h1>Bạn đã xem hết mọi từ rồi.</h1>
                    <p>
                      Bộ nhớ trên thiết bị giữ mỗi từ ở mức một lần mỗi ngày, hai lần trong ba ngày,
                      ba lần mỗi tuần. Xóa lịch sử xem để mọi từ quay lại ngay.
                    </p>
                    <button
                      type="button"
                      className="vocab-light-button"
                      onClick={() => {
                        onClearHistory();
                        onRestart();
                      }}
                    >
                      Xóa lịch sử xem
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
                  active={
                    item.index === activeIndex &&
                    !suspended &&
                    !(demo && introShown !== entry.occurrenceId)
                  }
                  presentation={presentation}
                  reducedMotion={reducedMotion}
                  matching={query.metadata?.matching ?? 0}
                  canAdvance={activeIndex < rows.length - 1}
                  onAdvance={demo ? demo.onDone : () => advanceFrom(entry.occurrenceId)}
                  onWordEnding={onWordEnding}
                  onWordFinished={onWordFinished}
                  onViewed={() => recordViewed(entry)}
                  revealButtonLabel={revealButtonLabel}
                  onToggleAutoplay={onToggleAutoplay}
                />
              </div>
            );
          })}
        </div>
      </div>
      {demo && introPending && !suspended && (
        // Keyed on the word, so scrolling on mid-badge starts the next one from its top.
        <DemoBadge
          key={activeOccurrenceId}
          text={demo.badge}
          durationMs={demo.badgeMs}
          // Each word arrives in the next look of the rotation (lib/badge-variants).
          variant={pickBadgeVariant(activeIndex)}
        />
      )}
      {ExportStudio && exportOpen && activeEntry && onCloseExport && (
        <Suspense fallback={null}>
          <ExportStudio entry={activeEntry} presentation={presentation} onClose={onCloseExport} />
        </Suspense>
      )}
      {visibleEntries.length > 0 && (
        <>
          {/* A failed page is retried in the background while the reader still has words
              ahead; the error is only worth showing once they have reached the last one. */}
          {(query.isPaused || (query.error && activeIndex >= visibleEntries.length - 1)) && (
            <div className="vocab-stream-status" role="status">
              <span>
                {query.catalogChanged
                  ? "Có bộ từ mới. Khởi động lại để tải."
                  : query.streamExpired
                    ? "Phiên xem đã hết hạn. Khởi động lại để xem tiếp."
                    : query.isPaused
                      ? "Mất mạng — các từ đã tải vẫn xem được."
                      : query.retryAt
                        ? `Không tải thêm từ được. Tự thử lại sau ${formatCountdown(query.retryAt, now)}.`
                        : "Không tải thêm từ được."}
              </span>
              <button
                type="button"
                onClick={query.needsRestart ? onRestart : retry}
                disabled={query.isFetching}
              >
                {query.needsRestart ? "Khởi động lại" : "Thử lại"}
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
