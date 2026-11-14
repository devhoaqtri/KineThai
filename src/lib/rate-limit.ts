/**
 * One sliding-window rate limiter for every public endpoint.
 *
 * This is the limiter that used to live inside word-report.server.ts, lifted out unchanged
 * so the other public routes can share it. It was written there, applied there, and four
 * sibling endpoints never got one — including the unauthenticated telemetry POST, which
 * writes through the service-role key. A limit that has to be remembered per endpoint is a
 * limit the next endpoint will not have.
 *
 * Privacy: the caller's address is ONLY ever a key in the in-memory map below. It is never
 * stored, never logged, and never leaves this module. (Where a caller has to be counted
 * across requests for longer than a window — the word-block rule — that uses a salted
 * digest instead; see reporter-digest.server.ts.)
 *
 * Limits of the approach, stated because they decide what this is good for: the window
 * lives in one process's memory, so with more than one instance the real budget is
 * `limit × instances`, and a cold start forgets everything. That is fine for holding off
 * casual abuse and accidental retry storms, which is what these endpoints need. It is NOT
 * a budget you can prove, so anything that must hold exactly — a spend cap, a quota —
 * belongs in Postgres where every instance can see the same counter.
 *
 * Exports: RATE_LIMITS, NEW_STREAM_BUDGET, SHARE_PAGE_BUDGET, FEED_PAGE_BUDGET, callerKey,
 *   checkRateLimit, checkRateLimitOnce, rateLimitedResponse, resetRateLimits
 * Depends on: none (leaf module)
 */

/** A budget: how many requests one caller may make to one bucket per window. */
export type RateLimit = { limit: number; windowMs: number };
/** One budget, or several windows that must ALL have room (a burst cap plus a daily cap). */
export type RateBudget = RateLimit | readonly RateLimit[];

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Per-endpoint budgets, keyed by the pathname the middleware matches.
 *
 * They differ because the endpoints cost different things. A report is a deliberate human
 * act, so a dozen in ten minutes is already generous. Telemetry and engagement are fired
 * by the page itself, so their ceilings are set well above what an honest session produces
 * and are there to stop a flood, not to pace a reader. Refill is a daily cron call.
 */
export const RATE_LIMITS: Record<string, RateBudget> = {
  // A reader fixing a deck by hand might file a handful; a script files hundreds.
  "/api/public/word-report": { limit: 12, windowMs: 10 * MINUTE },
  // A reader sends one from an error screen; a crash loop or a script would send many.
  "/api/public/error-report": { limit: 5, windowMs: 10 * MINUTE },
  // Unauthenticated AND writes through the service-role key, so this is the one that most
  // needs a ceiling: rows it accepts land in the tables the admin dashboards read.
  "/api/public/telemetry": { limit: 120, windowMs: MINUTE },
  // One tap each; a reader cannot out-tap this, a script can.
  "/api/public/engagement": { limit: 90, windowMs: MINUTE },
  // Paging the feed, 12 words a page. A reader spends seconds to minutes on each word, so
  // even someone skipping hard pulls about a page a minute; the burst cap leaves room for
  // the backfill that tops up a stream after blocked words. The hour and day caps are
  // what make walking the whole corpus from one address take days instead of minutes.
  "/api/public/vocabulary": [
    { limit: 30, windowMs: MINUTE },
    { limit: 120, windowMs: HOUR },
    { limit: 400, windowMs: DAY },
  ],
  // One word by share code (challenge links, recorder surfaces). One request yields one
  // word, so the daily cap bounds enumeration to a trickle.
  "/api/public/word": [
    { limit: 20, windowMs: MINUTE },
    { limit: 200, windowMs: DAY },
  ],
  // pg_cron calls this once a day. Anything beyond a retry or two is not the cron.
  "/api/public/vocabulary-refill": { limit: 10, windowMs: 10 * MINUTE },
};

/** Past this many tracked callers the map is swept of windows that have expired. */
const SWEEP_AT = 5000;

/**
 * New streams on the feed. Not a path: the vocabulary handler charges it only for a
 * page 0, because a stream's later pages need its signed cursor while page 0 does not —
 * so fresh seeds are the one way to fan out, and they get their own allowance.
 *
 * Sized for real readers, not for one: every reload, level change and shuffle opens a
 * stream, and the key is an address, which a household, a school network or a mobile
 * carrier's NAT shares between many people. At 20 per ten minutes a reader who reloaded
 * a few times was locked out of the feed. Fan-out is still bounded where it matters: a
 * page 0 is twelve words like any other page, and the path budget in RATE_LIMITS caps
 * the pages one address can pull, whatever seeds it uses.
 */
export const NEW_STREAM_BUDGET: RateBudget = [
  { limit: 60, windowMs: 10 * MINUTE },
  { limit: 300, windowMs: DAY },
];

/**
 * Share-link page loads (`/w/<code>`) from one address. Not in RATE_LIMITS, which is keyed
 * by exact path, because every code is its own path. A person opens a shared link a few
 * times; a class on one school network opening the same link at once is the honest peak,
 * so the minute cap leaves room for that. Past it the page is not rendered at all.
 */
