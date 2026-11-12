import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { RATE_LIMITS, callerKey, checkRateLimit, rateLimitedResponse } from "./lib/rate-limit";
import {
  WORD_DATA_PATHS,
  browserOnlyResponse,
  isBrowserRequest,
  isLocalRequest,
} from "./lib/bot-gate";
import { pageGuard } from "./lib/page-guard";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

/**
 * Rate limiting, applied here rather than inside each handler.
 *
 * It used to live in one endpoint, and the four other public routes never got it —
 * including the unauthenticated telemetry POST that writes with the service-role key.
 * Running it in the request chain means a new route under /api/public is limited by
 * adding a line to RATE_LIMITS, not by remembering to call something.
 *
 * Only paths named in RATE_LIMITS are touched, plus the two pages a visitor arrives on, the
 * home feed and the share link (lib/page-guard): other page loads, assets and server
 * functions pass straight through.
 *
 * Local hosts are exempt, as they are from the bot gate. Without a forwarding header every
 * local caller shares one limiter key, so a developer reloading, the clip recorder and any
 * test run all spent ONE budget between them, and the feed went dark after a few reloads.
 */
const rateLimitMiddleware = createMiddleware().server(async ({ next, request }) => {
  const path = new URL(request.url).pathname;
  const pageAnswer = pageGuard(request);
  if (pageAnswer) return pageAnswer;
  // Tools and crawlers are turned away before they cost a token: an endpoint that hands
  // out word content only answers the app's own pages (see lib/bot-gate).
  if (WORD_DATA_PATHS.has(path) && !isBrowserRequest(request)) return browserOnlyResponse();
  const budget = RATE_LIMITS[path];
  if (!budget || isLocalRequest(request)) return next();
  const verdict = checkRateLimit(path, callerKey(request), budget);
  if (!verdict.allowed) return rateLimitedResponse(verdict.retryAfterSeconds);
  return next();
});

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  // Limit first: a refused request must not reach a handler, and the error middleware
  // still wraps it because it is the outer one.
  requestMiddleware: [errorMiddleware, rateLimitMiddleware],
}));
