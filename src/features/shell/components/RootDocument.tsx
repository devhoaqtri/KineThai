/**
 * Root HTML shell and React Query / auth wiring for the app document.
 *
 * Exports: RootShell, RootApp
 * Depends on: @tanstack/react-query, @tanstack/react-router, sonner
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Outlet, useRouter, HeadContent, Scripts } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { buildLegacyBrowserWarningScript } from "@/lib/browser-support";
import { installStaleChunkReload } from "@/lib/stale-chunk";
import { shouldLoadAuthClient } from "@/lib/lazy-auth";
import { UnsupportedBrowserWarning } from "./UnsupportedBrowserWarning";
import { DesktopModeNotice } from "./DesktopModeNotice";
import { ReaderNotices } from "./ReaderNotices";

const LEGACY_BROWSER_WARNING_SCRIPT = buildLegacyBrowserWarningScript();
const LazyToaster = lazy(() => import("sonner").then(({ Toaster }) => ({ default: Toaster })));

/**
 * HTML document shell that hosts head content, body children, and scripts.
 * @param props.children - Route tree content
 * @returns html/head/body document frame
 */
export function RootShell({ children }: { children: ReactNode }) {
  return (
    // translate="no" and the notranslate meta keep the browser from translating the page:
    // a phone set to English offers to translate the Vietnamese, the translation rewrites
    // text nodes React owns, and React then crashes on them (removeChild/insertBefore).
    <html lang="en" translate="no">
      <head>
        <meta name="google" content="notranslate" />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
        <script dangerouslySetInnerHTML={{ __html: LEGACY_BROWSER_WARNING_SCRIPT }} />
      </body>
    </html>
  );
}

/**
 * Root app providers: React Query, auth invalidation, toast host.
 * @param props.queryClient - Shared QueryClient from router context
 * @returns Provider-wrapped outlet tree
 */
export function RootApp({ queryClient }: { queryClient: QueryClient }) {
  const router = useRouter();

  // A page left open across a deploy reloads once to fetch the new version's chunks.
  useEffect(() => installStaleChunkReload(), []);

  useEffect(() => {
    // Public vocabulary browsing does not require a configured auth provider.
    if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)
      return;
    let disposed = false;
    let unsub: { unsubscribe?: () => void } | undefined;
    // Only for someone who is signed in or coming back from signing in (lib/lazy-auth):
    // loading the account client for every reader put 53 KB (gzip) on the first word's
    // network path, measured live on 2026-11-22.
    void shouldLoadAuthClient()
      .then((load) => (load ? import("@/integrations/supabase/client") : null))
      .then((client) => {
        if (!client || disposed) return;
        const { supabase } = client;
        if (disposed) return;
        const { data } = supabase.auth.onAuthStateChange((event) => {
          if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
          void router.invalidate();
          if (event !== "SIGNED_OUT")
            void queryClient.invalidateQueries({
              predicate: (query) => query.queryKey[0] !== "vocabulary",
            });
        });
        unsub = data.subscription;
      })
      .catch(() => {
        // Protected routes still enforce auth; a provider failure must not disable public pages.
      });
    return () => {
      disposed = true;
      unsub?.unsubscribe?.();
    };
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <UnsupportedBrowserWarning />
      <DesktopModeNotice />
      <ReaderNotices />
      <Outlet />
      <Suspense fallback={null}>
        <LazyToaster position="top-center" theme="dark" richColors />
      </Suspense>
    </QueryClientProvider>
  );
}
