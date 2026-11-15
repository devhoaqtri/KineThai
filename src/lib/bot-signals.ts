/**
 * Who is writing to a public endpoint: a reader's browser running our page, or something
 * else. Two tiers, after Betterlytics' detector:
 *
 * - ENFORCING reasons refuse the request. Only signals with about zero false-positive risk
 *   belong here: a tool or crawler user agent, a write sent from another site (our page
 *   always writes same-origin, by fetch or sendBeacon), and a browser that says it is
 *   driven by automation (navigator.webdriver, sent by the page as a header).
 * - SHADOW reasons are only recorded. They are what a bot often looks like but an old
 *   phone or an in-app browser sometimes does too: no Accept-Language, no Fetch Metadata,
 *   missing or mismatched Chrome client hints, a very old Chromium. They ride along with
 *   what is stored (telemetry metadata, report metadata) so a reason can be promoted to
 *   enforcing once the data shows it never fires on a reader.
 *
 * Every header can be forged by someone who sets out to; this stops tools and automated
 * browsers run as they come, and the rate limits bound the rest. Refusals are logged per
 * path and reason, never by address, at most once a minute.
 *
 * Exports: PUBLIC_WRITE_PATHS, BotVerdict, classifyWriter, noteBotRefusal
 * Depends on: ./bot-gate, ./client-signals
 */

import { isToolAgent } from "./bot-gate";
import { CLIENT_AUTOMATION_HEADER } from "./client-signals";

/** Public endpoints that write what a reader does: checked before they are rate-charged. */
export const PUBLIC_WRITE_PATHS: ReadonlySet<string> = new Set([
  "/api/public/telemetry",
  "/api/public/engagement",
  "/api/public/word-report",
  "/api/public/error-report",
]);

export type BotVerdict = {
  reject: boolean;
  /** Reasons that refuse the request. */
  enforcing: string[];
  /** Reasons only recorded, for review. */
  shadow: string[];
};

/** Chromium sends client hints from this major on, over HTTPS. */
const CLIENT_HINTS_FROM_MAJOR = 89;
/** Chromium older than this is far below the site's own baseline (lib/browser-support: 111). */
const STALE_CHROMIUM_MAJOR = 100;

/** Chromium's major version from its `Chrome/N` token; null for any other engine. */
function chromiumMajor(agent: string): number | null {
  // Chrome on iOS is WebKit and says CriOS, not Chrome: it sends no client hints.
  if (/CriOS\//.test(agent)) return null;
  const match = /Chrome\/(\d+)/.exec(agent);
  return match ? Number(match[1]) : null;
}

/**
 * Classify a write to a public endpoint.
 * @param request - the incoming request
 * @returns Whether to refuse it, and every reason found
 * @pure true
 */
export function classifyWriter(request: Request): BotVerdict {
  const enforcing: string[] = [];
  const shadow: string[] = [];
  const headers = request.headers;
  const agent = headers.get("user-agent") ?? "";
  const secure = new URL(request.url).protocol === "https:";

  if (isToolAgent(agent)) enforcing.push("tool-agent");
  if (headers.get(CLIENT_AUTOMATION_HEADER) === "1") enforcing.push("client-automation");
  const site = headers.get("sec-fetch-site");
  if (site !== null && site !== "same-origin") enforcing.push("cross-site");

  if (!headers.get("accept-language")) shadow.push("no-accept-language");
  if (site === null && secure) shadow.push("no-fetch-metadata");
  const major = chromiumMajor(agent);
  if (major !== null) {
    const hints = headers.get("sec-ch-ua");
    if (hints === null) {
      if (secure && major >= CLIENT_HINTS_FROM_MAJOR) shadow.push("missing-client-hints");
    } else if (!hints.includes(`v="${major}"`)) {
      shadow.push("client-hints-mismatch");
    }
    if (major < STALE_CHROMIUM_MAJOR) shadow.push("stale-chromium");
  }

  return { reject: enforcing.length > 0, enforcing, shadow };
}

const LOG_EVERY_MS = 60 * 1000;
const refusals = new Map<string, { count: number; since: number }>();

/**
 * Count a refused write and log it: the first refusal for a path and reason at once,
 * then at most one line a minute with how many there were. Never the address.
 * @param path - the endpoint
 * @param verdict - the classification that refused it
 * @param now - the clock, for tests
 */
export function noteBotRefusal(path: string, verdict: BotVerdict, now = Date.now()): void {
  const key = `${path} ${verdict.enforcing.join("+")}`;
  const entry = refusals.get(key);
  if (!entry) {
    console.warn(`[bot] ${key}: refused a request`);
    refusals.set(key, { count: 0, since: now });
    return;
  }
  entry.count += 1;
  if (now - entry.since < LOG_EVERY_MS) return;
  console.warn(
    `[bot] ${key}: refused ${entry.count} in the last ${Math.round((now - entry.since) / 1000)} s`,
  );
  refusals.set(key, { count: 0, since: now });
}
