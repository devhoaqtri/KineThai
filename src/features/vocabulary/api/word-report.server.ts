/**
 * Public endpoint for anonymous word reports.
 *
 * The per-caller limit is NOT here: it is applied to every public route in src/start.ts,
 * which is where the budget for this path lives (RATE_LIMITS in lib/rate-limit.ts).
 *
 * The deck comes from the host, like every other public route, so a report always names a
 * word in the language the reader is actually reading.
 *
 * Exports: wordReportPostResponse
 * Depends on: ../lib/word-report schema, ../lib/target-language, catalog.server,
 *   word-report-store.server, lib/rate-limit
 */

import { wordReportSchema, toReportStage } from "../lib/word-report";
import { resolveTarget } from "../lib/target-language";
import { catalogFor, deckLocaleFor } from "./catalog.server";
import { reporterDigest } from "./reporter-digest.server";
import { invalidateBlockedWordIds } from "./word-block.server";
import { addWordReport } from "./word-report-store.server";
import { callerKey } from "@/lib/rate-limit";
import { classifyWriter } from "@/lib/bot-signals";

const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

function refuse(status: number, code: string, error: string): Response {
  return Response.json({ code, error }, { status, headers });
}

/**
 * POST /api/public/word-report — { id, reasons[], stage? }.
 * Accepts only a word in this host's deck and reasons from the fixed list; of the sender it
 * stores only the reporter digest.
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

  // The FULL catalog on purpose: a word already blocked is still reportable, so the
  // reports keep accruing for the admin who will read them.
  const host = request.headers.get("host") ?? new URL(request.url).host;
  const locale = deckLocaleFor(resolveTarget(host));
  const word = catalogFor(locale).words.find((entry) => entry.id === parsed.data.id);
  if (!word) return refuse(404, "UNKNOWN_WORD", "That word is not in the catalog");
  // The sliding-window limit that used to live here is applied for every public route in
  // src/start.ts. `callerKey` is still needed, for the reporter digest below.
  const caller = callerKey(request);

  try {
    await addWordReport({
      locale,
      wordId: word.id,
      word: word.word,
      reasons: parsed.data.reasons,
      stage: toReportStage(parsed.data.stage ?? null),
      reporter: reporterDigest(caller, word.id),
      // Recorded, not judged: a report the middleware let through still counts.
      botSignals: classifyWriter(request).shadow.join(",") || null,
    });
  } catch {
    return refuse(503, "UNAVAILABLE", "Could not save the report. Please retry.");
  }
  // This report may be the one that crosses the threshold; drop the cached blocklist so the
  // next page does not hand the reader back the word they just reported.
  invalidateBlockedWordIds();
  return Response.json({ ok: true }, { headers });
}
