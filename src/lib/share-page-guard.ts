/**
 * The share-link page (`/w/<code>`) answered cheaply before it is rendered.
 *
 * A share link is the one page meant to travel outside the site, so it is the one most
 * likely to be fetched in bulk: link-preview fetchers fan out when a link is posted, and a
 * scraper walking the 32,768-code space hits a fresh path every time. The word lookup the
 * page makes is already gated and limited (lib/bot-gate, RATE_LIMITS["/api/public/word"]);
 * this keeps the page itself from costing a server render per hit:
 *
 * - a path that cannot be a share code redirects to the feed, which is where the page
 *   lands anyway when the code names nothing;
 * - an automated agent gets a static document carrying only the site's head, which is all a
 *   link preview reads (the preview is the site's own and never names the word), and all a
 *   crawler should see of a page robots.txt already disallows;
 * - a browser spends SHARE_PAGE_BUDGET per address; past it, a small 429 page.
 *
 * Local hosts are exempt, like the bot gate and the API limits.
 *
 * Exports: sharePageGuard, renderPreviewDocument, renderSlowDownPage
 * Depends on: bot-gate, rate-limit, share-code, target-language
 */
import { isAutomatedAgent, isLocalRequest } from "./bot-gate";
import { SHARE_PAGE_BUDGET, callerKey, checkRateLimit } from "./rate-limit";
import { isShareCode } from "@/features/vocabulary/lib/share-code";
import { resolveTarget, sitePageHead } from "@/features/vocabulary/lib/target-language";

const SHARE_PATH = /^\/w\/([^/]*)\/?$/;

const html = (body: string, status: number, extra: Record<string, string> = {}) =>
  new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Its body depends on who asked, so no shared cache may keep it for anyone else.
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",
      ...extra,
    },
  });

const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!,
  );

/**
 * The page an automated agent gets: the same head the rendered page carries, and nothing
 * else, so a link preview looks exactly as it did.
 * @param host - the Host the request was sent to, which picks the site's language
 */
export function renderPreviewDocument(host: string): string {
  const tags = sitePageHead(resolveTarget(host)).meta.map((tag) => {
    const { title, property, name, content } = tag as Partial<Record<string, string>>;
    if (title !== undefined) return `<title>${escape(title)}</title>`;
    const key = property !== undefined ? "property" : "name";
    return `<meta ${key}="${escape(property ?? name ?? "")}" content="${escape(content ?? "")}" />`;
  });
  return `<!doctype html>
<html lang="vi">
  <head>
    <meta charset="utf-8" />
    ${tags.join("\n    ")}
  </head>
  <body></body>
</html>`;
}

/** The page a browser gets past SHARE_PAGE_BUDGET. */
export function renderSlowDownPage(): string {
  return `<!doctype html>
<html lang="vi">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Chậm lại xíu</title>
    <style>
      body { font: 15px/1.5 system-ui, -apple-system, sans-serif; background: #0a0014; color: #f5f3ff; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1.5rem; text-align: center; }
      a { color: #c4b5fd; }
    </style>
  </head>
  <body>
    <p>Bạn mở liên kết hơi nhanh. Thử lại sau ít phút, hoặc <a href="/">về trang chính</a>.</p>
  </body>
</html>`;
}

/**
 * Answer a share-link request before it is rendered, when it should not be.
 * @param request - any incoming request
 * @returns A response for a share page that must not render, or null to carry on
 */
export function sharePageGuard(request: Request): Response | null {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const url = new URL(request.url);
  const match = SHARE_PATH.exec(url.pathname);
  if (!match || isLocalRequest(request)) return null;
  let code = "";
  try {
    code = decodeURIComponent(match[1] ?? "");
  } catch {
    // A broken escape is not a code either.
  }
  if (!isShareCode(code)) return Response.redirect(new URL("/", url), 302);
  if (isAutomatedAgent(request)) {
    return html(renderPreviewDocument(request.headers.get("host") ?? url.host), 200);
  }
  const verdict = checkRateLimit("share-page", callerKey(request), SHARE_PAGE_BUDGET);
  if (verdict.allowed) return null;
  return html(renderSlowDownPage(), 429, { "Retry-After": String(verdict.retryAfterSeconds) });
}
