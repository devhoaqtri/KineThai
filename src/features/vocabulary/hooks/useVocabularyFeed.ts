/** Bounded, bidirectional query state for a single vocabulary stream. Exports: useVocabularyFeed. Depends on: React Query, fetch adapter, feed fallbacks, backfill bounds, session tracker. */
import { useEffect, useMemo, useRef } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { loadVocabularyPage, VocabularyRequestError } from "../api/feed";
import { loadDemoDeck, readDemoPage } from "../lib/demo-deck";
import type { TargetLocale } from "../lib/target-language";
import { VOCAB_MAX_PAGES, VOCAB_PAGE_LIMIT } from "../lib/backfill";
import { backgroundRetryDelay, classifyFeedFailure } from "../lib/feed-fallback";
import type { FeedCursor, FeedPage, VocabularyFilters } from "../types";
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

/**
 * One page of a first visit's demo, from the list that ships with the page (lib/demo-deck),
 * so the first word needs no server. A deck with no list, or a list that fails to load,
 * streams from the server as any feed does.
 */
async function loadDemoOrServerPage(input: {
  seed: string;
  filters: VocabularyFilters;
  cursor: FeedCursor;
  signal: AbortSignal;
  locale: TargetLocale;
}): Promise<FeedPage> {
  const deck = await loadDemoDeck(input.locale).catch(() => null);
  if (!deck) return loadVocabularyPage(input);
  return readDemoPage(deck, input.locale, {
    seed: input.seed,
    ...input.filters,
    position: input.cursor.position,
    limit: VOCAB_PAGE_LIMIT,
  });
}

/**
 * Load deterministic pages, retaining at most VOCAB_MAX_PAGES of them.
 * @param seed Stable visit seed. @param filters Content filters.
 * @param demoLocale Set while a first visit's demo plays on its own filters: the pages come
 *   from that deck's demo list in the browser instead of the server.
 * @returns Query and flattened cards.
 */
export function useVocabularyFeed(
  seed: string,
  filters: VocabularyFilters,
  demoLocale?: TargetLocale,
) {
  const client = useQueryClient();
  const queryKey = useMemo(
    () => ["vocabulary", seed, filters.topic, filters.level, filters.difficulty, demoLocale ?? ""],
    [seed, filters.topic, filters.level, filters.difficulty, demoLocale],
  );
  const query = useInfiniteQuery({
    queryKey,
    initialPageParam: { position: 0 } as FeedCursor,
    // Every fallback (backoff, fresh stream, wider filters) is spent inside the page load,
    // so what reaches the query as an error is what none of them could fix.
    queryFn: ({ pageParam, signal }) =>
      demoLocale
        ? loadDemoOrServerPage({ seed, filters, cursor: pageParam, signal, locale: demoLocale })
        : loadVocabularyPage({ seed, filters, cursor: pageParam, signal }),
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
