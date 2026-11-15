/**
 * Public ingest for anonymous visitor telemetry (sessions, page health, errors).
 *
 * The admin emit path writes through `supabaseAdmin`, which holds the service-role
 * key and therefore cannot run in a browser. Without this endpoint a visitor event
 * had nowhere to go but the visitor's own localStorage, so live unique-visitor and
 * error counts were always zero. The browser posts here instead and the server does
 * the privileged write.
 *
 * Only the three visitor event types are accepted. Anything else — including the
 * content and user events an admin emits — is rejected, so a public endpoint cannot
 * be used to forge activity metrics.
 *
 * Exports: visitorTelemetryPostResponse
 * Depends on: zod, supabase admin (lazily, server only)
 */

import { z } from "zod";
import { APP_ID } from "../types/telemetry";
import { classifyWriter } from "@/lib/bot-signals";

/** Event types a browser is allowed to report about itself. */
const VISITOR_EVENT_TYPES = ["page.loaded", "page.failed", "session.error"] as const;

const MAX_EVENTS_PER_REQUEST = 20;
const MAX_MESSAGE_LENGTH = 500;

const sessionIdSchema = z.string().uuid();

const eventSchema = z.object({
  type: z.enum(VISITOR_EVENT_TYPES),
  /** Failure text, truncated server-side; absent for a successful load. */
  message: z.string().max(MAX_MESSAGE_LENGTH).optional(),
  /** Small flat bag of scalars; anything nested or oversized is dropped. */
  metadata: z
    .record(z.string().max(40), z.union([z.string().max(200), z.number(), z.boolean(), z.null()]))
    .optional(),
  occurredAt: z.string().datetime().optional(),
});

const bodySchema = z.object({
  sessionId: sessionIdSchema,
  events: z.array(eventSchema).min(1).max(MAX_EVENTS_PER_REQUEST),
});

const headers = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "content-type": "application/json; charset=utf-8",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers });
}

function utcDateKey(iso: string): string {
  return iso.slice(0, 10);
}

function supabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

type VisitorEvent = z.infer<typeof eventSchema>;

/** Per-day counter deltas for the session row, derived from the batch. */
function countDeltas(events: VisitorEvent[]) {
  return {
    page_loads: events.filter((e) => e.type === "page.loaded").length,
    page_failures: events.filter((e) => e.type === "page.failed").length,
    errors: events.filter((e) => e.type === "session.error").length,
  };
}

/**
 * POST /api/public/telemetry — record visitor events for one session.
 *
 * Accepts a batch so a page can report a load and a subsequent failure without
 * two round trips. Succeeds quietly when Supabase is unconfigured (local dev),
 * because a visitor's page must never fail on a telemetry problem.
 * @param request Incoming POST with { sessionId, events }.
 * @returns JSON { accepted } — the number of events written.
 */
export async function visitorTelemetryPostResponse(request: Request): Promise<Response> {
  // Limited per address by the request middleware (RATE_LIMITS in lib/rate-limit), sized
  // for a carrier NAT. This used to take a second, tighter token per address here too, so
  // a busy shared address lost its telemetry at 120 a minute.
  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch (err) {
    const message = err instanceof z.ZodError ? err.issues[0]?.message : "Invalid body";
    return json({ error: message ?? "Invalid body" }, 400);
  }

  if (!supabaseConfigured()) {
    return json({ accepted: 0, stored: false });
  }

  const { sessionId, events } = parsed;
  const now = new Date().toISOString();
  // Weak bot signals ride along on every row, so a dashboard can tell how much of a count
  // looks automated; certain bots were already refused by the middleware (lib/bot-signals).
  const botSignals = classifyWriter(request).shadow.join(",") || null;

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const rows = events.map((event) => {
      const occurredAt = event.occurredAt ?? now;
      const metadata: Record<string, string | number | boolean | null> = {
        ...(event.metadata ?? {}),
      };
      if (event.message) metadata.message = event.message.slice(0, MAX_MESSAGE_LENGTH);
      if (botSignals) metadata.bot_signals = botSignals;
      return {
        app_id: APP_ID,
        event_type: event.type,
        occurred_at: occurredAt,
        actor_user_id: null,
        entity_type: "visitor_session",
        entity_id: sessionId,
        metadata,
        severity: event.type === "page.loaded" ? "info" : "warn",
      };
    });

    const { error: insertError } = await supabaseAdmin.from("telemetry_events").insert(rows);
    if (insertError) throw new Error(insertError.message);

    // One session row per UTC day, so a session spanning midnight counts as a
    // visitor on both days rather than being attributed to whichever day it
    // happened to start on.
    const byDate = new Map<string, VisitorEvent[]>();
    for (const event of events) {
      const date = utcDateKey(event.occurredAt ?? now);
      byDate.set(date, [...(byDate.get(date) ?? []), event]);
    }

    const { recordVisitorSession } = await import("./telemetry-rpc.server");
    for (const [date, dayEvents] of byDate) {
      const deltas = countDeltas(dayEvents);
      await recordVisitorSession({
        appId: APP_ID,
        sessionId,
        date,
        pageLoads: deltas.page_loads,
        pageFailures: deltas.page_failures,
        errors: deltas.errors,
      });
    }

    const failures = events.filter((e) => e.type !== "page.loaded");
    if (failures.length) {
      await supabaseAdmin.rpc("bump_telemetry_daily_rollup", {
        _app_id: APP_ID,
        _date: utcDateKey(now),
        _errors_total: failures.length,
      });
    }

    return json({ accepted: events.length, stored: true });
  } catch (err) {
    console.error("[telemetry] visitor ingest failed", err);
    return json({ error: "Ingest failed" }, 500);
  }
}
