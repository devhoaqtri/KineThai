import { afterEach, describe, expect, it } from "vitest";
import { resetRateLimits } from "../rate-limit";
import { sharePageGuard } from "../share-page-guard";

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
  return sharePageGuard(new Request(`https://${host}${path}`, { headers }));
}

describe("sharePageGuard", () => {
  afterEach(() => resetRateLimits());

  it("leaves every other page alone", () => {
    expect(visit("/", { agent: "curl/8.0" })).toBeNull();
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
    expect(answer?.headers.get("location")).toBe("https://anh.chayla.app/");
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
    for (let i = 0; i < 30; i++) expect(visit("/w/K7F")).toBeNull();
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
