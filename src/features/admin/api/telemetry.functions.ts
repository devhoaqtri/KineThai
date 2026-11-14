/**
 * Admin telemetry read serverFns for the embedded dashboard UI.
 *
 * Exports: getAdminRollups, getAdminEvents, getAdminHealth, getAdminHealthHistory,
 *   getAdminErrors, getAdminSessionHealth, runAdminBackfill, updateDemoErrorStatus
 * Depends on: telemetry.core, health, require-admin, backfill
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { backfillTelemetryFromSources } from "../lib/backfill";
import { buildHealthSnapshot } from "../lib/health";
import { requireAdmin } from "../lib/admin-access";
import { requireAdminContext } from "../lib/require-admin";
import {
  listDailyRollups,
  listErrorReports,
  listEvents,
  logAdminAccess,
  updateErrorStatus,
} from "./telemetry.core";
import {
  APP_ID,
  TELEMETRY_EVENT_TYPES,
  VISITOR_EVENT_TYPES,
  type SessionHealthSummary,
  type SystemHealthSnapshot,
} from "../types/telemetry";
import { readDemoTelemetry } from "../lib/demo-store";

const rangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mode: z.enum(["demo", "live"]).default("live"),
});

/**
 * Fetch daily rollups for a date range.
 * @returns server function handle
 */
export const getAdminRollups = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => rangeSchema.parse(d))
  .handler(async ({ data }) => {
    return listDailyRollups({ mode: data.mode, from: data.from, to: data.to });
  });

/**
 * Fetch paginated telemetry events.
 * @returns server function handle
 */
export const getAdminEvents = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) =>
    z
      .object({
        mode: z.enum(["demo", "live"]).default("live"),
        event_type: z.enum(TELEMETRY_EVENT_TYPES).optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        cursor: z.string().nullable().optional(),
        limit: z.number().int().min(1).max(200).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) =>
    listEvents({
      mode: data.mode,
      event_type: data.event_type,
      from: data.from,
      to: data.to,
      cursor: data.cursor,
      limit: data.limit,
    }),
  );

/**
 * Current health snapshot.
 * @returns server function handle
 */
export const getAdminHealth = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) =>
    z.object({ mode: z.enum(["demo", "live"]).default("live") }).parse(d),
  )
  .handler(async ({ data }) => buildHealthSnapshot(data.mode));

/**
 * Health history for uptime charts.
 * @returns server function handle
 */
export const getAdminHealthHistory = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) =>
    z
      .object({
        mode: z.enum(["demo", "live"]).default("live"),
        from: z.string().optional(),
        to: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<SystemHealthSnapshot[]> => {
    if (data.mode === "demo") {
      let items = readDemoTelemetry().healthHistory;
      if (data.from) items = items.filter((h) => h.captured_at >= data.from!);
      if (data.to) items = items.filter((h) => h.captured_at <= data.to!);
      return items;
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("telemetry_health_snapshots")
      .select("*")
      .eq("app_id", APP_ID)
      .order("captured_at", { ascending: true });
    if (data.from) q = q.gte("captured_at", data.from);
    if (data.to) q = q.lte("captured_at", data.to);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => ({
      app_id: r.app_id,
      captured_at: r.captured_at,
      status: r.status as SystemHealthSnapshot["status"],
      uptime_pct_24h: Number(r.uptime_pct_24h),
      p50_latency_ms: Number(r.p50_latency_ms),
      p95_latency_ms: Number(r.p95_latency_ms),
      error_rate_pct: Number(r.error_rate_pct),
      queue_depth: r.queue_depth ?? undefined,
      db_connections_used: r.db_connections_used ?? undefined,
      db_connections_max: r.db_connections_max ?? undefined,
    }));
  });

/**
 * Paginated error reports.
 * @returns server function handle
 */
export const getAdminErrors = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) =>
    z
      .object({
        mode: z.enum(["demo", "live"]).default("live"),
        status: z.enum(["new", "acknowledged", "resolved"]).optional(),
        severity: z.enum(["info", "warn", "error", "critical"]).optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        cursor: z.string().nullable().optional(),
        limit: z.number().int().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) =>
    listErrorReports({
      mode: data.mode,
      status: data.status,
      severity: data.severity,
      from: data.from,
      to: data.to,
      cursor: data.cursor,
      limit: data.limit,
    }),
  );

/**
 * Visitor-session metrics for a date range.
 *
 * Aggregated by Postgres rather than by counting distinct session ids in a page of
 * events, because a page is bounded at 200 rows and would undercount every day
 * busier than that.
 * @returns server function handle
 */
