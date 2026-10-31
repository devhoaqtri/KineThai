import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WordReportSignal } from "../../lib/word-block";

const stored = vi.hoisted(() => ({ reports: [] as Record<string, unknown>[] }));
const signals = vi.hoisted(() => ({ list: [] as WordReportSignal[] }));

vi.mock("../word-report-store.server", () => ({
  addWordReport: async (report: Record<string, unknown>) => {
    stored.reports.push(report);
    return "id";
  },
  listWordReportSignals: async () => signals.list,
}));

import { catalogFor } from "../../lib/catalog-source";
import { vocabularyResponse } from "../endpoint.server";
import { invalidateBlockedWordIds, refreshBlockedWordIds } from "../word-block.server";
import { wordReportPostResponse } from "../word-report.server";
import { servedCatalogFor } from "../catalog.server";

const file = (host: string, id: string) =>
  wordReportPostResponse(
    new Request("http://localhost/api/public/word-report", {
      method: "POST",
      headers: { host, "cf-connecting-ip": "198.51.100.1" },
      body: JSON.stringify({ id, reasons: ["typo"] }),
    }),
  );

const hide = async (locale: string, wordId: string) => {
  signals.list = ["a", "b", "c"].map((reporter) => ({
    locale,
    wordId,
    reporter,
    severe: false,
    status: "new",
  }));
  invalidateBlockedWordIds();
  await refreshBlockedWordIds();
};

describe("word reports by language", () => {
  beforeEach(async () => {
    stored.reports = [];
    signals.list = [];
    invalidateBlockedWordIds();
    await refreshBlockedWordIds();
  });

  it.each([
    ["hoa.chayla.app", "zh"],
    ["phap.chayla.app", "fr"],
    ["duc.chayla.app", "de"],
    ["tbn.chayla.app", "es"],
    ["anh.chayla.app", "en"],
  ] as const)("accepts a word from the deck %s serves", async (host, locale) => {
    const word = catalogFor(locale).words[0]!;
    const response = await file(host, word.id);
    expect(response.status).toBe(200);
    expect(stored.reports[0]).toMatchObject({ locale, wordId: word.id, word: word.word });
  });

  it("files a language with no deck of its own under the English deck it reads", async () => {
    await file("han.chayla.app", catalogFor("en").words[0]!.id);
    expect(stored.reports[0]).toMatchObject({ locale: "en" });
  });

  it("refuses a word this host's deck does not hold", async () => {
    const response = await file("anh.chayla.app", catalogFor("de").words[0]!.id);
    expect(response.status).toBe(404);
    expect(stored.reports).toEqual([]);
  });

  it("hides a word only from the language that reported it", async () => {
    const shared = catalogFor("de").words.find((word) =>
      catalogFor("fr").words.some((other) => other.id === word.id),
    )!;
    await hide("de", shared.id);
    expect(servedCatalogFor("de").words.some((word) => word.id === shared.id)).toBe(false);
    expect(servedCatalogFor("fr").words.some((word) => word.id === shared.id)).toBe(true);
    expect(servedCatalogFor("fr").revision).toBe(catalogFor("fr").revision);
  });

  it("keeps serving pages while a word is hidden", async () => {
    await hide("en", catalogFor("en").words[0]!.id);
    const get = (query: string) =>
      vocabularyResponse(new Request(`http://localhost/api/public/vocabulary?${query}`));
    const first = await get("seed=abcdefgh12");
    const page = await first.json();
    const second = await get(
      `seed=abcdefgh12&position=${page.nextPosition}&revision=${page.revision}&token=${page.cursor}`,
    );
    expect(second.status).toBe(200);
  });
});
