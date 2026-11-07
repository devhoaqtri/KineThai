/** Edge prefetch, reconnect recovery and a bounded background retry. Exports: useFeedPagination. Depends on: query/window hooks, feed fallbacks. */
import { useCallback, useEffect, useRef } from "react";
import { backgroundRetryDelay } from "../lib/feed-fallback";
import type { useVocabularyFeed } from "./useVocabularyFeed";
import type { useVocabularyWindow } from "./useVocabularyWindow";

/** Prefetch only in the direction of travel. @param query Feed query. @param windowState Virtual viewport. @param canFetchMore Whether another forward page can still hold an unseen word. @returns Explicit retry handler. */
export function useFeedPagination(
  query: ReturnType<typeof useVocabularyFeed>,
  windowState: ReturnType<typeof useVocabularyWindow>,
  canFetchMore = true,
) {
  const { activeIndex, direction, adjusting } = windowState;
  const {
    entries,
    isFetching,
    error,
    hasNextPage,
    hasPreviousPage,
    fetchNextPage,
    fetchPreviousPage,
  } = query;
  useEffect(() => {
    if (adjusting.current || isFetching || error || !entries.length) return;
    if (
      direction.current === "next" &&
      canFetchMore &&
      activeIndex >= entries.length - 4 &&
      hasNextPage
    ) {
      void fetchNextPage({ cancelRefetch: false });
    } else if (direction.current === "previous" && activeIndex <= 3 && hasPreviousPage) {
      void fetchPreviousPage({ cancelRefetch: false });
    }
  }, [
    activeIndex,
    canFetchMore,
    direction,
    adjusting,
    entries,
    isFetching,
    error,
    hasNextPage,
    hasPreviousPage,
    fetchNextPage,
    fetchPreviousPage,
  ]);

  const { needsRestart, isFetchPreviousPageError, isFetchNextPageError, refetch } = query;
  const retry = useCallback(() => {
    if (isFetching || needsRestart) return;
    if (isFetchPreviousPageError) void fetchPreviousPage({ cancelRefetch: false });
    else if (isFetchNextPageError) void fetchNextPage({ cancelRefetch: false });
    else void refetch({ cancelRefetch: false });
  }, [
    isFetching,
    needsRestart,
    isFetchPreviousPageError,
    isFetchNextPageError,
    fetchPreviousPage,
    fetchNextPage,
    refetch,
  ]);
  useEffect(() => {
    const online = () => {
      if (error) retry();
    };
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, [error, retry]);

  // A loaded stream whose next page failed after every fallback keeps asking on its own,
  // on a growing backoff (or the server's Retry-After), while the reader reads what is
  // already loaded. Only a refusal no retry can fix waits for the button.
  const { failureKind, retryAt } = query;
  const failures = useRef(0);
  useEffect(() => {
    if (!error) failures.current = 0;
  }, [error]);
  useEffect(() => {
    if (!error || !entries.length || isFetching || needsRestart || !failureKind) return;
    const delay = backgroundRetryDelay(
      failureKind,
      failures.current,
      retryAt === null ? null : retryAt - Date.now(),
    );
    if (delay === null) return;
    const timer = setTimeout(() => {
      failures.current += 1;
      retry();
    }, delay);
    return () => clearTimeout(timer);
  }, [error, entries.length, isFetching, needsRestart, failureKind, retryAt, retry]);
  return retry;
}
