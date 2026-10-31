import { beforeEach, describe, expect, it, vi } from "vitest";

const stored = vi.hoisted(() => ({ reports: [] as Record<string, unknown>[] }));

vi.mock("../word-report-store.server", () => ({
  addWordReport: async (report: Record<string, unknown>) => {
    stored.reports.push(report);
    return "id";
  },
}));

import { catalogFor, deckLocaleFor } from "../../lib/catalog-source";
import type { TargetLocale } from "../../lib/target-language";
import { wordReportPostResponse } from "../word-report.server";

let caller = 0;
const file = (host: string, id: string, locale?: TargetLocale) =>
  wordReportPostResponse(
    new Request("http://localhost/api/public/word-report", {
      method: "POST",
      // A fresh address per report, so the per-caller limit never decides a test.
      headers: { host, "cf-connecting-ip": `198.51.100.${(caller += 1)}` },
      body: JSON.stringify({ id, locale, reasons: ["typo"] }),
    }),
  );

const firstId = (locale: TargetLocale) => catalogFor(locale).words[0]!.id;

describe("word reports by deck", () => {
  beforeEach(() => {
    stored.reports = [];
  });

  it.each(["ja", "zh", "en"] as const)(
    "accepts a %s word the card names as its deck",
    async (locale) => {
      const id = firstId(locale);
      const response = await file("localhost:5195", id, locale);
      expect(response.status).toBe(200);
      expect(stored.reports[0]).toMatchObject({ locale, wordId: id });
    },
  );

  it("falls back to the host's deck when the card names none", async () => {
    const id = firstId("ja");
    const response = await file("localhost:5195", id);
    expect(response.status).toBe(200);
    expect(stored.reports[0]).toMatchObject({ locale: "ja", wordId: id });
  });

  it("uses the card's deck over the host's, for a reader on another language's address", async () => {
    const id = firstId("ja");
    const response = await file("hoa.chayla.app", id, "ja");
    expect(response.status).toBe(200);
    expect(stored.reports[0]).toMatchObject({ locale: "ja", wordId: id });
  });

  it("refuses a word that is not in the named deck", async () => {
    const response = await file("localhost:5195", firstId("ja"), "zh");
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: "UNKNOWN_WORD" });
    expect(stored.reports).toEqual([]);
  });

  it("refuses a deck that does not exist", async () => {
    const response = await wordReportPostResponse(
      new Request("http://localhost/api/public/word-report", {
        method: "POST",
        body: JSON.stringify({ id: "a", locale: "xx", reasons: ["typo"] }),
      }),
    );
    expect(response.status).toBe(400);
  });
});

describe("deckLocaleFor", () => {
  it("keeps a language that has packs", () => {
    expect(deckLocaleFor("ja")).toBe("ja");
    expect(deckLocaleFor("zh")).toBe("zh");
  });
  it("sends a language with no deck to English", () => {
    expect(deckLocaleFor("ko")).toBe("en");
    expect(deckLocaleFor("de")).toBe("en");
  });
});
