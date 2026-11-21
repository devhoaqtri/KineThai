import { describe, expect, it } from "vitest";
import { ACCOUNT_FEATURES_ENABLED, isAllowedPage } from "../reader-routes";

describe("isAllowedPage", () => {
  it("serves the reader's pages and the PIN-gated admin", () => {
    for (const path of [
      "/",
      "/feed",
      "/feed/",
      "/feed/about",
      "/feed/saved",
      "/feed/library",
      "/w/QJR",
      "/privacy",
      "/terms",
      "/robots.txt",
      "/sitemap.xml",
      "/admin",
      "/admin/reports",
      "/admin-access-denied",
    ]) {
      expect(isAllowedPage(path), path).toBe(true);
    }
  });

  it("answers 404 for sign-in and the social network while they are switched off", () => {
    expect(ACCOUNT_FEATURES_ENABLED).toBe(false);
    for (const path of [
      "/auth",
      "/community",
      "/create",
      "/discover",
      "/me",
      "/settings",
      "/about",
      "/notifications",
      "/edit-profile",
      "/u/someone",
      "/p/123",
      "/store",
    ]) {
      expect(isAllowedPage(path), path).toBe(false);
      expect(isAllowedPage(path, true), `${path} (dev)`).toBe(false);
    }
  });

  it("keeps local tools to npm run dev", () => {
    for (const path of [
      "/burst-lab",
      "/badge-lab",
      "/tiktok-lab",
      "/showcase",
      "/posting",
      "/export/QJR",
      "/carousel/QJR",
    ]) {
      expect(isAllowedPage(path), path).toBe(false);
      expect(isAllowedPage(path, true), `${path} (dev)`).toBe(true);
    }
  });

  it("refuses anything else, including look-alike paths", () => {
    for (const path of ["/feedx", "/feed/other", "/w", "/w/a/b", "/privacy/x", "/random"]) {
      expect(isAllowedPage(path), path).toBe(false);
    }
  });
});
