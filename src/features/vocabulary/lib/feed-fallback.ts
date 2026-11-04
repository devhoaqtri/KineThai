/**
 * The ordered recovery a feed page goes through before the reader is told it failed.
 *
 * Every level holds about a thousand words, so a stream that stops is never a deck that ran
 * out: it is a request that failed. This module turns each failure into the next thing to
 * try, in a fixed order, and only lets the error through once every step has been spent:
 *
 *   1. the page as asked, a passing failure (network, timeout, 5xx) retried with backoff;
 *   2. a stale stream — the revision moved (a deploy, or a word blocked or released, which
 *      folds into the revision), the signed cursor expired, or the cursor no longer parses —
 *      drops the cursor and starts a fresh stream on a derived seed, same filters;
 *   3. a page that comes back empty widens the filters: the level gives way to its track,
 *      then the topic, then the track, until the whole deck is in play.
 *
 * What is left — a rate refusal, a gate refusal, a network that stays down — is thrown, and
 * the stream answers it with the words it already holds (lib/backfill selectVisibleEntries)
 * and a background retry (backgroundRetryDelay). Each step is logged with its cause, so a
 * real failure stays visible in the dev console and the feed log even when the reader
 * never sees it.
 *
 * Pure apart from the injected fetcher, sleep and clock, so the order is unit-tested.
 *
 * Exports: FeedFailureKind, FeedRecoveryLog, RETRY_DELAYS_MS, classifyFeedFailure,
 *   widenFilters, deriveSeed, backgroundRetryDelay, loadFeedPageWithFallbacks
 * Depends on: types (FeedCursor, FeedPage, VocabularyFilters)
 */
import type { FeedCursor, FeedPage, VocabularyFilters } from "../types";

/** What a failure means for the stream. */
export type FeedFailureKind = "transient" | "rate-limited" | "stale-stream" | "refused";

/** One recovery step, as logged: what went wrong and what is tried next. */
export type FeedRecoveryLog = (cause: string, detail: Record<string, unknown>) => void;

/** Backoff between attempts at one request: four retries after the first try. */
export const RETRY_DELAYS_MS: readonly number[] = [1000, 2000, 4000, 8000];

/** Background retries of a loaded stream never wait longer than this. */
const MAX_BACKGROUND_DELAY_MS = 5 * 60 * 1000;
const FIRST_BACKGROUND_DELAY_MS = 15_000;

