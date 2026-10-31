/**
 * Public endpoint for anonymous word reports.
 *
 * The card names its deck, because `settings.targetLanguage` can set that apart from the
 * host; the host is only the fallback, so a report always names a word in the language the
 * reader is actually reading.
 *
 * Exports: wordReportPostResponse
 * Depends on: ../lib/word-report schema, ../lib/target-language, catalog.server,
 *   word-report-store.server
 */

import { wordReportSchema, toReportStage } from "../lib/word-report";
import { resolveTarget } from "../lib/target-language";
import { catalogFor, deckLocaleFor } from "./catalog.server";
import { addWordReport } from "./word-report-store.server";

const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

/** A reader fixing a deck by hand might file a handful; a script files hundreds. */
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 12;
const recent = new Map<string, number[]>();

/**
 * Sliding-window limit per caller. The address is only ever a key in this
 * in-memory map — it is not written to the report or to any log.
 */
function allow(key: string): boolean {
  const now = Date.now();
  const hits = (recent.get(key) ?? []).filter((time) => now - time < WINDOW_MS);
  if (hits.length >= MAX_PER_WINDOW) {
    recent.set(key, hits);
    return false;
  }
  hits.push(now);
  recent.set(key, hits);
  // Keep the map from growing without bound on a long-lived server.
  if (recent.size > 5000) {
    for (const [entry, times] of recent) {
      if (!times.some((time) => now - time < WINDOW_MS)) recent.delete(entry);
    }
  }
  return true;
}

function callerKey(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "local"
  );
}

function refuse(status: number, code: string, error: string): Response {
  return Response.json({ code, error }, { status, headers });
}

/**
 * POST /api/public/word-report — { id, locale?, reasons[], stage? }.
 * Accepts only a word in the reader's deck and reasons from the fixed list; stores
 * nothing about who sent it.
 * @param request - incoming POST
 * @returns JSON { ok: true } or a refusal with a code
 */
export async function wordReportPostResponse(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return refuse(400, "INVALID_REQUEST", "Body must be JSON");
  }
  const parsed = wordReportSchema.safeParse(body);
  if (!parsed.success) return refuse(400, "INVALID_REQUEST", "Invalid report");

  const host = request.headers.get("host") ?? new URL(request.url).host;
  const locale = deckLocaleFor(parsed.data.locale ?? resolveTarget(host));
  const word = catalogFor(locale).words.find((entry) => entry.id === parsed.data.id);
  if (!word) return refuse(404, "UNKNOWN_WORD", "That word is not in the catalog");
  if (!allow(callerKey(request))) {
    return refuse(429, "RATE_LIMITED", "Too many reports. Try again later.");
  }

  try {
    await addWordReport({
      locale,
      wordId: word.id,
      word: word.word,
      reasons: parsed.data.reasons,
      stage: toReportStage(parsed.data.stage ?? null),
    });
  } catch {
    return refuse(503, "UNAVAILABLE", "Could not save the report. Please retry.");
  }
  return Response.json({ ok: true }, { headers });
}
