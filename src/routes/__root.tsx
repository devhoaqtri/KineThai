/**
 * App root route: head meta, shell wiring, and document providers.
 *
 * Exports: Route
 * Depends on: @tanstack/react-query, @tanstack/react-router, features/shell, styles.css
 */

import { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, notFound } from "@tanstack/react-router";
import { ErrorComponent } from "@/features/shell/components/ErrorComponent";
import { NotFoundComponent } from "@/features/shell/components/NotFoundComponent";
import { RootApp, RootShell } from "@/features/shell/components/RootDocument";
import { isAllowedPage } from "@/lib/reader-routes";
import appCss from "../styles.css?url";
import { getSiteLocale } from "@/features/vocabulary/api/site-locale.functions";
import { resolveTarget, sitePageHead } from "@/features/vocabulary/lib/target-language";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  // Only the reader's pages exist (lib/reader-routes): the social network, its Google
  // sign-in and the creator studio answer 404, on a full load and on in-app navigation.
  beforeLoad: ({ location }) => {
    if (!isAllowedPage(location.pathname, import.meta.env.DEV)) throw notFound();
  },
  // The visited address picks the answer language (hoa.* → Chinese, etc.).
  loader: async () => ({
    locale:
      typeof window === "undefined" ? await getSiteLocale() : resolveTarget(window.location.host),
  }),
  head: ({ loaderData }) => {
    const head = sitePageHead(loaderData?.locale ?? "en");
    return {
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
        { name: "theme-color", content: "#0a0014" },
        ...head.meta,
      ],
      links: [
        { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
        { rel: "icon", href: "/favicon.ico", sizes: "16x16 32x32 48x48" },
        { rel: "icon", href: "/brand/logo-32.png", type: "image/png", sizes: "32x32" },
        { rel: "icon", href: "/brand/logo-192.png", type: "image/png", sizes: "192x192" },
        { rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" },
        { rel: "mask-icon", href: "/brand/logo-mono.svg", color: "#10b981" },
        { rel: "manifest", href: "/site.webmanifest" },
        { rel: "stylesheet", href: appCss },
        { rel: "preconnect", href: "https://fonts.googleapis.com" },
        { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "" },
        // Weight RANGES, not a list of static cuts: the canvas paints body text at 800
        // and emphasis at 900, and with only 700/900 on offer both resolved to the same
        // face (or to a lighter one), so emphasis carried no weight contrast. A range is
        // also one variable file per subset instead of one per weight.
        {
          rel: "stylesheet",
          href: "https://fonts.googleapis.com/css2?family=Inter:wght@400..900&family=Space+Grotesk:wght@400..700&family=Playfair+Display:ital,wght@0,400..900;1,700&family=JetBrains+Mono:wght@400..800&family=Dancing+Script:wght@400..700&family=Playpen+Sans:wght@400..800&family=Shantell+Sans:wght@400..800&family=Charm:wght@400;700&display=swap",
        },
      ],
    };
  },
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return <RootApp queryClient={queryClient} />;
}
