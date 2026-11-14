/**
 * HTTP handlers for /api/admin/telemetry/* contract endpoints.
 *
 * Exports: handleAdminTelemetryRequest
 * Depends on: telemetry.core, health, rate-limit, require-admin
 */

import { buildHealthSnapshot } from "../lib/health";
import { allowTelemetryRequest } from "../lib/rate-limit";
import { AdminForbiddenError, requireAdminContext } from "../lib/require-admin";
import {
  listDailyRollups,
  listErrorReports,
  listEvents,
  logAdminAccess,
  updateErrorStatus,
} from "./telemetry.core";
import { APP_ID, type ErrorReportStatus, type TelemetryEventType } from "../types/telemetry";
import { readDemoTelemetry } from "../lib/demo-store";

async function resolveActor(request: Request) {
  const { ADMIN_PIN_ACTOR_ID, hasValidAdminPinCookie } = await import("../lib/admin-pin.server");
  if (await hasValidAdminPinCookie(request)) {
    return requireAdminContext({ authUserId: ADMIN_PIN_ACTOR_ID, pinVerified: true });
  }
  const url = new URL(request.url);
  const demoHeader = request.headers.get("x-kinetic-demo-admin");
  if (demoHeader === "1" || url.searchParams.get("demo") === "1") {
    return requireAdminContext({ isDemo: true });
  }
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    throw new AdminForbiddenError("Unauthorized");
  }
  const token = auth.slice("Bearer ".length);
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new AdminForbiddenError("Auth unavailable");
  }
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) throw new AdminForbiddenError("Invalid token");
  return requireAdminContext({ authUserId: data.claims.sub as string });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/**
 * Dispatch an admin telemetry HTTP request. Returns null if path is not under contract.
 * @param request - incoming Request
 * @returns Response or null
 */
export async function handleAdminTelemetryRequest(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/admin/telemetry")) return null;

  const ip =
    request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? "anon";
  if (!allowTelemetryRequest(ip)) {
    return json({ error: "Rate limit exceeded" }, 429);
  }

  try {
    const actor = await resolveActor(request);
    const mode = actor.mode;
    await logAdminAccess({
      mode,
      actorUserId: actor.authUserId,
      path: url.pathname,
      method: request.method,
    });

    if (url.pathname === "/api/admin/telemetry/events" && request.method === "GET") {
      const page = await listEvents({
        mode,
        event_type: (url.searchParams.get("event_type") as TelemetryEventType) || undefined,
        from: url.searchParams.get("from") ?? undefined,
        to: url.searchParams.get("to") ?? undefined,
        actor_user_id: url.searchParams.get("actor_user_id") ?? undefined,
        cursor: url.searchParams.get("cursor"),
        limit: Number(url.searchParams.get("limit") ?? 50),
      });
      return json(page);
    }

    if (url.pathname === "/api/admin/telemetry/rollups/daily" && request.method === "GET") {
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      if (!from || !to) return json({ error: "from and to required" }, 400);
      const rows = await listDailyRollups({ mode, from, to });
      return json(rows);
    }

    if (url.pathname === "/api/admin/telemetry/health" && request.method === "GET") {
      return json(await buildHealthSnapshot(mode));
    }

    if (url.pathname === "/api/admin/telemetry/health/history" && request.method === "GET") {
      if (mode === "demo") {
        return json(readDemoTelemetry().healthHistory);
      }
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      let q = supabaseAdmin
        .from("telemetry_health_snapshots")
        .select("*")
        .eq("app_id", APP_ID)
        .order("captured_at", { ascending: true });
      if (from) q = q.gte("captured_at", from);
      if (to) q = q.lte("captured_at", to);
      const { data, error } = await q;
      if (error) return json({ error: error.message }, 500);
      return json(data ?? []);
    }

    if (url.pathname === "/api/admin/telemetry/stream" && request.method === "GET") {
      // Best-effort SSE; many edge targets will not keep this open.
      const stream = new ReadableStream({
        start(controller) {
          const enc = new TextEncoder();
          controller.enqueue(
            enc.encode(`event: ready\ndata: ${JSON.stringify({ app_id: APP_ID })}\n\n`),
          );
          const timer = setInterval(() => {
            try {
              controller.enqueue(
                enc.encode(
                  `event: heartbeat\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`,
                ),
              );
            } catch {
              clearInterval(timer);
            }
          }, 15000);
          // Close after 60s so serverless hosts don't hang forever.
          setTimeout(() => {
            clearInterval(timer);
            try {
              controller.close();
            } catch {
              /* ignore */
            }
          }, 60_000);
        },
      });
      return new Response(stream, {
        headers: {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive",
        },
      });
    }

    const errorMatch = url.pathname.match(/^\/api\/admin\/telemetry\/errors\/([^/]+)$/);
    if (errorMatch && request.method === "PATCH") {
      const body = (await request.json()) as { status?: ErrorReportStatus };
      if (!body.status) return json({ error: "status required" }, 400);
      const updated = await updateErrorStatus({
        mode,
        id: errorMatch[1]!,
        status: body.status,
        actorUserId: actor.authUserId,
      });
      return json(updated);
    }

    return json({ error: "Not found" }, 404);
  } catch (err) {
    if (err instanceof AdminForbiddenError) {
      return json({ error: err.message }, err.status);
    }
    console.error(err);
    return json({ error: err instanceof Error ? err.message : "Server error" }, 500);
  }
}
