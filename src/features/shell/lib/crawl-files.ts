/**
 * robots.txt and sitemap.xml for whichever language site asked. One deployment serves every
 * address (lib/target-language), so both name the visited address rather than one fixed
 * domain, the way the page titles do.
 *
 * The sitemap lists the public pages a reader can land on. Personal pages (saved words, the
 * word library), share links (one per word, a preview for people, not an index), the admin,
 * the API and the dev-only tools stay out, and robots.txt asks crawlers to skip them.
 *
 * Exports: SITEMAP_PATHS, CRAWL_DISALLOW, robotsTxt, sitemapXml, crawlFileResponse
 * Depends on: none (leaf module)
 */

/** Public pages, in the order a reader meets them. */
export const SITEMAP_PATHS: readonly string[] = [
  "/feed",
  "/feed/about",
  "/store",
  "/privacy",
  "/terms",
];

/** What crawlers are asked to skip. */
export const CRAWL_DISALLOW: readonly string[] = [
  "/api/",
  "/w/",
  "/admin",
  "/auth",
  "/feed/saved",
  "/feed/library",
  "/posting",
  "/export/",
  "/carousel/",
  "/showcase",
  "/badge-lab",
  "/burst-lab",
  "/tiktok-lab",
];

/** The site's own origin, always https: that is the only scheme it serves (lib/https). */
function origin(host: string): string {
  return `https://${host.replace(/[^a-z0-9.:-]/gi, "")}`;
}

/** @pure true */
export function robotsTxt(host: string): string {
  return [
    "User-agent: *",
    ...CRAWL_DISALLOW.map((path) => `Disallow: ${path}`),
    "",
    `Sitemap: ${origin(host)}/sitemap.xml`,
    "",
  ].join("\n");
}

/** @pure true */
export function sitemapXml(host: string): string {
  const urls = SITEMAP_PATHS.map((path) => `  <url><loc>${origin(host)}${path}</loc></url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>
`;
}

/**
 * The response for either file, for the host the request was sent to.
 * @param request - the incoming GET
 * @param kind - which file
 */
export function crawlFileResponse(request: Request, kind: "robots" | "sitemap"): Response {
  const host = request.headers.get("host") ?? new URL(request.url).host;
  const body = kind === "robots" ? robotsTxt(host) : sitemapXml(host);
  return new Response(body, {
    headers: {
      "Content-Type":
        kind === "robots" ? "text/plain; charset=utf-8" : "application/xml; charset=utf-8",
      // Per host, so a shared cache must key it by host; a day is plenty for either file.
      "Cache-Control": "public, max-age=86400",
      Vary: "Host",
    },
  });
}
