/**
 * Anonymous session identity and visitor telemetry reporting.
 *
 * Generates a random ID per browser per UTC day (localStorage) so a day's visitor behavior
 * can be correlated with its error events without requiring authentication, and posts
 * events to the public ingest endpoint. The ID travels as `entity_id` with a null
 * `actor_user_id`, letting the admin dashboard answer "which sessions broke and why".
 *
 * It is renewed every day on purpose: visitor counts are per day anyway (one session row
 * per UTC day), and an ID that lived forever would link a reader's days into a history
 * the site never needs. A day-bound ID cannot, which is also why the site needs no
 * consent banner for it (see PrivacyPage).
 *
 * Reporting goes over the network rather than through the admin emit path because
 * that path writes with the Supabase service-role key, which cannot be present in a
 * browser.
 *
 * Exports: getSessionId, storedIdForDay, resetSessionId, reportVisitorEvent, markReportedOnce
 * Depends: ./client-signals (browser localStorage + fetch/sendBeacon)
 */

import { isAutomatedBrowser } from "./client-signals";

const STORAGE_KEY = "kinetic.session.id";
const INGEST_PATH = "/api/public/telemetry";

export type VisitorEventType = "page.loaded" | "page.failed" | "session.error";

export type VisitorEventInput = {
  type: VisitorEventType;
  message?: string;
  metadata?: Record<string, string | number | boolean | null>;
};

/** Today's UTC date, which bounds an ID's life. */
function utcDay(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Read a stored ID, valid only on the day it was made. An ID stored before IDs were
 * day-bound (a bare UUID) has no day, so it is replaced.
 * @pure true
 */
export function storedIdForDay(stored: string | null, day: string): string | null {
  if (!stored) return null;
  const [id, madeOn] = stored.split("|");
  return id && madeOn === day ? id : null;
}

/** Return today's session ID, creating a fresh one on a new UTC day. */
export function getSessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    const day = utcDay();
    let id = storedIdForDay(localStorage.getItem(STORAGE_KEY), day);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(STORAGE_KEY, `${id}|${day}`);
    }
    return id;
  } catch {
    // Private windows and blocked site data throw on access. A session that
    // cannot be identified is simply not reported.
    return "";
  }
}

/** Clear the current session ID (e.g. on explicit logout or for testing). */
export function resetSessionId(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to clear */
  }
}

const reportedOnce = new Set<string>();

/**
 * Claim a one-shot reporting slot for this page lifetime.
 *
 * Rotating the device remounts the feed, which would otherwise report a second
 * page load for one real visit and inflate the load count the failure rate is
 * measured against.
 * @param key Stable name for the thing reported at most once.
 * @returns true the first time a key is seen, false afterwards.
 */
export function markReportedOnce(key: string): boolean {
  if (reportedOnce.has(key)) return false;
  reportedOnce.add(key);
  return true;
}

/**
 * Report one visitor event for the current session. Fire-and-forget: a telemetry
 * failure must never surface to the visitor, so every error is swallowed.
 * @param event Event type plus optional message and flat metadata.
 */
export function reportVisitorEvent(event: VisitorEventInput): void {
  if (typeof window === "undefined") return;
  if (import.meta.env.VITE_STATIC_BUILD === "1") return;
  // A browser under automation (a test run, a recorder, a scraper as it comes) is not a
  // visitor: it is not reported at all, so it never reaches a count (lib/bot-signals).
  if (isAutomatedBrowser()) return;
  const sessionId = getSessionId();
  if (!sessionId) return;

  const payload = JSON.stringify({
    sessionId,
    events: [{ ...event, occurredAt: new Date().toISOString() }],
  });

  try {
    // sendBeacon survives the page being closed mid-flight, which is exactly when
    // a failure report matters most.
    if (navigator.sendBeacon) {
      const blob = new Blob([payload], { type: "application/json" });
      if (navigator.sendBeacon(INGEST_PATH, blob)) return;
    }
    void fetch(INGEST_PATH, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {
      /* telemetry is best-effort */
    });
  } catch {
    /* telemetry is best-effort */
  }
}
