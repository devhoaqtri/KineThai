/**
 * Admin server functions for anonymous word reports filed from the feed.
 *
 * Reports are grouped by word within a deck, because that is the unit an admin fixes: ten
 * readers tapping "meaning is wrong" on one card is one problem, not ten. Word ids are only
 * unique within a deck, so the same id in two languages is two groups.
 *
 * Exports: listWordReportGroups, updateWordReports, WordReportGroup, WordReportOverview
 * Depends on: zod, admin gates, vocabulary catalog and word-report store (both lazy)
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { VocabularyWord as Word } from "@/features/vocabulary/lib/schema";
import type { TargetLocale } from "@/features/vocabulary/lib/target-language";
import {
  byReportPriority,
  isSevereReason,
  type ReportReasonId,
  type ReportStage,
  type WordReportStatus,
} from "@/features/vocabulary/lib/word-report";
import { requireAdminAccess } from "../lib/admin-access";
import { requireAdminContext } from "../lib/require-admin";

export type WordReportGroup = {
  locale: TargetLocale;
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
    const { catalogFor } = await import("@/features/vocabulary/api/catalog.server");
    const reports = await listWordReports();

    const byWord = new Map<string, typeof reports>();
    for (const report of reports) {
      const key = `${report.locale}:${report.wordId}`;
      byWord.set(key, [...(byWord.get(key) ?? []), report]);
    }
    const decks = new Map<TargetLocale, Map<string, Word>>();
    const deckWords = (locale: TargetLocale) => {
      let words = decks.get(locale);
      if (!words) {
        words = new Map(catalogFor(locale).words.map((word) => [word.id, word]));
        decks.set(locale, words);
      }
      return words;
    };
    const groups: WordReportGroup[] = [...byWord.values()].map((items) => {
      const { locale, wordId } = items[0]!;
      const open = items.filter((item) => item.status === "new");
      const resolved = items.filter((item) => item.status === "resolved");
      const entry = deckWords(locale).get(wordId);
      return {
        locale,
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
