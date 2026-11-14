/**
 * Root HTML shell and React Query / auth wiring for the app document.
 *
 * Exports: RootShell, RootApp
 * Depends on: @tanstack/react-query, @tanstack/react-router, sonner
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Outlet, useRouter, HeadContent, Scripts } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Toaster } from "sonner";
import { buildLegacyBrowserWarningScript } from "@/lib/browser-support";
import { UnsupportedBrowserWarning } from "./UnsupportedBrowserWarning";

const LEGACY_BROWSER_WARNING_SCRIPT = buildLegacyBrowserWarningScript();

/**
 * HTML document shell that hosts head content, body children, and scripts.
 * @param props.children - Route tree content
 * @returns html/head/body document frame
 */
export function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
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

  useEffect(() => {
    // Public vocabulary browsing does not require a configured auth provider.
    if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)
      return;
    let disposed = false;
    let unsub: { unsubscribe?: () => void } | undefined;
    import("@/integrations/supabase/client")
      .then(({ supabase }) => {
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
      <Outlet />
      <Toaster position="top-center" theme="dark" richColors />
    </QueryClientProvider>
  );
}
