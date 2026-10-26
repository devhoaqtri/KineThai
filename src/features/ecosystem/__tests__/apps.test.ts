import { describe, expect, it } from "vitest";
import { ECOSYSTEM_APPS, ECOSYSTEM_MAX_APPS, type EcosystemApp } from "../data/apps";

const HEX = /^#[0-9a-fA-F]{6}$/;

describe("ecosystem app catalog", () => {
  it("stays within the drawer cap", () => expect(ECOSYSTEM_APPS.length).toBeLessThanOrEqual(ECOSYSTEM_MAX_APPS));
  it("is non-empty", () => expect(ECOSYSTEM_APPS.length).toBeGreaterThan(0));
  it("keeps stable unique ids", () => {
    const ids = ECOSYSTEM_APPS.map((app) => app.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("gives every app a short, displayable name", () => {
    for (const app of ECOSYSTEM_APPS) {
      expect(app.name.length).toBeGreaterThan(0);
      expect(app.name.length).toBeLessThanOrEqual(12);
    }
  });
  it("carries exactly two hex accent stops", () => {
    for (const app of ECOSYSTEM_APPS) {
      expect(app.accent).toHaveLength(2);
      expect(app.accent[0]).toMatch(HEX);
      expect(app.accent[1]).toMatch(HEX);
    }
  });
  it("points the url at the app's own subdomain", () => {
    for (const app of ECOSYSTEM_APPS) expect(new URL(app.url).hostname.startsWith(`${app.id}.`)).toBe(true);
  });
  it("uses a status the renderer understands", () => {
    for (const app of ECOSYSTEM_APPS) expect(["live", "soon"]).toContain(app.status);
  });
  it("pairs a single-locale record with every app", () => {
    for (const app of ECOSYSTEM_APPS) expect(typeof app.locale).toBe("string");
  });
  it("always offers at least one screenshot caption", () => {
    for (const app of ECOSYSTEM_APPS) expect(app.shots.length).toBeGreaterThan(0);
  });
  it("has a Vietnamese tagline and description", () => {
    for (const app of ECOSYSTEM_APPS) {
      expect(app.tagline.length).toBeGreaterThan(0);
      expect(app.description.length).toBeGreaterThan(0);
    }
  });
  it("exposes a numeric max", () => expect(ECOSYSTEM_MAX_APPS).toBeGreaterThan(0));
  it("uses a distinct locale per sibling", () => {
    const locales = ECOSYSTEM_APPS.map((app) => app.locale);
    expect(new Set(locales).size).toBe(locales.length);
  });
  it("includes at least one live sibling", () =>
    expect(ECOSYSTEM_APPS.some((app) => app.status === "live")).toBe(true));
});

describe("individual siblings", () => {
  const byId = (id: string): EcosystemApp | undefined => ECOSYSTEM_APPS.find((app) => app.id === id);
  it("includes the English sibling", () => expect(byId("anh")?.locale).toBe("en"));
  it("includes the Korean sibling", () => expect(byId("han")?.locale).toBe("ko"));
  it("marks the English sibling live", () => expect(byId("anh")?.status).toBe("live"));
});
