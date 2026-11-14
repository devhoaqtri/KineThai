/**
 * Server-side admin gate: profile.is_admin, ADMIN_USER_IDS allowlist, or demo flag.
 *
 * Exports: isDemoAdminEnabled, requireAdminContext, AdminActor, AdminForbiddenError
 * Depends on: session demo ids, supabase admin client, getRequest headers
 */

import { DEMO_AUTH_USER_ID } from "@/features/session/demo-session";

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
 * Whether demo sessions may access /admin (VITE_DEMO_ADMIN=1|true under `npm run dev`).
 *
 * A demo admin has no login behind it: the browser only sends a header saying so.
 * `.env` is committed and Vite loads it in every mode, so the flag alone would reach
 * the hosted build and make that header an admin key. A production build never
 * honours it, whatever the environment says.
 * @returns true when demo admin is enabled
 */
export function isDemoAdminEnabled(): boolean {
  if (!import.meta.env.DEV) return false;
  const raw =
    (typeof import.meta !== "undefined" &&
      (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_DEMO_ADMIN) ||
    process.env.VITE_DEMO_ADMIN ||
    "";
  return raw === "1" || raw.toLowerCase() === "true";
}

/**
 * Parse comma-separated ADMIN_USER_IDS bootstrap allowlist.
 * @returns Set of auth user UUIDs
 */
function adminAllowlist(): Set<string> {
  const raw = process.env.ADMIN_USER_IDS ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/**
 * Resolve an admin actor from Authorization bearer or demo header.
 * Throws AdminForbiddenError when not admin.
 * @param options - optional auth user id already resolved
 * @returns Admin actor context
 */
export async function requireAdminContext(options?: {
  authUserId?: string | null;
  isDemo?: boolean;
}): Promise<AdminActor> {
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

  if (adminAllowlist().has(authUserId)) {
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
