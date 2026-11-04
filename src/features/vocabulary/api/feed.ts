/** Anonymous browser fetch adapter. Exports: fetchVocabularyPage, loadVocabularyPage, VocabularyRequestError. Depends on: transport types, backfill bounds, feed fallbacks, feed log. */
import { VOCAB_PAGE_LIMIT } from "../lib/backfill";
import { readCustomPage } from "../lib/custom-pack";
import { loadFeedPageWithFallbacks } from "../lib/feed-fallback";
import { feedLog } from "../lib/feed-log";
import type { FeedCursor, FeedPage, VocabularyFilters } from "../types";

export class VocabularyRequestError extends Error {
  readonly code: string;
  /** From a refusal's Retry-After header: when asking again can succeed. */
  readonly retryAfterMs: number | null;
  constructor(message: string, code: string, retryAfterMs: number | null = null) {
    super(message);
    this.name = "VocabularyRequestError";
    this.code = code;
    this.retryAfterMs = retryAfterMs;
  }
}

/** Request one abortable page without auth headers. @param input Stream/cursor context. @returns The server page. */
export async function fetchVocabularyPage(input: {
  seed: string;
  filters: VocabularyFilters;
  cursor: FeedCursor;
  signal: AbortSignal;
}): Promise<FeedPage> {
  // An imported pack plays entirely in the browser: no request, only its own words.
  const local = readCustomPage({
    seed: input.seed,
    ...input.filters,
    position: input.cursor.position,
    limit: VOCAB_PAGE_LIMIT,
  });
  if (local) return local;
  const query = new URLSearchParams({
    seed: input.seed,
    topic: input.filters.topic,
    level: input.filters.level,
    difficulty: input.filters.difficulty,
    position: String(input.cursor.position),
    limit: String(VOCAB_PAGE_LIMIT),
    ...(input.cursor.revision ? { revision: input.cursor.revision } : {}),
    ...(input.cursor.token ? { token: input.cursor.token } : {}),
  });
  const controller = new AbortController();
  const abort = () => controller.abort();
  input.signal.addEventListener("abort", abort, { once: true });
  if (input.signal.aborted) controller.abort();
  const timeout = setTimeout(abort, 15_000);
  try {
    const response = await fetch(`/api/public/vocabulary?${query}`, {
      signal: controller.signal,
      credentials: "omit",
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const retryAfter = Number(response.headers.get("retry-after"));
      throw new VocabularyRequestError(
        body.error || "Could not load more words. Please retry.",
        body.code || "UNAVAILABLE",
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : null,
      );
    }
    return (await response.json()) as FeedPage;
  } finally {
    clearTimeout(timeout);
    input.signal.removeEventListener("abort", abort);
  }
}

/** Wait, or stop waiting the moment the query is dropped. */
function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", stop);
      resolve();
    }, ms);
    const stop = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    signal.addEventListener("abort", stop, { once: true });
  });
}

/**
 * Request one page through every fallback (lib/feed-fallback): backoff retries, a fresh
 * stream for a stale cursor, wider filters for an empty match. Each step is logged to the
 * console and the dev feed log, so a recovered failure is still visible.
 * @param input Stream/cursor context. @returns The page that finally served.
 */
export function loadVocabularyPage(input: {
  seed: string;
  filters: VocabularyFilters;
  cursor: FeedCursor;
  signal: AbortSignal;
}): Promise<FeedPage> {
  return loadFeedPageWithFallbacks(input, {
    fetchPage: (request) =>
      fetchVocabularyPage({
        seed: request.seed,
        filters: request.filters,
        cursor: request.cursor,
        signal: request.signal,
      }),
    sleep: abortableSleep,
    now: () => Date.now(),
    log: (cause, detail) => {
      console.warn(`[vocabulary feed] ${cause}`, detail);
      feedLog("feed-fallback", { cause, ...detail });
    },
  });
}
