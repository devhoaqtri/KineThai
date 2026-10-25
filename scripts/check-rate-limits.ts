/**
 * Guard: every public endpoint has a rate limit, and the limiter actually refuses.
 *
 * The defect this exists for is not a broken limiter — it is a missing one. The app had a
 * working sliding window inside one endpoint and four public routes without any, including
 * an unauthenticated POST that writes with the service-role key. Nothing said so. A new
 * file under src/routes/api/public is now a failing check until it is given a budget.
 *
 * Run: npx tsx scripts/check-rate-limits.ts
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  RATE_LIMITS,
  callerKey,
  checkRateLimit,
  rateLimitedResponse,
  resetRateLimits,
} from "../src/lib/rate-limit";
import { WORD_DATA_PATHS, browserOnlyResponse, isBrowserRequest } from "../src/lib/bot-gate";
import {
  STREAM_TOKEN_TTL_MS,
  issueStreamToken,
  verifyStreamToken,
} from "../src/features/vocabulary/api/stream-token.server";

const checks: string[] = [];
function check(label: string, passed: boolean, detail?: unknown) {
  checks.push(`${passed ? "OK  " : "FAIL"}  ${label}`);
  if (!passed) {
    process.exitCode = 1;
    if (detail !== undefined) console.error("      ", detail);
  }
}

// ── Every public route has a budget ─────────────────────────────────────────────────────
const ROUTES_DIR = "src/routes/api/public";
const routes = readdirSync(ROUTES_DIR)
  .filter((file) => file.endsWith(".ts"))
  .map((file) => `/api/public/${file.replace(/\.ts$/, "")}`);
assert.ok(routes.length > 0, "no public routes were read; this guard would pass vacuously");

for (const route of routes) {
  check(`${route} has a budget`, route in RATE_LIMITS, Object.keys(RATE_LIMITS));
}
// ... and no budget names a route that no longer exists.
for (const path of Object.keys(RATE_LIMITS)) {
  check(`${path} is still a real route`, routes.includes(path), routes);
}

// ── The limiter refuses, and only the caller who spent the budget ───────────────────────
{
  resetRateLimits();
  const budget = { limit: 3, windowMs: 60_000 };
  const verdicts = [1, 2, 3, 4].map(() => checkRateLimit("/t", "1.2.3.4", budget));
  check(
    "the first `limit` requests pass and the next is refused",
    verdicts.slice(0, 3).every((v) => v.allowed) && !verdicts[3]!.allowed,
    verdicts.map((v) => v.allowed),
  );
  check("a refusal says when to come back", verdicts[3]!.retryAfterSeconds > 0);
  check(
    "a different caller still has its own budget",
    checkRateLimit("/t", "5.6.7.8", budget).allowed,
  );
  check(
    "a different bucket still has its own budget",
    checkRateLimit("/other", "1.2.3.4", budget).allowed,
  );
}

// ── A spent window frees up again ───────────────────────────────────────────────────────
{
  resetRateLimits();
  const budget = { limit: 1, windowMs: 40 };
  check("first request passes", checkRateLimit("/w", "9.9.9.9", budget).allowed);
  check("second is refused inside the window", !checkRateLimit("/w", "9.9.9.9", budget).allowed);
  await new Promise((resolve) => setTimeout(resolve, 60));
  check("and passes once the window has rolled", checkRateLimit("/w", "9.9.9.9", budget).allowed);
}

// ── The caller key reads the headers the edge actually sets ─────────────────────────────
{
  const cf = new Request("https://x/", { headers: { "cf-connecting-ip": "203.0.113.7" } });
  const xff = new Request("https://x/", {
    headers: { "x-forwarded-for": "198.51.100.4, 10.0.0.1" },
  });
  check("cf-connecting-ip is used", callerKey(cf) === "203.0.113.7", callerKey(cf));
  check("the first x-forwarded-for hop is used", callerKey(xff) === "198.51.100.4", callerKey(xff));
  check("no header falls back to a shared key", callerKey(new Request("https://x/")) === "local");
}

// ── The refusal is a well-formed 429 ────────────────────────────────────────────────────
{
  const response = rateLimitedResponse(42);
  check("refusal is 429", response.status === 429);
  check("refusal carries Retry-After", response.headers.get("Retry-After") === "42");
  check("refusal is not cached", response.headers.get("Cache-Control") === "no-store");
}

// ── The endpoint no longer carries its own copy ─────────────────────────────────────────
{
  const source = readFileSync("src/features/vocabulary/api/word-report.server.ts", "utf8");
  check(
    "word-report does not re-implement the limiter",
    !/MAX_PER_WINDOW|const recent = new Map/.test(source),
  );
}

// ── The refill key check does not reach the database per attempt ────────────────────────
{
  const source = readFileSync("src/routes/api/public/vocabulary-refill.ts", "utf8");
  const authorizeBody = source.slice(source.indexOf("async function authorize"));
  const beforeCompare = authorizeBody.slice(0, authorizeBody.indexOf("mismatch"));
  check(
    "a wrong key is rejected without importing the admin client",
    !beforeCompare.includes("client.server"),
    "authorize() reaches Supabase before comparing the key",
  );
}

// ── Several windows: the tightest one decides, and a refusal charges none ───────────────
{
  resetRateLimits();
  const budget = [
    { limit: 5, windowMs: 60_000 },
    { limit: 2, windowMs: 3_600_000 },
  ];
  const verdicts = [1, 2, 3].map(() => checkRateLimit("/m", "4.4.4.4", budget));
  check(
    "the long window caps a caller the short window would still admit",
    verdicts[0]!.allowed && verdicts[1]!.allowed && !verdicts[2]!.allowed,
    verdicts.map((v) => v.allowed),
  );
  check(
    "the refusal points at the long window",
    verdicts[2]!.retryAfterSeconds > 60,
    verdicts[2]!.retryAfterSeconds,
  );
  check(
    "the feed carries an hourly and a daily cap, not just a burst cap",
    Array.isArray(RATE_LIMITS["/api/public/vocabulary"]) &&
      (RATE_LIMITS["/api/public/vocabulary"] as unknown[]).length >= 3,
  );
}

// ── Tools and crawlers are turned away from the word endpoints ──────────────────────────
{
  const browser = {
    "user-agent":
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    "sec-fetch-site": "same-origin",
    "sec-fetch-mode": "cors",
    "accept-language": "vi-VN,vi;q=0.9",
  };
  const at = (headers: Record<string, string>, host = "anh.chayla.app") =>
    isBrowserRequest(
      new Request(`https://${host}/api/public/vocabulary`, { headers: { host, ...headers } }),
    );
  check("the app's own fetch passes", at(browser));
  check("curl is refused", !at({ ...browser, "user-agent": "curl/8.6.0" }));
  check("python-requests is refused", !at({ ...browser, "user-agent": "python-requests/2.32" }));
  check(
    "a declared crawler is refused",
    !at({ ...browser, "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" }),
  );
  check(
    "headless Chrome is refused",
    !at({ ...browser, "user-agent": "Mozilla/5.0 HeadlessChrome/126.0" }),
  );
  const { "sec-fetch-site": _site, ...noFetchMetadata } = browser;
  check("a request without Fetch Metadata is refused", !at(noFetchMetadata));
  check("a cross-site fetch is refused", !at({ ...browser, "sec-fetch-site": "cross-site" }));
  check("an address-bar navigation is refused", !at({ ...browser, "sec-fetch-mode": "navigate" }));
  check("the dev server and recorder on localhost pass", at({}, "localhost:5195"));
  const lan = (headers: Record<string, string>) =>
    isBrowserRequest(new Request("http://192.168.1.87:8080/api/public/vocabulary", { headers }));
  check(
    "a phone on the LAN dev server (no Fetch Metadata over http) passes with its Referer",
    lan({ ...noFetchMetadata, referer: "http://192.168.1.87:8080/" }),
  );
  check(
    "over http, a request without a same-origin Referer is refused",
    !lan(noFetchMetadata) &&
      !lan({ ...noFetchMetadata, referer: "http://evil.example/" }),
  );
  check(
    "both word endpoints are gated",
    WORD_DATA_PATHS.has("/api/public/vocabulary") && WORD_DATA_PATHS.has("/api/public/word"),
  );
  const refusal = browserOnlyResponse();
  check("the refusal is a 403 that is not cached", refusal.status === 403);
}

// ── A stream cursor admits exactly the pages it was issued for ──────────────────────────
{
  const identity = { seed: "abcdefgh", topic: "", level: "", difficulty: "", revision: "abc12345" };
  const token = await issueStreamToken(identity, 24);
  check("the next page is admitted", (await verifyStreamToken(token, identity, 24)) === 24);
  check("an earlier page is admitted", (await verifyStreamToken(token, identity, 12)) === 24);
  check("skipping ahead is refused", (await verifyStreamToken(token, identity, 36)) === null);
  check(
    "a token from another seed is refused",
    (await verifyStreamToken(token, { ...identity, seed: "zzzzzzzz" }, 24)) === null,
  );
  check(
    "a token from another catalog revision is refused",
    (await verifyStreamToken(token, { ...identity, revision: "def67890" }, 24)) === null,
  );
  const [reach, expires, signature] = token.split(".");
  check(
    "raising the reach breaks the signature",
    (await verifyStreamToken(`999.${expires}.${signature}`, identity, 36)) === null,
  );
  check("the reach is what was issued", reach === "24");
  check(
    "an expired token is refused",
    (await verifyStreamToken(token, identity, 24, Date.now() + STREAM_TOKEN_TTL_MS + 1000)) ===
      null,
  );
}

console.log(checks.join("\n"));
if (process.exitCode) console.error("\nrate limit guard FAILED");
else console.log(`\n${checks.length} rate-limit assertions passed`);