function codeOf(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

/** An abort is the query being dropped (a filter change, an unmount): never recovered. */
function isAbort(signal: AbortSignal): boolean {
  return signal.aborted;
}

/**
 * Sort a failure into what can still be done about it.
 * @param error - whatever the request threw
 * @param position - the position that was asked for: a refusal of page 0 cannot be a stale
 *   cursor, because page 0 carries none
 * @returns The failure kind
 * @pure true
 */
export function classifyFeedFailure(error: unknown, position: number): FeedFailureKind {
  switch (codeOf(error)) {
    case "RATE_LIMITED":
      return "rate-limited";
    case "CATALOG_CHANGED":
    case "STREAM_EXPIRED":
      return "stale-stream";
    case "INVALID_REQUEST":
      // A later page is built from what the server handed back (revision, token): when
      // that no longer parses, starting over without it is the fix. Page 0 has nothing to
      // drop, so its refusal is about the filters themselves.
      return position > 0 ? "stale-stream" : "refused";
    case "FORBIDDEN":
      return "refused";
    default:
      // Network errors, timeouts, UNAVAILABLE, an HTML 5xx from the host: all pass.
      return "transient";
  }
}

/**
 * The filters a stream falls back to when its own match nothing, narrowest first.
 * @param filters - what the reader chose
 * @returns Each wider step, cumulative and without repeats; empty when already unfiltered
 * @pure true
 */
export function widenFilters(filters: VocabularyFilters): VocabularyFilters[] {
  const steps: VocabularyFilters[] = [];
  let current = filters;
  const push = (next: VocabularyFilters) => {
    if (
      next.topic === current.topic &&
      next.level === current.level &&
      next.difficulty === current.difficulty
    )
      return;
    steps.push(next);
    current = next;
  };
  // An exact level gives way to its track (its neighbouring levels) first.
  push({ ...current, level: "" });
  push({ ...current, topic: "" });
  push({ ...current, difficulty: "" });
  return steps;
}

/**
 * A fresh seed for a restarted stream, recognisably derived from the old one.
 * @param seed - the stream's seed (itself possibly derived)
 * @param now - clock, so each restart differs
 * @returns A seed the endpoint accepts (`[a-zA-Z0-9_-]{8,64}`)
 * @pure true
 */
export function deriveSeed(seed: string, now: number): string {
  const base = seed.replace(/-r[0-9a-z]+$/, "").slice(0, 40);
  return `${base.padEnd(8, "0")}-r${Math.max(0, Math.floor(now)).toString(36)}`;
}

/**
 * How long a loaded stream waits before asking again on its own after a failed page.
 * @param kind - the failure, as classifyFeedFailure sorts it
 * @param failures - consecutive failed background attempts so far (0 for the first)
 * @param retryAfterMs - the server's Retry-After, for a rate refusal
 * @returns Milliseconds to wait, or null when asking again cannot help
 * @pure true
 */
export function backgroundRetryDelay(
  kind: FeedFailureKind,
  failures: number,
  retryAfterMs: number | null,
): number | null {
  if (kind === "refused") return null;
  if (kind === "rate-limited") return Math.max(1000, retryAfterMs ?? 60_000);
  return Math.min(MAX_BACKGROUND_DELAY_MS, FIRST_BACKGROUND_DELAY_MS * 2 ** Math.max(0, failures));
}

type PageRequest = {
  seed: string;
  filters: VocabularyFilters;
  cursor: FeedCursor;
  signal: AbortSignal;
};

/**
 * Load one page, spending every fallback before giving up.
 * @param input - the stream's own seed and filters, and the cursor asked for (which may
 *   carry a derived seed or widened filters from an earlier recovery)
 * @param deps - the fetcher, an abortable sleep, a clock and the log
 * @returns The page, tagged with the seed and filters that actually served it
 * @throws The last failure, once nothing is left to try
 */
export async function loadFeedPageWithFallbacks(
  input: PageRequest,
  deps: {
    fetchPage: (request: PageRequest) => Promise<FeedPage>;
    sleep: (ms: number, signal: AbortSignal) => Promise<void>;
    now: () => number;
    log: FeedRecoveryLog;
  },
): Promise<FeedPage> {
  const { signal } = input;
  const seed = input.cursor.seed ?? input.seed;
  const scope = input.cursor.scope ?? input.filters;

  const withRetry = async (request: PageRequest): Promise<FeedPage> => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await deps.fetchPage(request);
      } catch (error) {
        if (isAbort(signal)) throw error;
        const kind = classifyFeedFailure(error, request.cursor.position);
        const delay = RETRY_DELAYS_MS[attempt];
        if (kind !== "transient" || delay === undefined) throw error;
        deps.log("retry", {
          attempt: attempt + 1,
          inMs: delay,
          position: request.cursor.position,
          code: codeOf(error),
          message: error instanceof Error ? error.message : String(error),
        });
        await deps.sleep(delay, signal);
      }
    }
  };

  let served = { seed, filters: scope };
  let page: FeedPage;
  try {
    page = await withRetry({ seed, filters: scope, cursor: input.cursor, signal });
  } catch (error) {
    if (isAbort(signal)) throw error;
    const kind = classifyFeedFailure(error, input.cursor.position);
    if (kind !== "stale-stream") {
      deps.log("failed", { kind, code: codeOf(error), position: input.cursor.position });
      throw error;
    }
    const fresh = deriveSeed(seed, deps.now());
    deps.log("restart", { code: codeOf(error), position: input.cursor.position, seed: fresh });
    served = { seed: fresh, filters: scope };
    page = await withRetry({ seed: fresh, filters: scope, cursor: { position: 0 }, signal });
  }

  if (!page.entries.length) {
    for (const wider of widenFilters(served.filters)) {
      deps.log("widen", { from: served.filters, to: wider, matching: page.matching });
      const widened = await withRetry({
        seed: served.seed,
        filters: wider,
        cursor: { position: 0 },
        signal,
      });
      if (widened.entries.length) {
        page = widened;
        served = { seed: served.seed, filters: wider };
        break;
      }
    }
  }

  // Later pages must keep asking with what served this one, not what the stream began with.
  return served.filters === input.filters
    ? { ...page, seed: served.seed }
    : { ...page, seed: served.seed, scope: served.filters };
}
