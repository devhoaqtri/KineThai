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

/** What an OAuth return puts in the URL: tokens, a code to exchange, or an error. */
const AUTH_CALLBACK_PARAMS =
  /[#?&](access_token|refresh_token|provider_token|code|error|error_description)=/;

/**
 * Whether this URL is a sign-in coming back (the front page keeps these parameters on its
 * way to /feed, see routes/index.tsx). The account client must load at once to take them up.
 * @pure true
 */
export function hasAuthCallbackParams(href: string): boolean {
  return AUTH_CALLBACK_PARAMS.test(href);
}

/**
 * Whether a page should load the account client now: a stored session to keep alive, or a
 * sign-in returning in the URL. A reader who has never signed in gets neither, and never
 * downloads the client; signing in goes through /auth, which loads it itself.
 */
export async function shouldLoadAuthClient(
  href = globalThis.location?.href ?? "",
): Promise<boolean> {
  if (hasAuthCallbackParams(href)) return true;
  return hasStoredAuthSession();
}

export const attachLazyAuth = createMiddleware({ type: "function" }).client(async ({ next }) => {
  if (!(await hasStoredAuthSession())) return next({ headers: {} });
  const { supabase } = await import("@/integrations/supabase/client");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
});
