/** Bounded, bidirectional query state for a single vocabulary stream. Exports: useVocabularyFeed. Depends on: React Query, fetch adapter, backfill bounds, session tracker. */
import { useEffect, useMemo, useRef } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { fetchVocabularyPage, VocabularyRequestError } from "../api/feed";
import { VOCAB_MAX_PAGES } from "../lib/backfill";
import type { FeedCursor, VocabularyFilters } from "../types";
import { markReportedOnce, reportVisitorEvent } from "@/lib/session-tracker";

/** Errors a retry cannot fix: the stream itself has to be restarted or the request changed. */
const TERMINAL_CODES = ["CATALOG_CHANGED", "STREAM_EXPIRED", "INVALID_REQUEST", "FORBIDDEN"];
/** Transient failures are retried this many times, backing off 1, 2, 4 then 8 s. */
const MAX_RETRIES = 4;

function isTerminal(error: unknown): boolean {
  return error instanceof VocabularyRequestError && TERMINAL_CODES.includes(error.code);
}

/** The server's own word on when to ask again, when it refused for rate. */
function rateLimitWait(error: unknown): number | null {
  return error instanceof VocabularyRequestError && error.code === "RATE_LIMITED"
    ? (error.retryAfterMs ?? 60_000)
    : null;
}

/** Load deterministic pages, retaining at most VOCAB_MAX_PAGES of them. @param seed Stable visit seed. @param filters Content filters. @returns Query and flattened cards. */
export function useVocabularyFeed(seed: string, filters: VocabularyFilters) {
  const client = useQueryClient();
  const queryKey = useMemo(
    () => ["vocabulary", seed, filters.topic, filters.level, filters.difficulty],
    [seed, filters.topic, filters.level, filters.difficulty],
  );
  const query = useInfiniteQuery({
    queryKey,
    initialPageParam: { position: 0 } as FeedCursor,
    queryFn: ({ pageParam, signal }) =>
      fetchVocabularyPage({ seed, filters, cursor: pageParam, signal }),
    getNextPageParam: (last) =>
      last.nextPosition === null
        ? undefined
        : { position: last.nextPosition, revision: last.revision, token: last.cursor },
    getPreviousPageParam: (first) =>
      first.previousPosition === null
        ? undefined
        : { position: first.previousPosition, revision: first.revision, token: first.cursor },
    maxPages: VOCAB_MAX_PAGES,
    staleTime: Infinity,
    gcTime: 0,
    // A first page that failed for a passing reason — a server restart, a deploy swap, a
    // phone dropping signal — backs off for ~15 s, and returning to the tab or regaining
    // the network asks again at once. None of this touches a stream that has loaded: with
    // staleTime Infinity a query holding pages is never stale, so focus and reconnect
    // refetch only a stream that has nothing to show yet.
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    // A rate refusal is not retried on a guess: asking again inside the window is refused
    // again. The stream waits exactly as long as the server's Retry-After says instead.
    refetchInterval: (current) =>
      current.state.status === "error" && current.state.data === undefined
        ? (rateLimitWait(current.state.error) ?? false)
        : false,
    retry: (attempt, error) =>
      !isTerminal(error) && rateLimitWait(error) === null && attempt < MAX_RETRIES,
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
  return {
    ...query,
    entries,
    metadata: query.data?.pages[0],
    catalogChanged,
    streamExpired,
    needsRestart,
    retryAt,
  };
}
