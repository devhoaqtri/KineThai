/** Bounded, full-screen vocabulary stream and network states. Exports: VocabularyStream. Depends on: feed/window hooks, backfill bounds, VocabularyCard. */
import { Suspense, lazy, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useVocabularyFeed } from "../hooks/useVocabularyFeed";
import { useVocabularyWindow } from "../hooks/useVocabularyWindow";
import { useFeedPagination } from "../hooks/useFeedPagination";
import { canWalkFurther, getWalkedPositions } from "../lib/backfill";
import { formatCountdown, isWordAllowed, nextAvailableAt, type ViewHistory } from "../lib/history";
import type { FeedPage, Presentation, VocabularyFilters } from "../types";
import type { VocabularyLevel, VocabularyWord } from "../lib/schema";
import { DeckLocaleContext } from "../lib/deck-locale";
import { languageName } from "../lib/target-language";
import { VocabularyCard } from "./VocabularyCard";

// Local only: a production build has no export studio at all, and even in development it
// loads on demand, for an admin who opens it. Optional-chained like ambient.ts so bare-Node
// guard scripts can import this module without a top-level throw.
const ExportStudio =
  (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true
    ? lazy(() => import("./ExportStudio").then((module) => ({ default: module.ExportStudio })))
    : null;

/** How long a word must hold the screen before it counts as seen. */
const VIEW_DWELL_MS = 900;

/** Row id of the page that closes the stream once every word in the pool has been shown. */
const FEED_END_ID = "feed-end";

/** Render a single mounted session; remount on shuffle/filter changes. @param props Session and UI choices. @returns Virtualized feed. */
export function VocabularyStream({
  seed,
  filters,
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
  const query = useVocabularyFeed(seed, filters);
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
                    : `Gợi ý tiếng Việt, từ mới tiếng ${deckLanguage}. Không cần đăng nhập.`}
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
      {ExportStudio && exportOpen && activeEntry && onCloseExport && (
        <Suspense fallback={null}>
          <ExportStudio entry={activeEntry} presentation={presentation} onClose={onCloseExport} />
        </Suspense>
      )}
      {visibleEntries.length > 0 && (
        <>
          {(query.error || query.isPaused) && (
            <div className="vocab-stream-status" role="status">
              <span>
                {query.catalogChanged
                  ? "Có bộ từ mới. Khởi động lại để tải."
                  : query.streamExpired
                    ? "Phiên xem đã hết hạn. Khởi động lại để xem tiếp."
                    : query.isPaused
                      ? "Mất mạng — các từ đã tải vẫn xem được."
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
