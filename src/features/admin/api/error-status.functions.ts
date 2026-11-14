/**
 * Admin error report mutations: report from client + status updates.
 *
 * Exports: reportAdminError, updateAdminErrorStatus, checkAdminAccess
 * Depends on: requireAdmin, telemetry.core, emit, auth middleware
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { emitTelemetryEvent } from "../lib/emit";
import { requireAdminAccess } from "../lib/admin-access";
import { AdminForbiddenError, requireAdminContext } from "../lib/require-admin";
import { updateErrorStatus } from "./telemetry.core";

/**
 * Persist an error.reported event from the client (authenticated).
 * @returns server function handle
 */
export const reportAdminError = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      message: string;
      metadata?: Record<string, string | number | boolean | null>;
      severity?: string;
    }) =>
      z
        .object({
          message: z.string().min(1).max(2000),
          metadata: z
            .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
            .optional()
            .default({}),
          severity: z.enum(["info", "warn", "error", "critical"]).optional().default("error"),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    const event = await emitTelemetryEvent({
      mode: "live",
      event_type: "error.reported",
      actor_user_id: context.userId,
      entity_type: "client",
      severity: data.severity,
      asErrorReport: true,
      errorMessage: data.message,
      metadata: { message: data.message, ...data.metadata },
    });
    return { ok: true as const, eventId: event?.id ?? null };
  });

/**
 * Acknowledge or resolve an error report (admin only).
 * @returns server function handle
 */
export const updateAdminErrorStatus = createServerFn({ method: "POST" })
  .middleware([requireAdminAccess])
  .inputValidator((d: { id: string; status: "new" | "acknowledged" | "resolved" }) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["new", "acknowledged", "resolved"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireAdminContext({ authUserId: context.userId });
    return updateErrorStatus({
      mode: "live",
      id: data.id,
      status: data.status,
      actorUserId: context.userId,
    });
  });

/**
 * Check whether the current user may access /admin.
 * @returns server function handle
 */
export const checkAdminAccess = createServerFn({ method: "GET" }).handler(async () => {
  // Client passes demo via separate path; live uses bearer via optional middleware.
  return { ok: false as const };
});

/**
 * Live admin gate using auth middleware.
 * @returns server function handle
 */
export const checkLiveAdminAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      const actor = await requireAdminContext({ authUserId: context.userId });
      return { ok: true as const, authUserId: actor.authUserId };
    } catch (err) {
      if (err instanceof AdminForbiddenError) return { ok: false as const };
      throw err;
    }
  });
