/** Bounded, bidirectional query state for a single vocabulary stream. Exports: useVocabularyFeed. Depends on: React Query, fetch adapter, feed fallbacks, backfill bounds, session tracker. */
import { useEffect, useMemo, useRef } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { loadVocabularyPage, VocabularyRequestError } from "../api/feed";
import { VOCAB_MAX_PAGES } from "../lib/backfill";
import { backgroundRetryDelay, classifyFeedFailure } from "../lib/feed-fallback";
import type { FeedCursor, FeedPage, VocabularyFilters, TargetLocale } from "../types";
import { markReportedOnce, reportVisitorEvent } from "@/lib/session-tracker";

/** The cursor a page hands on: a recovered stream keeps its derived seed and filters. */
function cursorFrom(page: FeedPage, position: number): FeedCursor {
  return {
    position,
    revision: page.revision,
    token: page.cursor,
    seed: page.seed,
    ...(page.scope ? { scope: page.scope } : {}),
  };
}

/** The server's own word on when to ask again, when it refused for rate. */
function rateLimitWait(error: unknown): number | null {
  return error instanceof VocabularyRequestError && error.code === "RATE_LIMITED"
    ? (error.retryAfterMs ?? 60_000)
    : null;
}

/** Load deterministic pages, retaining at most VOCAB_MAX_PAGES of them. @param seed Stable visit seed. @param filters Content filters. @param locale Target locale override. @returns Query and flattened cards. */
export function useVocabularyFeed(seed: string, filters: VocabularyFilters, locale?: TargetLocale) {
  const client = useQueryClient();
  const queryKey = useMemo(
    () => ["vocabulary", seed, filters.topic, filters.level, filters.difficulty, locale],
    [seed, filters.topic, filters.level, filters.difficulty, locale],
  );
  const query = useInfiniteQuery({
    queryKey,
    initialPageParam: { position: 0 } as FeedCursor,
    // Every fallback (backoff, fresh stream, wider filters) is spent inside the page load,
    // so what reaches the query as an error is what none of them could fix.
    queryFn: ({ pageParam, signal }) =>
      loadVocabularyPage({ seed, filters, cursor: pageParam, signal }, locale),
    getNextPageParam: (last) =>
      last.nextPosition === null ? undefined : cursorFrom(last, last.nextPosition),
    getPreviousPageParam: (first) =>
      first.previousPosition === null ? undefined : cursorFrom(first, first.previousPosition),
    maxPages: VOCAB_MAX_PAGES,
    staleTime: Infinity,
    gcTime: 0,
    // A first page that failed for a passing reason — a server restart, a deploy swap, a
    // phone dropping signal — backs off for ~15 s, and returning to the tab or regaining
    // the network asks again at once. None of this may touch a stream that has loaded:
    // staleTime Infinity was not enough on its own. Measured: focusing the tab while a next
    // page had failed refetched every buffered page at once (ten requests against a
    // 30-a-minute budget). A loaded stream retries only its failed page
    // (useFeedPagination).
    refetchOnWindowFocus: (current) => current.state.data === undefined,
    refetchOnReconnect: (current) => current.state.data === undefined,
    // A first page that failed after every fallback keeps asking on its own: a rate
    // refusal exactly when the server's Retry-After says, anything passing on a growing
    // backoff. A loaded stream is retried by useFeedPagination instead.
    refetchInterval: (current) =>
      current.state.status === "error" && current.state.data === undefined
        ? (backgroundRetryDelay(
            classifyFeedFailure(current.state.error, 0),
            Math.max(0, current.state.fetchFailureCount - 1),
            rateLimitWait(current.state.error),
          ) ?? false)
        : false,
    // The page load already retried with backoff (lib/feed-fallback).
    retry: false,
  });
  useEffect(
    () => () => {
      void client.cancelQueries({ queryKey, exact: true });
    },
    [client, queryKey],
  );

  // Session-level telemetry. One load is reported per visit, but every distinct
  // failure is, so the failure rate reflects retries rather than hiding them.
  const prevStatusRef = useRef<"pending" | "success" | "error">("pending");
  useEffect(() => {
    const status = query.isLoading ? "pending" : query.isError ? "error" : "success";
    if (status === prevStatusRef.current) return;
    prevStatusRef.current = status;

    if (status === "success" && query.data?.pages.length) {
      if (!markReportedOnce("vocabulary_feed.loaded")) return;
      reportVisitorEvent({
        type: "page.loaded",
        metadata: {
          surface: "vocabulary_feed",
          entries: query.data.pages.flatMap((p) => p.entries).length,
        },
      });
    } else if (status === "error" && query.error) {
      reportVisitorEvent({
        type: "page.failed",
        message: query.error instanceof Error ? query.error.message : String(query.error),
        metadata: {
          surface: "vocabulary_feed",
          code: query.error instanceof VocabularyRequestError ? query.error.code : null,
        },
      });
    }
  }, [query.isLoading, query.isError, query.error, query.data]);

  const entries = useMemo(
    () => query.data?.pages.flatMap((page) => page.entries) ?? [],
    [query.data],
  );
  const catalogChanged =
    query.error instanceof VocabularyRequestError && query.error.code === "CATALOG_CHANGED";
  // A stream left open past its cursor's lifetime; the fix is the same fresh restart.
  const streamExpired =
    query.error instanceof VocabularyRequestError && query.error.code === "STREAM_EXPIRED";
  const needsRestart = catalogChanged || streamExpired;
  // When a refused stream will ask again by itself, so the panel can say so.
  const wait = rateLimitWait(query.error);
  const retryAt = wait === null ? null : query.errorUpdatedAt + wait;
  // A refusal of the stream itself (the browser gate) is the one failure no retry can fix.
  const failureKind = query.error ? classifyFeedFailure(query.error, entries.length ? 1 : 0) : null;
  return {
    ...query,
    entries,
    metadata: query.data?.pages[0],
    catalogChanged,
    streamExpired,
    needsRestart,
    retryAt,
    failureKind,
  };
}