export const SHARE_PAGE_BUDGET: RateBudget = [
  { limit: 30, windowMs: MINUTE },
  { limit: 300, windowMs: HOUR },
];

/**
 * Home feed page loads (`/feed`) from one address. Every visit, reload and return to the
 * site is one, and a household, a classroom or a carrier's NAT shares an address, so this
 * sits well above the share page's cap; it is there to stop a flood of renders, not to
 * pace a reader. The words themselves are bounded by RATE_LIMITS["/api/public/vocabulary"].
 */
export const FEED_PAGE_BUDGET: RateBudget = [
  { limit: 60, windowMs: MINUTE },
  { limit: 600, windowMs: HOUR },
];

/** How long a charged stream is remembered, so asking for it again costs nothing. */
const STREAM_HOLD_MS = 10 * MINUTE;

// Each window remembers its own length, so a sweep never judges a day-long window by
// the minute-long one that happened to trigger it.
const hits = new Map<string, { windowMs: number; times: number[] }>();
// Streams already paid for, by caller: entry -> when the hold lapses.
const charged = new Map<string, number>();

/**
 * The caller, as far as the edge will tell us.
 *
 * `local` is the placeholder when no forwarding header is present — a dev server, or a
 * deployment that does not front the app. Every such caller shares one key, which is the
 * safe direction for a limiter (it throttles harder) and the unsafe one for counting
 * distinct people, which is why the block rule refuses to count it.
 * @param request - the incoming request
 * @returns A key for the limiter's map; never stored anywhere else
 */
export function callerKey(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "local"
  );
}

/**
 * Take one token from a caller's budget. With several windows, the request proceeds only
 * if every window has room, and a refused request is charged to none of them.
 * @param bucket - what is being limited, usually the pathname
 * @param key - the caller, from callerKey
 * @param budget - how many per window, or several windows at once
 * @returns Whether the request may proceed, and when the tightest full window frees up if not
 */
export function checkRateLimit(
  bucket: string,
  key: string,
  budget: RateBudget,
): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const windows = Array.isArray(budget) ? budget : [budget as RateLimit];
  const slots = windows.map((window, index) => {
    const id = `${bucket}#${index}|${key}`;
    const times = (hits.get(id)?.times ?? []).filter((time) => now - time < window.windowMs);
    return { id, window, times };
  });
  let retryAfterSeconds = 0;
  for (const { id, window, times } of slots) {
    hits.set(id, { windowMs: window.windowMs, times });
    if (times.length < window.limit) continue;
    const oldest = times[0] ?? now;
    retryAfterSeconds = Math.max(
      retryAfterSeconds,
      Math.max(1, Math.ceil((window.windowMs - (now - oldest)) / 1000)),
    );
  }
  if (retryAfterSeconds > 0) return { allowed: false, retryAfterSeconds };
  for (const { times } of slots) times.push(now);
  // Keep the map from growing without bound on a long-lived server.
  if (hits.size > SWEEP_AT) {
    for (const [entry, { windowMs, times }] of hits) {
      if (!times.some((time) => now - time < windowMs)) hits.delete(entry);
    }
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

/**
 * Charge a budget once per distinct item, however often it is asked for.
 *
 * Asking for the same feed stream's first page again hands out nothing new — the page is
 * a pure function of its seed and filters — but each ask used to cost a token: the
 * request a browser aborts on remount, a retry after a dropped connection, a refetch on
 * returning to the tab. Two or three tokens per visit is how a few reloads emptied a
 * budget meant for streams. Only a request that is allowed is remembered, so a refused
 * one is still free.
 * @param bucket - what is being limited
 * @param key - the caller, from callerKey
 * @param item - what is being paid for, e.g. a stream's seed and filters
 * @param budget - how many distinct items per window
 * @returns The verdict, always allowed for an item this caller already paid for
 */
export function checkRateLimitOnce(
  bucket: string,
  key: string,
  item: string,
  budget: RateBudget,
): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const id = `${bucket}|${key}|${item}`;
  if ((charged.get(id) ?? 0) > now) return { allowed: true, retryAfterSeconds: 0 };
  const verdict = checkRateLimit(bucket, key, budget);
  if (!verdict.allowed) return verdict;
  charged.set(id, now + STREAM_HOLD_MS);
  if (charged.size > SWEEP_AT) {
    for (const [entry, until] of charged) if (until <= now) charged.delete(entry);
  }
  return verdict;
}

/**
 * The refusal every limited endpoint returns, so a caller sees one shape everywhere.
 * @param retryAfterSeconds - when the window frees up
 */
export function rateLimitedResponse(retryAfterSeconds: number): Response {
  return Response.json(
    { code: "RATE_LIMITED", error: "Too many requests. Try again shortly." },
    {
      status: 429,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Retry-After": String(retryAfterSeconds),
      },
    },
  );
}

/** Drop every window. For tests only. */
export function resetRateLimits(): void {
  hits.clear();
  charged.clear();
}
