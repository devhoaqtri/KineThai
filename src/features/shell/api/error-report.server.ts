/**
 * Public endpoint for the error reports readers choose to send from the error screen.
 *
 * Stored like word reports: with a Supabase service key (the deployed app) as a row in
 * `admin_error_reports` tagged `metadata.kind = "reader_error"`, so it shows on the admin
 * Errors page with no migration; without one (local development) appended to
 * logs/reader-error-reports.ndjson. Nothing about the sender is stored: no address, no
 * account. The per-caller limit lives in src/start.ts (RATE_LIMITS).
 *
 * Exports: errorReportPostResponse, READER_ERROR_KIND
 * Depends on: @/lib/error-report, Supabase admin client (lazy), node:fs/promises
 */

import { appendFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { errorReportSchema, type ErrorReport } from "@/lib/error-report";
import { classifyWriter } from "@/lib/bot-signals";

export const READER_ERROR_KIND = "reader_error";
const APP_ID = "kinetic-canvas";
const LOG_PATH = resolve(process.cwd(), "logs/reader-error-reports.ndjson");
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

function refuse(status: number, code: string, error: string): Response {
  return Response.json({ code, error }, { status, headers });
}

/** The report as flat metadata, which is the only shape admin_error_reports keeps. */
function toMetadata(
  report: ErrorReport,
  host: string,
  botSignals: string | null,
): Record<string, string | number | boolean | null> {
  return {
    kind: READER_ERROR_KIND,
    host,
    bot_signals: botSignals,
    case_id: report.caseId,
    error_name: report.errorName,
    error_message: report.message,
    stack: report.stack,
    route: report.route,
    stage: report.stage,
    build: report.build,
    user_agent: report.userAgent,
    viewport: report.viewport,
    dpr: report.dpr,
    touch: report.touch,
    language: report.language,
    network: report.network,
    online: report.online,
    storage: report.storage,
    translated: report.translated,
    browser_issues: report.browserIssues,
    seconds_since_load: report.secondsSinceLoad,
    note: report.note,
  };
}

async function storeReport(
  report: ErrorReport,
  host: string,
  botSignals: string | null,
): Promise<void> {
  const metadata = toMetadata(report, host, botSignals);
  const message = `Reader error report: ${report.caseId} — ${report.message}`.slice(0, 2000);
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("admin_error_reports").insert({
      app_id: APP_ID,
      status: "new",
      severity: "error",
      actor_user_id: null,
      message,
      metadata,
    });
    if (error) throw new Error(error.message);
    return;
  }
  await mkdir(resolve(LOG_PATH, ".."), { recursive: true });
  await appendFile(
    LOG_PATH,
    `${JSON.stringify({ at: new Date().toISOString(), message, ...metadata })}\n`,
  );
}

/**
 * POST /api/public/error-report — an ErrorReport (lib/error-report).
 * @param request - incoming POST
 * @returns JSON { ok: true } or a refusal with a code
 */
export async function errorReportPostResponse(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return refuse(400, "INVALID_REQUEST", "Body must be JSON");
  }
  const parsed = errorReportSchema.safeParse(body);
  if (!parsed.success) return refuse(400, "INVALID_REQUEST", "Invalid report");
  const host = (request.headers.get("host") ?? new URL(request.url).host).slice(0, 120);
  try {
    await storeReport(parsed.data, host, classifyWriter(request).shadow.join(",") || null);
  } catch {
    return refuse(503, "UNAVAILABLE", "Could not save the report. Please retry.");
  }
  return Response.json({ ok: true }, { headers });
}
