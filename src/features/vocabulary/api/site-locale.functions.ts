/** Server fn: the answer language for the requested address. Exports: getSiteLocale, resolveRouteLocale. */
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { resolveTarget, type TargetLocale } from "../lib/target-language";

export const getSiteLocale = createServerFn({ method: "GET" }).handler((): TargetLocale => {
  const request = getRequest();
  return resolveTarget(request.headers.get("host") ?? new URL(request.url).host);
});

/**
 * Resolve the target locale for a route loader.
 * In the browser, synchronously resolves from location.host so static SPA deployments
 * (Vercel static, GitHub Pages) never issue a doomed server-function RPC on navigation.
 * On the server, reads the request Host header via getSiteLocale().
 */
export async function resolveRouteLocale(): Promise<TargetLocale> {
  if (typeof window !== "undefined") {
    return resolveTarget(window.location.host);
  }
  try {
    return await getSiteLocale();
  } catch {
    return "en";
  }
}
