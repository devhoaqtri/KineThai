import { describe, expect, it } from "vitest";
import { adminKeys } from "../keys";

describe("adminKeys", () => {
  it("roots every key under 'admin'", () => {
    expect(adminKeys.all).toEqual(["admin"]);
    expect(adminKeys.rollups("a", "b", "live")[0]).toBe("admin");
    expect(adminKeys.health("demo")[0]).toBe("admin");
  });

  it("builds a rollups key from range + mode", () => {
    expect(adminKeys.rollups("2026-01-01", "2026-01-31", "demo")).toEqual([
      "admin",
      "rollups",
      "2026-01-01",
      "2026-01-31",
      "demo",
    ]);
  });

  it("builds an events key from range + mode", () => {
    expect(adminKeys.events("from", "to", "live")).toEqual([
      "admin",
      "events",
      "from",
      "to",
      "live",
    ]);
  });

  it("keeps health and healthHistory distinct", () => {
    expect(adminKeys.health("demo")).toEqual(["admin", "health", "demo"]);
    expect(adminKeys.healthHistory("demo")).toEqual(["admin", "healthHistory", "demo"]);
  });

  it("defaults the errors status segment to 'all'", () => {
    expect(adminKeys.errors("from", "to", "demo")).toEqual([
      "admin",
      "errors",
      "from",
      "to",
      "demo",
      "all",
    ]);
  });

  it("keeps an explicit errors status", () => {
    expect(adminKeys.errors("from", "to", "demo", "resolved")).toContain("resolved");
  });

  it("separates resolved from new error queues", () => {
    const resolved = adminKeys.errors("f", "t", "live", "resolved");
    const fresh = adminKeys.errors("f", "t", "live", "new");
    expect(resolved).not.toEqual(fresh);
  });

  it("keys wordReports without extra segments", () => {
    expect(adminKeys.wordReports()).toEqual(["admin", "word-reports"]);
  });

  it("embeds the workbench query string", () => {
    expect(adminKeys.workbench("levels=b1")).toEqual(["admin", "workbench", "levels=b1"]);
  });

  it("distinguishes workbench views from the workbench itself", () => {
    expect(adminKeys.workbenchViews()).toEqual(["admin", "workbench-views"]);
    expect(adminKeys.workbenchViews()).not.toEqual(adminKeys.workbench(""));
  });

  it("builds static keys for templates, palettes and llm settings", () => {
    expect(adminKeys.templates()).toEqual(["admin", "templates"]);
    expect(adminKeys.palettes()).toEqual(["admin", "palettes"]);
    expect(adminKeys.llmSettings()).toEqual(["admin", "llm-settings"]);
  });

  it("builds a session-health key from range + mode", () => {
    expect(adminKeys.sessionHealth("from", "to", "demo")).toEqual([
      "admin",
      "session-health",
      "from",
      "to",
      "demo",
    ]);
  });

  it("produces different keys for different modes", () => {
    expect(adminKeys.health("demo")).not.toEqual(adminKeys.health("live"));
  });

  it("produces different keys for different ranges", () => {
    expect(adminKeys.rollups("a", "b", "live")).not.toEqual(adminKeys.rollups("c", "d", "live"));
  });

  it("returns immutable tuple-shaped arrays", () => {
    // as const keeps them readonly tuples; assert structural stability.
    expect(Array.isArray(adminKeys.all)).toBe(true);
    expect(adminKeys.events("f", "t", "m")).toHaveLength(5);
  });
});
