import { describe, expect, it } from "vitest";
import {
  CRAWL_DISALLOW,
  SITEMAP_PATHS,
  crawlFileResponse,
  robotsTxt,
  sitemapXml,
} from "./crawl-files";

describe("robots.txt and sitemap.xml", () => {
  it("name the language site that was visited, over https", () => {
    expect(robotsTxt("phap.chayla.app")).toContain("Sitemap: https://phap.chayla.app/sitemap.xml");
    expect(sitemapXml("hoa.chayla.app")).toContain("<loc>https://hoa.chayla.app/feed</loc>");
  });

  it("never list a page they ask crawlers to skip", () => {
    for (const path of SITEMAP_PATHS) {
      expect(CRAWL_DISALLOW.some((blocked) => path.startsWith(blocked))).toBe(false);
    }
  });

  it("keep a hostile Host header out of the XML", () => {
    expect(sitemapXml('anh.chayla.app"><x')).not.toContain('"><x');
  });

  it("answer with the right type and vary by host", async () => {
    const response = crawlFileResponse(
      new Request("https://anh.chayla.app/sitemap.xml", { headers: { host: "anh.chayla.app" } }),
      "sitemap",
    );
    expect(response.headers.get("content-type")).toContain("application/xml");
    expect(response.headers.get("vary")).toBe("Host");
    expect(await response.text()).toContain("https://anh.chayla.app/privacy");
  });
});
