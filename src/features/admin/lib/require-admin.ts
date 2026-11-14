/**
 * Server-side admin gate: signed PIN session, profile.is_admin, ADMIN_USER_IDS allowlist, or demo flag.
 *
 * Exports: isDemoAdminEnabled, requireAdminContext, AdminActor, AdminForbiddenError
 * Depends on: session demo ids, demo-admin-flag, admin-pin.server (lazy), supabase admin client (lazy)
 */

import { DEMO_AUTH_USER_ID } from "@/features/session/demo-session";
import { isDemoAdminEnabled } from "./demo-admin-flag";

export { isDemoAdminEnabled };

export class AdminForbiddenError extends Error {
  status = 403 as const;
  constructor(message = "Forbidden: admin access required") {
    super(message);
    this.name = "AdminForbiddenError";
  }
}

export type AdminActor = {
  authUserId: string;
  mode: "live" | "demo";
};

/**
 * Resolve an admin actor from a verified PIN session, Authorization bearer, or demo header.
 * Throws AdminForbiddenError when not admin.
 * @param options - optional auth user id, demo flag, or server-verified PIN flag
 * @returns Admin actor context
 */
export async function requireAdminContext(options?: {
  authUserId?: string | null;
  isDemo?: boolean;
  pinVerified?: boolean;
}): Promise<AdminActor> {
  if (options?.pinVerified) {
    const { ADMIN_PIN_ACTOR_ID } = await import("./admin-pin.server");
    return { authUserId: options.authUserId ?? ADMIN_PIN_ACTOR_ID, mode: "live" };
  }

  if (options?.isDemo || options?.authUserId === DEMO_AUTH_USER_ID) {
    if (!isDemoAdminEnabled()) {
      throw new AdminForbiddenError("Demo admin disabled (set VITE_DEMO_ADMIN=1)");
    }
    return { authUserId: DEMO_AUTH_USER_ID, mode: "demo" };
  }

  const authUserId = options?.authUserId;
  if (!authUserId) {
    throw new AdminForbiddenError("Unauthorized");
  }

  const { ADMIN_PIN_ACTOR_ID, hasValidAdminPinCookie } = await import("./admin-pin.server");
  if (authUserId === ADMIN_PIN_ACTOR_ID) {
    if (await hasValidAdminPinCookie()) {
      return { authUserId: ADMIN_PIN_ACTOR_ID, mode: "live" };
    }
    throw new AdminForbiddenError("Admin PIN required");
  }

  const allowlistRaw = process.env.ADMIN_USER_IDS ?? "";
  const allowlist = new Set(
    allowlistRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  if (allowlist.has(authUserId)) {
    return { authUserId, mode: "live" };
  }

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("is_admin")
      .eq("auth_user_id", authUserId)
      .maybeSingle();
    if (data?.is_admin) {
      return { authUserId, mode: "live" };
    }
  } catch {
    // Fall through to forbidden — missing env still denies access.
  }

  throw new AdminForbiddenError();
}
