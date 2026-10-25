/**
 * Browser-only gate for the endpoints that hand out word content.
 *
 * The feed and the single-word lookup are called by the app's own pages with `fetch`, so a
 * legitimate request always looks like one: a browser user agent, the Fetch Metadata
 * headers every current browser attaches (`Sec-Fetch-Site: same-origin` for a call from
 * our own page), and an Accept-Language. Command-line clients, scraping libraries and
 * declared crawlers send none of that by default, and a URL pasted into the address bar
 * arrives as a navigation, not a same-origin fetch.
 *
 * What this is and is not: every header here can be forged by someone who sets out to,
 * so it is a filter for tools and crawlers run as-is, not a lock. The rate limits and the
 * signed stream cursor are what bound a client that does forge them.
 *
 * Local hosts are exempt, so the dev server and the clip recorder (headless Chrome against
 * localhost by default) keep working.
 *
 * Exports: WORD_DATA_PATHS, isLocalRequest, isBrowserRequest, browserOnlyResponse
 * Depends on: none (leaf module)
 */

/** Paths that return word content and are therefore gated. */
export const WORD_DATA_PATHS: ReadonlySet<string> = new Set([
  "/api/public/vocabulary",
  "/api/public/word",
]);

// HTTP libraries, CLI tools, automation and anything that announces itself as a bot.
const TOOL_AGENT =
  /curl|wget|httpie|python|aiohttp|httpx|urllib|requests|scrapy|go-http-client|okhttp|java\/|apache-httpclient|libwww|lwp|node-fetch|undici|axios|got\/|deno|bun\/|postman|insomnia|powershell|headless|phantomjs|selenium|puppeteer|playwright|\bbot\b|bot\/|spider|crawl|slurp|scrape|fetch\//i;

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:\d+)?$/;

/**
 * Whether the request was routed to a local host: the dev server or the clip recorder.
 * Judged from the URL the server routed, not a Host header the caller chose.
 * @param request - the incoming request
 * @returns True on localhost and loopback addresses
 */
export function isLocalRequest(request: Request): boolean {
  return LOCAL_HOST.test(new URL(request.url).host);
}

/**
 * Whether a request carries what the app's own pages send.
 * @param request - the incoming request
 * @returns True for a same-origin fetch from a browser (or any request on a local host)
 */
export function isBrowserRequest(request: Request): boolean {
  if (isLocalRequest(request)) return true;
  const agent = request.headers.get("user-agent") ?? "";
  if (!/^Mozilla\/5\.0 /.test(agent) || TOOL_AGENT.test(agent)) return false;
  if (request.headers.get("sec-fetch-site") !== "same-origin") return false;
  const mode = request.headers.get("sec-fetch-mode");
  if (mode !== "cors" && mode !== "same-origin") return false;
  if (!request.headers.get("accept-language")) return false;
  return true;
}

/** The refusal a gated request gets: the same JSON shape as every other API error. */
export function browserOnlyResponse(): Response {
  return Response.json(
    { code: "FORBIDDEN", error: "This endpoint only serves the app." },
    {
      status: 403,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex, nofollow",
      },
    },
  );
}
