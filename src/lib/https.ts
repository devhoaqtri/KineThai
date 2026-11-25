/**
 * HTTPS only, on every public address.
 *
 * The hosting edge terminates TLS and forwards the request, so the app sees the scheme the
 * reader used only through the forwarding headers. It redirects only when those headers SAY
 * plain http: a proxy that sends none must not be read as http, or every request would
 * redirect to itself. Every public response also carries HSTS, so a browser that has seen
 * the site once never tries http again, plus two headers with no downside. No frame-blocking
 * header: Lovable's editor previews the app inside an iframe.
 *
 * Local hosts (the dev server, the clip recorder) are left alone.
 *
 * Exports: HSTS_VALUE, httpsRedirect, withSecurityHeaders
 * Depends on: ./bot-gate (local host test)
 */

import { isLocalRequest } from "./bot-gate";

/** One year; not includeSubDomains, which would bind addresses this app does not serve. */
export const HSTS_VALUE = "max-age=31536000";

/** Whether the forwarding headers say the reader used plain http. */
function forwardedAsHttp(request: Request): boolean {
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  if (proto) return proto === "http";
  const visitor = request.headers.get("cf-visitor");
  return visitor ? /"scheme"\s*:\s*"http"/.test(visitor) : false;
}

/**
 * The redirect to https for a public request that arrived over http, else null.
 * 308 keeps the method and body, so a POST is not turned into a GET on the way.
 * @pure true
 */
export function httpsRedirect(request: Request): Response | null {
  if (isLocalRequest(request) || !forwardedAsHttp(request)) return null;
  const url = new URL(request.url);
  url.protocol = "https:";
  url.port = "";
  return new Response(null, { status: 308, headers: { Location: url.toString() } });
}

/**
 * The response with HSTS, nosniff and a referrer policy added, for a public request.
 * Headers already set by a handler win; a response with immutable headers is copied.
 */
export function withSecurityHeaders(request: Request, response: Response): Response {
  if (isLocalRequest(request)) return response;
  const extra: [string, string][] = [
    ["Strict-Transport-Security", HSTS_VALUE],
    ["X-Content-Type-Options", "nosniff"],
    ["Referrer-Policy", "strict-origin-when-cross-origin"],
  ];
  const missing = extra.filter(([name]) => !response.headers.has(name));
  if (!missing.length) return response;
  try {
    for (const [name, value] of missing) response.headers.set(name, value);
    return response;
  } catch {
    const headers = new Headers(response.headers);
    for (const [name, value] of missing) headers.set(name, value);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
}
