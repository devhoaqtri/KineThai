import { describe, expect, it } from "vitest";
import { HSTS_VALUE, httpsRedirect, withSecurityHeaders } from "../https";

const request = (url: string, headers: Record<string, string> = {}) =>
  new Request(url, { headers });

describe("httpsRedirect", () => {
  it("sends a request the edge says came over http to https, keeping path and query", () => {
    const response = httpsRedirect(
      request("http://anh.chayla.app/w/QJR?x=1", { "x-forwarded-proto": "http" }),
    );
    expect(response?.status).toBe(308);
    expect(response?.headers.get("location")).toBe("https://anh.chayla.app/w/QJR?x=1");
  });

  it("reads Cloudflare's cf-visitor too", () => {
    const response = httpsRedirect(
      request("http://anh.chayla.app/", { "cf-visitor": '{"scheme":"http"}' }),
    );
    expect(response?.status).toBe(308);
  });

  it("never redirects without a header saying http, so a quiet proxy cannot loop", () => {
    expect(httpsRedirect(request("http://anh.chayla.app/"))).toBeNull();
    expect(
      httpsRedirect(request("http://anh.chayla.app/", { "x-forwarded-proto": "https" })),
    ).toBeNull();
  });

  it("leaves local hosts alone", () => {
    expect(
      httpsRedirect(request("http://localhost:5195/", { "x-forwarded-proto": "http" })),
    ).toBeNull();
  });
});

describe("withSecurityHeaders", () => {
  it("adds HSTS, nosniff and a referrer policy to a public response", () => {
    const response = withSecurityHeaders(
      request("https://anh.chayla.app/feed"),
      new Response("ok"),
    );
    expect(response.headers.get("strict-transport-security")).toBe(HSTS_VALUE);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
  });

  it("keeps a header a handler already chose, and copies a response whose headers are frozen", async () => {
    const own = withSecurityHeaders(
      request("https://anh.chayla.app/"),
      new Response("ok", { headers: { "Referrer-Policy": "no-referrer" } }),
    );
    expect(own.headers.get("referrer-policy")).toBe("no-referrer");
    const frozen = Response.redirect("https://anh.chayla.app/feed", 302);
    const copied = withSecurityHeaders(request("https://anh.chayla.app/"), frozen);
    expect(copied.status).toBe(302);
    expect(copied.headers.get("strict-transport-security")).toBe(HSTS_VALUE);
  });

  it("leaves local responses alone", () => {
    const response = withSecurityHeaders(request("http://localhost:5195/"), new Response("ok"));
    expect(response.headers.get("strict-transport-security")).toBeNull();
  });
});
