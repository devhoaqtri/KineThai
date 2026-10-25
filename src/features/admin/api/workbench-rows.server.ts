/**
 * Builds the rows the workbench shows: authoring records joined to reader reports
 * and compared against the published catalog.
 *
 * Both the read and the write server functions need this view, so it lives apart from
 * either. Report tallies are cached for a few seconds because in a deployed
 * environment they come from Supabase, and a facet recount must not mean a round trip
 * per keystroke.
 *
 * Exports: buildWorkbenchRows, publishedCatalogWords, invalidateReportTallies
 * Depends on: node:fs/promises, workbench store, word-report store, catalog.server
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { readWorkbench } from "@/features/vocabulary/api/workbench-store.server";
import { publishedFingerprint } from "@/features/vocabulary/lib/workbench";
import { byReportPriority } from "@/features/vocabulary/lib/word-report";
import type { WorkbenchRow } from "../lib/workbench-filter";

const CATALOG_PATH = resolve(process.cwd(), "src/features/vocabulary/data/catalog.json");

type PublishedWord = {
  id: string;
  word: string;
  defVi: string;
  leadVi?: string;
  anticipateVi?: string;
  pos?: string;
  ipa?: string;
  level?: string;
  topic?: string;
  topics?: string[];
  exams?: string[];
  emphasis?: string[];
  usage?: { en: string; vi?: string }[];
};

/**
 * The words readers are currently served.
 *
 * Read from disk so a publish is reflected immediately in development; the bundled
 * copy is the fallback for a deployment, where there is no catalog file on disk.
 * @returns Published words by id
 */
export async function publishedCatalogWords(): Promise<Map<string, PublishedWord>> {
  try {
    const parsed = JSON.parse(await readFile(CATALOG_PATH, "utf8")) as { words?: PublishedWord[] };
    return new Map((parsed.words ?? []).map((word) => [word.id, word]));
  } catch {
    const { catalog } = await import("@/features/vocabulary/api/catalog.server");
    return new Map((catalog.words as unknown as PublishedWord[]).map((word) => [word.id, word]));
  }
}

type Tally = { open: number; reasons: { id: string; count: number }[] };

const TALLY_TTL_MS = 5_000;
let tallyCache: { at: number; byWord: Map<string, Tally> } | null = null;

/** Drop the cached report tallies, after resolving or reopening reports. */
export function invalidateReportTallies(): void {
  tallyCache = null;
}

async function reportTallies(): Promise<Map<string, Tally>> {
  if (tallyCache && Date.now() - tallyCache.at < TALLY_TTL_MS) return tallyCache.byWord;
  const { listWordReports } = await import("@/features/vocabulary/api/word-report-store.server");
  const byWord = new Map<string, Tally>();
  for (const report of await listWordReports()) {
    if (report.status !== "new") continue;
    const tally = byWord.get(report.wordId) ?? { open: 0, reasons: [] };
    tally.open += 1;
    for (const reason of report.reasons) {
      const found = tally.reasons.find((entry) => entry.id === reason);
      if (found) found.count += 1;
      else tally.reasons.push({ id: reason, count: 1 });
    }
    byWord.set(report.wordId, tally);
  }
  for (const tally of byWord.values()) tally.reasons.sort(byReportPriority);
  tallyCache = { at: Date.now(), byWord };
  return byWord;
}

/**
 * Every authoring record with its reports and publish state attached.
 * @returns Rows ready to filter, facet and sort
 */
export async function buildWorkbenchRows(): Promise<WorkbenchRow[]> {
  const [words, published, tallies] = await Promise.all([
    readWorkbench(),
    publishedCatalogWords(),
    reportTallies(),
  ]);
  return words.map((word) => {
    const live = published.get(word.id);
    const tally = tallies.get(word.id);
    return {
      ...word,
      openReports: tally?.open ?? 0,
      topReasons: tally?.reasons.slice(0, 3) ?? [],
      published: !!live,
      // Only a published word can have drifted; an unpublished one is simply not out yet.
      drifted: !!live && publishedFingerprint(live) !== publishedFingerprint(word),
    };
  });
}
