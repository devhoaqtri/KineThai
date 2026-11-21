import { createMiddleware } from "@tanstack/react-start";
import { brokeredPreviewStorage } from "@/integrations/supabase/previewAuthStorage";

// Project-owned replacement: leave the generated attacher untouched so regeneration
// cannot put the account SDK back into the main script. Check the same storage the
// client uses (including the editor broker), never assume localStorage is its owner.
export async function hasStoredAuthSession(): Promise<boolean> {
  const url = import.meta.env.VITE_SUPABASE_URL;
  if (!url) return true;
  try {
    const storage = brokeredPreviewStorage();
    if (!storage) return true;
    const project = new URL(url).hostname.split(".")[0];
    if (!project) return true;
    return (await storage.getItem(`sb-${project}-auth-token`)) !== null;
  } catch {
    // A blocked store is unknown, not signed out. Let the SDK recover its session.
    return true;
  }
}

export const attachLazyAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    if (!(await hasStoredAuthSession())) return next({ headers: {} });
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
  },
);