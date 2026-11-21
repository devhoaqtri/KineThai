/**
 * Whether the person using the app is an admin — for showing admin-only controls
 * on otherwise public pages.
 *
 * It applies the same rule as the /admin route: a demo session counts when
 * VITE_DEMO_ADMIN is on; a signed-in account counts when the server says so
 * (profiles.is_admin or the ADMIN_USER_IDS allowlist). The answer is never trusted
 * for anything but showing a control — every admin action still checks server-side.
 *
 * Exports: useIsAdmin
 * Depends on: React, session demo flag, admin gate (the live check is imported lazily)
 */

import { useEffect, useState } from "react";
import { isDemoSession } from "@/features/session/demo-session";
import { isDemoAdminEnabled } from "../lib/demo-admin-flag";

/**
 * Resolve admin status once per mount.
 * @returns false until the check passes; never throws and never blocks rendering
 */
export function useIsAdmin(): boolean {
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const resolve = async (): Promise<boolean> => {
      if (isDemoSession()) return isDemoAdminEnabled();
      // A public visitor on a build without auth configured is simply not an admin.
      if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) {
        return false;
      }
      // Imported on demand so the public feed does not bundle the auth client or
      // the admin server functions for visitors who will never need them.
      const { supabase } = await import("@/integrations/supabase/client");
      const { data } = await supabase.auth.getSession();
      if (!data.session) return false;
      const { checkLiveAdminAccess } = await import("../api/error-status.functions");
      return (await checkLiveAdminAccess()).ok;
    };
    resolve()
      .then((value) => {
        if (!cancelled) setIsAdmin(value);
      })
      .catch(() => {
        // Signed out, offline or forbidden: all of them mean "do not show it".
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return isAdmin;
}
