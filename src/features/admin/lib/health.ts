/**
 * Cheap system health snapshot builder for kinetic-canvas.
 *
 * Exports: buildHealthSnapshot
 * Depends on: supabase admin (live), demo store, telemetry types
 */

import { readDemoTelemetry } from "./demo-store";
import { APP_ID, type SystemHealthSnapshot, type SystemHealthStatus } from "../types/telemetry";

/**
 * Build a current SystemHealthSnapshot (<50ms target for live DB ping).
 * @param mode - demo or live
 * @returns health snapshot
 */
export async function buildHealthSnapshot(mode: "demo" | "live"): Promise<SystemHealthSnapshot> {
  const captured_at = new Date().toISOString();

  if (mode === "demo") {
    const store = readDemoTelemetry();
    const hourAgo = Date.now() - 60 * 60 * 1000;
    const recentErrors = store.errors.filter(
      (e) => new Date(e.created_at).getTime() >= hourAgo && e.status !== "resolved",
    ).length;
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    const errors5m = store.events.filter(
      (e) => e.event_type === "error.reported" && new Date(e.occurred_at).getTime() >= fiveMinAgo,
    ).length;
    const status: SystemHealthStatus =
      recentErrors >= 10 ? "degraded" : recentErrors >= 25 ? "partial_outage" : "operational";
    const snapshot: SystemHealthSnapshot = {
      app_id: APP_ID,
      captured_at,
      status,
      uptime_pct_24h: status === "operational" ? 99.9 : 98.5,
      p50_latency_ms: 12,
      p95_latency_ms: 48,
      error_rate_pct: Math.min(100, recentErrors * 0.5),
      errors_5m: errors5m,
      queue_depth: 0,
    };
    store.healthHistory = [snapshot, ...store.healthHistory].slice(0, 500);
    const { writeDemoTelemetry } = await import("./demo-store");
    writeDemoTelemetry(store);
    return snapshot;
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const t0 = performance.now();
  const { error: pingError } = await supabaseAdmin
    .from("profiles")
    .select("id", { count: "exact", head: true });
  const latency = performance.now() - t0;

  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { count: errorCount } = await supabaseAdmin
    .from("telemetry_events")
    .select("*", { count: "exact", head: true })
    .eq("app_id", APP_ID)
    .eq("event_type", "error.reported")
    .gte("occurred_at", fiveMinAgo);

  let queue_depth: number | undefined;
  try {
    const { count } = await supabaseAdmin
      .from("agent_content_items")
      .select("*", { count: "exact", head: true })
      .in("status", ["pending", "queued", "ready"]);
    queue_depth = count ?? 0;
  } catch {
    queue_depth = undefined;
  }

  const errors = errorCount ?? 0;
  const error_rate_pct = Math.min(100, errors * 2);
  let status: SystemHealthStatus = "operational";
  if (pingError || latency > 800 || error_rate_pct > 20) status = "degraded";
  if (latency > 2000 || error_rate_pct > 50) status = "partial_outage";
  if (pingError && latency > 3000) status = "major_outage";

  const snapshot: SystemHealthSnapshot = {
    app_id: APP_ID,
    captured_at,
    status,
    uptime_pct_24h: status === "operational" ? 99.95 : status === "degraded" ? 99.2 : 97.0,
    p50_latency_ms: Math.round(latency),
    p95_latency_ms: Math.round(latency * 1.8),
    error_rate_pct,
    errors_5m: errors,
    queue_depth,
  };

  await supabaseAdmin.from("telemetry_health_snapshots").insert({
    app_id: snapshot.app_id,
    captured_at: snapshot.captured_at,
    status: snapshot.status,
    uptime_pct_24h: snapshot.uptime_pct_24h,
    p50_latency_ms: snapshot.p50_latency_ms,
    p95_latency_ms: snapshot.p95_latency_ms,
    error_rate_pct: snapshot.error_rate_pct,
    queue_depth: snapshot.queue_depth ?? null,
  });

  return snapshot;
}
