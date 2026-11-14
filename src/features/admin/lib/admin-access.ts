/**
 * Server-fn access gate for admin write actions that must also work in the
 * local demo session (VITE_DEMO_ADMIN), where there is no Supabase login.
 *
 * Exports: requireAdminAccess, requireAdmin
 * Depends on: demo-session flag, require-admin demo check, Supabase bearer validation
 *
 * Why not reuse requireSupabaseAuth: that middleware hard-requires a Bearer
 * token and throws "No authorization header provided" for demo sessions, so
 * every admin write (switch key, load models, test, regenerate) fails in demo.
 * This gate accepts EITHER the demo-admin header OR a valid Supabase admin
 * token, mirroring the header contract already used by the telemetry HTTP
 * endpoint (x-kinetic-demo-admin).
 */

import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";

import { DEMO_AUTH_USER_ID, isDemoSession } from "@/features/session/demo-session";
import type { Database } from "@/integrations/supabase/types";

import { isDemoAdminEnabled, requireAdminContext } from "./require-admin";

const DEMO_HEADER = "x-kinetic-demo-admin";

export const requireAdminAccess = createMiddleware({ type: "function" })
  // Client: tag the request as demo when the browser holds a demo session.
  .client(async ({ next }) => {
    const headers: Record<string, string> = {};
    try {
      if (isDemoSession()) headers[DEMO_HEADER] = "1";
    } catch {
      // localStorage may be unavailable; fall through to the bearer path.
    }
    return next({ headers });
  })
  // Server: resolve the acting user from the signed PIN cookie, demo header, or Supabase bearer.
  .server(async ({ next }) => {
    const request = getRequest();

    const { ADMIN_PIN_ACTOR_ID, hasValidAdminPinCookie } = await import("./admin-pin.server");
    if (await hasValidAdminPinCookie(request)) {
      return next({ context: { userId: ADMIN_PIN_ACTOR_ID } });
    }

    if (request?.headers?.get(DEMO_HEADER) === "1" && isDemoAdminEnabled()) {
      return next({ context: { userId: DEMO_AUTH_USER_ID } });
    }

    const authHeader = request?.headers?.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      throw new Error(
        "Unauthorized: unlock /admin with the PIN, sign in, or start a demo session.",
      );
    }

    const token = authHeader.slice("Bearer ".length);
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      throw new Error("Auth unavailable: missing Supabase environment variables.");
    }

    const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase.auth.getClaims(token);
    if (error || !data?.claims?.sub) {
      throw new Error("Unauthorized: invalid token");
    }

    return next({ context: { userId: data.claims.sub as string } });
  });

/**
 * The whole admin check for a server function: who is asking ({@link requireAdminAccess})
 * and whether they are an admin (requireAdminContext). For reads, which have no
 * handler-side check of their own; a server function is a public HTTP endpoint,
 * so the /admin route's own gate does not protect it.
 */
export const requireAdmin = createMiddleware({ type: "function" })
  .middleware([requireAdminAccess])
  .server(async ({ next, context }) => {
    await requireAdminContext({ authUserId: context.userId });
    return next();
  });
