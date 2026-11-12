/**
 * The pages a visitor arrives on, answered cheaply before they are rendered.
 *
 * Two pages take outside traffic: the home feed (`/`, which only redirects, and `/feed`)
 * and a share link (`/w/<code>`), the page made to travel off-site. Both are what a link
 * preview, a crawler or a scraper fetches in bulk, and both rendered on every hit. The word
 * content they load is already gated and limited (lib/bot-gate, RATE_LIMITS); this keeps
 * the pages themselves from costing a server render per hit:
 *
 * - a share path that cannot be a code redirects to the feed, which is where the page
 *   lands anyway when the code names nothing;
 * - an automated agent gets a static document carrying only the site's head. That is all a
 *   link preview reads, and all a crawler ever saw: the pages are data-only SSR, so the
 *   rendered shell holds no words either, and the feed's word endpoint refuses crawlers;
 * - a browser spends the page's budget per address (SHARE_PAGE_BUDGET, FEED_PAGE_BUDGET);
 *   past it, a small 429 page. `/` is not charged, since it only sends the browser on to
 *   `/feed`, which is.
 *
 * Local hosts are exempt, like the bot gate and the API limits.
 *
 * Exports: pageGuard, renderPreviewDocument, renderSlowDownPage
 * Depends on: bot-gate, rate-limit, share-code, target-language
 */
import { isAutomatedAgent, isLocalRequest } from "./bot-gate";
import {
  FEED_PAGE_BUDGET,
  SHARE_PAGE_BUDGET,
  callerKey,
  checkRateLimit,
  type RateBudget,
} from "./rate-limit";
import { isShareCode } from "@/features/vocabulary/lib/share-code";
import { resolveTarget, sitePageHead } from "@/features/vocabulary/lib/target-language";

const SHARE_PATH = /^\/w\/([^/]*)\/?$/;
const FEED_PATH = /^\/feed\/?$/;

const html = (body: string, status: number, extra: Record<string, string> = {}) =>
  new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Its body depends on who asked, so no shared cache may keep it for anyone else.
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
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

/** The page a browser gets past its page budget. */
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
    <p>Bạn tải trang hơi nhanh. Thử lại sau ít phút nhé.</p>
    <p><a href="">Tải lại</a></p>
  </body>
</html>`;
}

/** Which guarded page a path is, with what a browser pays for it (null: nothing). */
function guardedPage(
  path: string,
):
  | { kind: "share"; code: string; budget: RateBudget }
  | { kind: "feed"; budget: RateBudget | null }
  | null {
  if (path === "/") return { kind: "feed", budget: null };
  if (FEED_PATH.test(path)) return { kind: "feed", budget: FEED_PAGE_BUDGET };
  const share = SHARE_PATH.exec(path);
  if (!share) return null;
  let code = "";
  try {
    code = decodeURIComponent(share[1] ?? "");
  } catch {
    // A broken escape is not a code either.
  }
  return { kind: "share", code, budget: SHARE_PAGE_BUDGET };
}

/**
 * Answer a request for a guarded page before it is rendered, when it should not be.
 * @param request - any incoming request
 * @returns A response for a page that must not render, or null to carry on
 */
export function pageGuard(request: Request): Response | null {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const url = new URL(request.url);
  const page = guardedPage(url.pathname);
  if (!page || isLocalRequest(request)) return null;
  if (page.kind === "share" && !isShareCode(page.code)) {
    return Response.redirect(new URL("/feed", url), 302);
  }
  if (isAutomatedAgent(request)) {
    // The share page is disallowed in robots.txt, so it also says so to any crawler that
    // ignores that; the feed stays as indexable as it was.
    const robots: Record<string, string> =
      page.kind === "share" ? { "X-Robots-Tag": "noindex, nofollow" } : {};
    return html(renderPreviewDocument(request.headers.get("host") ?? url.host), 200, robots);
  }
  if (!page.budget) return null;
  const verdict = checkRateLimit(`page:${page.kind}`, callerKey(request), page.budget);
  if (verdict.allowed) return null;
  return html(renderSlowDownPage(), 429, { "Retry-After": String(verdict.retryAfterSeconds) });
}
