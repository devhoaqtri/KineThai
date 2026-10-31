/**
 * Where anonymous word reports are kept.
 *
 * Two homes, chosen by what the server has:
 * - With a Supabase service key (the deployed app) reports are rows in
 *   `admin_error_reports`, tagged `metadata.kind = "word_report"`. That table and
 *   its admin-only policies already exist, so no migration is needed, and the rows
 *   also show on the admin Errors page.
 * - Without one (local development) they are appended to
 *   src/features/vocabulary/data/word-reports.json, written atomically like the
 *   other local data files.
 *
 * Nothing about the reader is stored in either: no account, no address, no device.
 *
 * Exports: addWordReport, listWordReports, setWordReportStatus, wordReportStoreKind
 * Depends on: node:fs/promises, Supabase admin client (lazy), ../lib/word-report
 */

import { randomUUID } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { TARGET_LOCALES, type TargetLocale } from "../lib/target-language";
import {
  getReportReason,
  toReportStage,
  type ReportReasonId,
  type WordReport,
  type WordReportStatus,
} from "../lib/word-report";

const STORE_PATH = resolve(process.cwd(), "src/features/vocabulary/data/word-reports.json");
/** Oldest reports fall off the local file past this; it is a notebook, not an archive. */
const FILE_CAP = 5000;
const REPORT_KIND = "word_report";
const APP_ID = "kinetic-canvas";

type NewReport = Pick<WordReport, "locale" | "wordId" | "word" | "reasons" | "stage">;

/**
 * A report's deck. One filed before reports carried a language is English: until then only
 * English words could be reported at all.
 */
function deckOf(value: unknown): TargetLocale {
  return (TARGET_LOCALES as readonly unknown[]).includes(value) ? (value as TargetLocale) : "en";
}

/** Which home is in use, for the admin page to say where it is reading from. */
export function wordReportStoreKind(): "supabase" | "file" {
  return process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY ? "supabase" : "file";
}

// ── Local file ───────────────────────────────────────────────────────────────

async function readFileStore(): Promise<WordReport[]> {
  try {
    const parsed = JSON.parse(await readFile(STORE_PATH, "utf8")) as unknown;
    return Array.isArray(parsed)
      ? (parsed as WordReport[]).map((report) => ({ ...report, locale: deckOf(report.locale) }))
      : [];
  } catch {
    // No file yet simply means no reports yet.
    return [];
  }
}

async function writeFileStore(reports: WordReport[]): Promise<void> {
  const temporary = `${STORE_PATH}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(reports, null, 2)}\n`, "utf8");
  await rename(temporary, STORE_PATH);
}

// Writes are queued so two reports arriving together cannot each read the file,
// add themselves and overwrite the other.
let fileQueue: Promise<unknown> = Promise.resolve();
function queued<T>(task: () => Promise<T>): Promise<T> {
  const next = fileQueue.then(task, task);
  fileQueue = next.catch(() => undefined);
  return next;
}

// ── Supabase ─────────────────────────────────────────────────────────────────

type ErrorReportRow = {
  id: string;
  status: string;
  metadata: unknown;
  created_at: string;
  resolved_at: string | null;
};

function fromRow(row: ErrorReportRow): WordReport {
  const metadata = (row.metadata ?? {}) as Record<string, unknown>;
  const reasons = String(metadata.reasons ?? "")
    .split(",")
    .filter((reason): reason is ReportReasonId => !!getReportReason(reason));
  return {
    id: row.id,
    locale: deckOf(metadata.locale),
    wordId: String(metadata.word_id ?? ""),
    word: String(metadata.word ?? ""),
    reasons,
    stage: toReportStage(typeof metadata.stage === "string" ? metadata.stage : null),
    // The table's middle state ("acknowledged") is not used for word reports.
    status: row.status === "resolved" ? "resolved" : "new",
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  };
}

// ── Public surface ───────────────────────────────────────────────────────────

/**
 * Store one report.
 * @param report - validated word, reasons and page
 * @returns The stored report's id
 */
export async function addWordReport(report: NewReport): Promise<string> {
  if (wordReportStoreKind() === "supabase") {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const labels = report.reasons.map((reason) => getReportReason(reason)?.en ?? reason);
    const { data, error } = await supabaseAdmin
      .from("admin_error_reports")
      .insert({
        app_id: APP_ID,
        status: "new",
        severity: "info",
        actor_user_id: null,
        message: `Word report: “${report.word}” — ${labels.join("; ")}`,
        metadata: {
          kind: REPORT_KIND,
          locale: report.locale,
          word_id: report.wordId,
          word: report.word,
          reasons: report.reasons.join(","),
          stage: report.stage,
        },
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return data.id;
  }
  return queued(async () => {
    const reports = await readFileStore();
    const stored: WordReport = {
      id: randomUUID(),
      ...report,
      status: "new",
      createdAt: new Date().toISOString(),
      resolvedAt: null,
    };
    await writeFileStore([stored, ...reports].slice(0, FILE_CAP));
    return stored.id;
  });
}

/** Every stored report, newest first. */
export async function listWordReports(): Promise<WordReport[]> {
  if (wordReportStoreKind() === "supabase") {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("admin_error_reports")
      .select("id, status, metadata, created_at, resolved_at")
      .eq("app_id", APP_ID)
      .contains("metadata", { kind: REPORT_KIND })
      .order("created_at", { ascending: false })
      .limit(2000);
    if (error) throw new Error(error.message);
    return (data ?? []).map(fromRow);
  }
  return readFileStore();
}

/**
 * Mark reports resolved, or reopen them.
 * @param ids - report ids to change
 * @param status - the status to set
 * @param actorUserId - admin making the change (recorded on the Supabase row only)
 * @returns How many reports changed
 */
export async function setWordReportStatus(
  ids: readonly string[],
  status: WordReportStatus,
  actorUserId: string | null,
): Promise<number> {
  if (!ids.length) return 0;
  const now = new Date().toISOString();
  if (wordReportStoreKind() === "supabase") {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // The demo admin id is not a real account, so it is not written as the resolver.
    const resolver = actorUserId && !actorUserId.startsWith("00000000-") ? actorUserId : null;
    const { data, error } = await supabaseAdmin
      .from("admin_error_reports")
      .update({
        status,
        updated_at: now,
        resolved_at: status === "resolved" ? now : null,
        resolved_by: status === "resolved" ? resolver : null,
      })
      .in("id", [...ids])
      .contains("metadata", { kind: REPORT_KIND })
      .select("id");
    if (error) throw new Error(error.message);
    return data?.length ?? 0;
  }
  return queued(async () => {
    const wanted = new Set(ids);
    let changed = 0;
    const reports = (await readFileStore()).map((report) => {
      if (!wanted.has(report.id) || report.status === status) return report;
      changed += 1;
      return { ...report, status, resolvedAt: status === "resolved" ? now : null };
    });
    if (changed) await writeFileStore(reports);
    return changed;
  });
}
