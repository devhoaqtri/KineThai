/**
 * Admin server functions for anonymous word reports filed from the feed.
 *
 * Reports are grouped by word, because that is the unit an admin fixes: ten readers
 * tapping "meaning is wrong" on one card is one problem, not ten.
 *
 * Exports: listWordReportGroups, updateWordReports, WordReportGroup, WordReportOverview
 * Depends on: fs/promises (catalog), zod, admin gates, vocabulary word-report store
 */

import { createServerFn } from "@tanstack/react-start";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import {
  byReportPriority,
  isSevereReason,
  type ReportReasonId,
  type ReportStage,
  type WordReportStatus,
} from "@/features/vocabulary/lib/word-report";
import { requireAdminAccess } from "../lib/admin-access";
import { requireAdminContext } from "../lib/require-admin";

const CATALOG_PATH = resolve(process.cwd(), "src/features/vocabulary/data/catalog.json");

export type WordReportGroup = {
  wordId: string;
  word: string;
  /** Current catalog text, so the report can be judged without leaving the page. */
  entry: {
    defVi: string;
    leadVi: string;
    anticipateVi: string;
    usageEn: string;
    ipa: string;
    pos: string;
    level: string | null;
  } | null;
  openCount: number;
  /** Open reports naming a severe reason ("nhạy cảm", "không ổn"): these lead the queue. */
  severeCount: number;
  resolvedCount: number;
  /** How many OPEN reports named each reason: severe ones first, then most-named. */
  reasons: { id: ReportReasonId; count: number }[];
  /** How many OPEN reports were filed from each page of the card. */
  stages: { id: ReportStage; count: number }[];
  latestAt: string;
  openIds: string[];
  resolvedIds: string[];
};

export type WordReportOverview = {
  /** Where reports are being read from in this environment. */
  store: "supabase" | "file";
  openTotal: number;
  groups: WordReportGroup[];
};

type CatalogWord = {
  id: string;
  word: string;
  defVi?: string;
  leadVi?: string;
  anticipateVi?: string;
  ipa?: string;
  pos?: string;
  level?: string;
  usage?: Array<{ en: string; vi: string }>;
};

async function readCatalogWords(): Promise<Map<string, CatalogWord>> {
  try {
    const parsed = JSON.parse(await readFile(CATALOG_PATH, "utf-8")) as { words?: CatalogWord[] };
    return new Map((parsed.words ?? []).map((word) => [word.id, word]));
  } catch {
    // A deployed build has no catalog file on disk; groups simply show no entry text.
    return new Map();
  }
}

function tally<T extends string>(values: T[]): { id: T; count: number }[] {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].map(([id, count]) => ({ id, count })).sort(byReportPriority);
}

/**
 * Every reported word, with its open reports summarised. Words with open reports come
 * first: those flagged with a severe reason at the top, then the most-reported; fully
 * resolved words follow.
 */
export const listWordReportGroups = createServerFn({ method: "GET" })
  .middleware([requireAdminAccess])
  .handler(async ({ context }): Promise<WordReportOverview> => {
    await requireAdminContext({ authUserId: context.userId });
    const { listWordReports, wordReportStoreKind } =
      await import("@/features/vocabulary/api/word-report-store.server");
    const [reports, words] = await Promise.all([listWordReports(), readCatalogWords()]);

    const byWord = new Map<string, typeof reports>();
    for (const report of reports) {
      byWord.set(report.wordId, [...(byWord.get(report.wordId) ?? []), report]);
    }
    const groups: WordReportGroup[] = [...byWord].map(([wordId, items]) => {
      const open = items.filter((item) => item.status === "new");
      const resolved = items.filter((item) => item.status === "resolved");
      const entry = words.get(wordId);
      return {
        wordId,
        word: entry?.word ?? items[0]?.word ?? wordId,
        entry: entry
          ? {
              defVi: entry.defVi ?? "",
              leadVi: entry.leadVi ?? "",
              anticipateVi: entry.anticipateVi ?? "",
              usageEn: entry.usage?.[0]?.en ?? "",
              ipa: entry.ipa ?? "",
              pos: entry.pos ?? "",
              level: entry.level ?? null,
            }
          : null,
        openCount: open.length,
        severeCount: open.filter((item) => item.reasons.some(isSevereReason)).length,
        resolvedCount: resolved.length,
        reasons: tally(open.flatMap((item) => item.reasons)),
        stages: tally(open.flatMap((item) => (item.stage ? [item.stage] : []))),
        latestAt: items.reduce(
          (latest, item) => (item.createdAt > latest ? item.createdAt : latest),
          "",
        ),
        openIds: open.map((item) => item.id),
        resolvedIds: resolved.map((item) => item.id),
      };
    });
    groups.sort(
      (a, b) =>
        Number(b.openCount > 0) - Number(a.openCount > 0) ||
        b.severeCount - a.severeCount ||
        b.openCount - a.openCount ||
        b.latestAt.localeCompare(a.latestAt),
    );
    return {
      store: wordReportStoreKind(),
      openTotal: groups.reduce((total, group) => total + group.openCount, 0),
      groups,
    };
  });

/** Resolve a word's open reports once it is fixed, or reopen them. */
export const updateWordReports = createServerFn({ method: "POST" })
  .middleware([requireAdminAccess])
  .inputValidator((input: unknown) =>
    z
      .object({
        ids: z.array(z.string().min(1).max(64)).min(1).max(2000),
        status: z.enum(["new", "resolved"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ changed: number }> => {
    const actor = await requireAdminContext({ authUserId: context.userId });
    const { setWordReportStatus } =
      await import("@/features/vocabulary/api/word-report-store.server");
    const changed = await setWordReportStatus(
      data.ids,
      data.status as WordReportStatus,
      actor.authUserId,
    );
    return { changed };
  });