export const getAdminSessionHealth = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .inputValidator((d: unknown) => rangeSchema.parse(d))
  .handler(async ({ data }): Promise<SessionHealthSummary> => {
    if (data.mode === "demo") {
      return summarizeDemoSessions(data.from, data.to);
    }
    const { fetchSessionHealth } = await import("./telemetry-rpc.server");
    return normalizeSessionHealth(
      await fetchSessionHealth({ appId: APP_ID, from: data.from, to: data.to }),
    );
  });

const EMPTY_SESSION_HEALTH: SessionHealthSummary = {
  uniqueVisitors: 0,
  sessionDays: 0,
  sessionsWithErrors: 0,
  totalLoads: 0,
  totalFailures: 0,
  totalErrors: 0,
  failureRate: 0,
  topErrors: [],
};

function normalizeSessionHealth(row: unknown): SessionHealthSummary {
  if (!row || typeof row !== "object") return EMPTY_SESSION_HEALTH;
  const r = row as Record<string, unknown>;
  const num = (key: string) => Number(r[key] ?? 0) || 0;
  return {
    uniqueVisitors: num("uniqueVisitors"),
    sessionDays: num("sessionDays"),
    sessionsWithErrors: num("sessionsWithErrors"),
    totalLoads: num("totalLoads"),
    totalFailures: num("totalFailures"),
    totalErrors: num("totalErrors"),
    failureRate: num("failureRate"),
    topErrors: Array.isArray(r.topErrors)
      ? (r.topErrors as Array<{ message?: unknown; count?: unknown }>).map((e) => ({
          message: String(e.message ?? "unknown"),
          count: Number(e.count ?? 0) || 0,
        }))
      : [],
  };
}

/**
 * Demo equivalent of the session-health RPC, over the whole demo store rather than
 * one page, so demo and live answer the same question.
 */
function summarizeDemoSessions(from: string, to: string): SessionHealthSummary {
  const fromIso = `${from}T00:00:00.000Z`;
  const toIso = `${to}T23:59:59.999Z`;
  const events = readDemoTelemetry().events.filter(
    (e) => e.occurred_at >= fromIso && e.occurred_at <= toIso,
  );

  const sessionDays = new Set<string>();
  const sessions = new Set<string>();
  const errorSessions = new Set<string>();
  const errorCounts = new Map<string, number>();
  let totalLoads = 0;
  let totalFailures = 0;
  let totalErrors = 0;

  for (const event of events) {
    if (!VISITOR_EVENT_TYPES.includes(event.event_type as "page.loaded")) continue;
    const session = event.entity_id;
    if (session) {
      sessions.add(session);
      sessionDays.add(`${session}|${event.occurred_at.slice(0, 10)}`);
    }
    if (event.event_type === "page.loaded") {
      totalLoads += 1;
      continue;
    }
    if (event.event_type === "page.failed") totalFailures += 1;
    else totalErrors += 1;
    if (session) errorSessions.add(session);
    const message = String(event.metadata?.message ?? "unknown");
    errorCounts.set(message, (errorCounts.get(message) ?? 0) + 1);
  }

  const denominator = totalLoads + totalFailures;
  return {
    uniqueVisitors: sessions.size,
    sessionDays: sessionDays.size,
    sessionsWithErrors: errorSessions.size,
    totalLoads,
    totalFailures,
    totalErrors,
    failureRate: denominator > 0 ? totalFailures / denominator : 0,
    topErrors: Array.from(errorCounts, ([message, count]) => ({ message, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
  };
}

/**
 * Live backfill from social tables (admin only).
 * @returns server function handle
 */
export const runAdminBackfill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const actor = await requireAdminContext({ authUserId: context.userId });
    await logAdminAccess({
      mode: "live",
      actorUserId: actor.authUserId,
      path: "/api/admin/telemetry/backfill",
      method: "POST",
    });
    return backfillTelemetryFromSources();
  });

/**
 * Demo-mode error status update (client-side store via serverFn is still ok —
 * but demo updates run client-side through a thin isomorphic helper).
 * This serverFn is for live only; demo uses updateErrorStatus directly in UI.
 * @returns server function handle
 */
export const updateLiveErrorStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["new", "acknowledged", "resolved"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const actor = await requireAdminContext({ authUserId: context.userId });
    return updateErrorStatus({
      mode: "live",
      id: data.id,
      status: data.status,
      actorUserId: actor.authUserId,
    });
  });
