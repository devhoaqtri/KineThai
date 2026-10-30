import { describe, expect, it } from "vitest";
import { isBrowserRequest, isLocalRequest } from "../bot-gate";

const HEADLESS =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 HeadlessChrome/140.0.0.0 Safari/537.36";

function request(url: string, agent = HEADLESS): Request {
  return new Request(url, { headers: { "user-agent": agent } });
}

describe("isLocalRequest", () => {
  it.each([
    "http://localhost:5195/api/public/word",
    "http://hoa.localhost:5195/api/public/word",
    "http://duc.localhost/api/public/word",
    "http://127.0.0.1:8080/api/public/word",
    "http://[::1]:8080/api/public/word",
  ])("treats %s as local", (url) => expect(isLocalRequest(request(url))).toBe(true));

  it.each([
    "https://anh.chayla.app/api/public/word",
    "https://localhost.chayla.app/api/public/word",
    "https://hoa.localhost.evil.example/api/public/word",
    "https://a.b.localhost/api/public/word",
  ])("does not treat %s as local", (url) => expect(isLocalRequest(request(url))).toBe(false));
});

describe("isBrowserRequest", () => {
  it("lets a headless recorder through on a language subdomain of localhost", () => {
    expect(isBrowserRequest(request("http://hoa.localhost:5195/api/public/word"))).toBe(true);
  });

  it("still refuses a headless browser on the public site", () => {
    expect(isBrowserRequest(request("https://hoa.chayla.app/api/public/word"))).toBe(false);
  });
});
