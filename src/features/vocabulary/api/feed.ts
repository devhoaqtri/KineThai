/** Anonymous browser fetch adapter. Exports: fetchVocabularyPage, VocabularyRequestError. Depends on: transport types, backfill bounds, feed-pager (static-host fallback, loaded on demand). */
import { VOCAB_PAGE_LIMIT } from "../lib/backfill";
import { readCustomPage } from "../lib/custom-pack";
import { resolveTarget, type TargetLocale } from "../lib/target-language";
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

/** The server route that serves pages when the app runs with SSR (Nitro/Cloudflare). */
const SERVER_ROUTE = "/api/public/vocabulary";

/**
 * Whether a response means "there is no server behind this origin".
 *
 * A static deploy (GitHub Pages) has no `/api/*` handler, so its host answers the
 * feed route with a 404 — often as the SPA `index.html` rather than a real 404.
 * Both spellings (404, and an HTML 200 for a JSON request) mean the same thing:
 * fall back to the bundled pager. A real API that is up but unhappy returns JSON
 * with a `code`, which is a genuine error and is never treated as "no server".
 */
function isServerRouteAbsent(status: number, contentType: string): boolean {
  if (status === 404) return true;
  // A static host answers the JSON request with its HTML shell at status 200.
  return status === 200 && contentType.includes("text/html");
}

/**
 * Build the query string shared by the network call and the local fallback.
 * The fallback mirrors the server endpoint's contract exactly (same defaults,
 * same params), so a statically-hosted page is indistinguishable from an SSR one.
 */
function buildQuery(
  seed: string,
  filters: VocabularyFilters,
  cursor: FeedCursor,
  includeRevision: boolean,
  locale?: TargetLocale,
): string {
  return new URLSearchParams({
    seed,
    topic: filters.topic,
    level: filters.level,
    difficulty: filters.difficulty,
    position: String(cursor.position),
    limit: String(VOCAB_PAGE_LIMIT),
    ...(includeRevision && cursor.revision ? { revision: cursor.revision } : {}),
    ...(locale ? { locale } : {}),
  }).toString();
}

/**
 * Read one page of the stream.
 *
 * On a server-backed deploy this calls `/api/public/vocabulary` exactly as before.
 * When the app is served as pure static files (e.g. GitHub Pages) and that route
 * does not exist, it transparently falls back to the bundled deterministic pager —
 * so the feed loads on static hosts with zero server. @param input Stream/cursor
 * context. @param locale Override target locale (defaults to host-based detection).
 * @returns The page, from the server or the local pager.
 */
export async function fetchVocabularyPage(
  input: {
    seed: string;
    filters: VocabularyFilters;
    cursor: FeedCursor;
    signal: AbortSignal;
  },
  locale?: TargetLocale,
): Promise<FeedPage> {
  // An imported pack plays entirely in the browser: no request, only its own words.
  const local = readCustomPage({
    seed: input.seed,
    ...input.filters,
    position: input.cursor.position,
    limit: VOCAB_PAGE_LIMIT,
  });
  if (local) return local;
  const controller = new AbortController();
  const abort = () => controller.abort();
  input.signal.addEventListener("abort", abort, { once: true });
  if (input.signal.aborted) controller.abort();
  const timeout = setTimeout(abort, 15_000);
  try {
    const query = buildQuery(input.seed, input.filters, input.cursor, true, locale);
    const response = await fetch(`${SERVER_ROUTE}?${query}`, {
      signal: controller.signal,
      credentials: "omit",
    });

    if (isServerRouteAbsent(response.status, response.headers.get("content-type") ?? "")) {
      // Static host with no server route: read the page locally from the bundled
      // catalog. The deck follows the visited host exactly like the server
      // (`catalogFor(resolveTarget(host))`), so the fallback can never disagree
      // with SSR — on a static host an unknown host resolves to Japanese.
      // If a locale override is provided (from user preference), use it; otherwise
      // fall back to host-based detection.
      const effectiveLocale = locale ?? resolveTarget(window.location.host);
      // Imported here so only a static host downloads the catalog; it holds every deck.
      const { readVocabularyPage } = await import("../lib/feed-pager");
      return readVocabularyPage(
        {
          seed: input.seed,
          topic: input.filters.topic,
          level: input.filters.level,
          difficulty: input.filters.difficulty,
          position: input.cursor.position,
          limit: VOCAB_PAGE_LIMIT,
        },
        effectiveLocale,
      );
    }

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
