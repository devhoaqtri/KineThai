import { afterEach, describe, expect, it } from "vitest";
import {
  FEED_PAGE_BUDGET,
  SHARE_PAGE_BUDGET,
  resetRateLimits,
  type RateBudget,
} from "../rate-limit";
import { pageGuard } from "../page-guard";

/** A budget's per-minute cap. */
const perMinute = (budget: RateBudget) =>
  (Array.isArray(budget) ? budget : [budget]).find((window) => window.windowMs === 60_000)!.limit;

const SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const ZALO_IN_APP =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Zalo iOS/24.10";
const IMESSAGE_PREVIEW =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_1) AppleWebKit/601.2.4 (KHTML, like Gecko) Version/9.0.1 Safari/601.2.4 facebookexternalhit/1.1 Facebot Twitterbot/1.0";

function visit(
  path: string,
  { agent = SAFARI, ip = "203.0.113.7", host = "anh.chayla.app", language = "vi-VN" } = {},
) {
  const headers = new Headers({ host, "user-agent": agent, "cf-connecting-ip": ip });
  if (language) headers.set("accept-language", language);
  return pageGuard(new Request(`https://${host}${path}`, { headers }));
}

describe("pageGuard: share link", () => {
  afterEach(() => resetRateLimits());

  it("leaves every other page alone", () => {
    expect(visit("/feed/saved", { agent: "curl/8.0" })).toBeNull();
    expect(visit("/api/public/word?code=K7F", { agent: "curl/8.0" })).toBeNull();
    expect(visit("/w/K7F/extra")).toBeNull();
  });

  it("renders a share page for a person's browser, in-app ones included", () => {
    expect(visit("/w/K7F")).toBeNull();
    expect(visit("/w/k7f/", { agent: ZALO_IN_APP })).toBeNull();
  });

  it("sends a path that cannot be a code to the feed without rendering", () => {
    const answer = visit("/w/not-a-code");
    expect(answer?.status).toBe(302);
    expect(answer?.headers.get("location")).toBe("https://anh.chayla.app/feed");
    expect(visit("/w/%E0%A4%A")?.status).toBe(302);
  });

  it("gives automated agents only the site's head, in the address's language", async () => {
    for (const agent of [IMESSAGE_PREVIEW, "facebookexternalhit/1.1", "python-requests/2.32"]) {
      const answer = visit("/w/K7F", { agent, host: "hoa.chayla.app" });
      expect(answer?.status).toBe(200);
      const body = await answer!.text();
      expect(body).toContain("<title>hoa.chayLá</title>");
      expect(body).toContain('<meta property="og:title" content="hoa.chayLá" />');
      expect(body).toContain("<body></body>");
    }
    // A browser agent with no Accept-Language is not a browser on a navigation.
    expect(visit("/w/K7F", { language: "" })?.status).toBe(200);
  });

  it("stops one address past its budget, and only that address", () => {
    for (let i = 0; i < perMinute(SHARE_PAGE_BUDGET); i++) expect(visit("/w/K7F")).toBeNull();
    const refused = visit("/w/K7F");
    expect(refused?.status).toBe(429);
    expect(Number(refused?.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(visit("/w/K7F", { ip: "198.51.100.2" })).toBeNull();
  });

  it("never limits the local dev server", () => {
    for (let i = 0; i < 40; i++) {
      expect(visit("/w/K7F", { host: "hoa.localhost:8080", agent: "curl/8.0" })).toBeNull();
    }
  });
});

describe("pageGuard: home feed", () => {
  afterEach(() => resetRateLimits());

  it("renders the feed for a person's browser", () => {
    expect(visit("/")).toBeNull();
    expect(visit("/feed")).toBeNull();
    expect(visit("/feed/", { agent: ZALO_IN_APP })).toBeNull();
  });

  it("gives automated agents only the site's head, without a noindex", async () => {
    for (const path of ["/", "/feed", "/feed/"]) {
      const answer = visit(path, { agent: "curl/8.0", host: "anh.chayla.app" });
      expect(answer?.status).toBe(200);
      expect(answer?.headers.get("x-robots-tag")).toBeNull();
      expect(await answer!.text()).toContain("<title>anh.chayLá</title>");
    }
    expect(visit("/w/K7F", { agent: "curl/8.0" })?.headers.get("x-robots-tag")).toBe(
      "noindex, nofollow",
    );
  });

  it("charges /feed, not the redirect at /, and apart from share links", () => {
    const feedMinute = perMinute(FEED_PAGE_BUDGET);
    for (let i = 0; i < feedMinute + 40; i++) expect(visit("/")).toBeNull();
    for (let i = 0; i < feedMinute; i++) expect(visit(i % 2 ? "/feed" : "/feed/")).toBeNull();
    const refused = visit("/feed");
    expect(refused?.status).toBe(429);
    expect(Number(refused?.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(visit("/w/K7F")).toBeNull();
    expect(visit("/feed", { ip: "198.51.100.2" })).toBeNull();
  });
});
