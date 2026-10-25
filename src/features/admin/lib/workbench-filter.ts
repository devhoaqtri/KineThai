/**
 * Pure multi-axis query over workbench rows: filtering, faceting, sorting, paging.
 *
 * The axes AND together while values inside one axis OR, which is what makes
 * "B2 or C1, tagged TOEIC, with two or more open reports" expressible. Facet counts
 * for an axis deliberately ignore that axis's own selection, so picking one level
 * still shows how many words the other levels hold.
 *
 * Exports: WorkbenchSort, WorkbenchQuery, WorkbenchRow, WorkbenchFacets,
 *   EMPTY_QUERY, filterRows, countFacets, sortRows, pageOf
 * Depends on: @/features/vocabulary/lib/schema, ./workbench (types only)
 */

import { LEVELS } from "@/features/vocabulary/lib/schema";
import { isSevereReason } from "@/features/vocabulary/lib/word-report";
import type { WorkbenchWord } from "@/features/vocabulary/lib/workbench";

export type WorkbenchSort = "word" | "level" | "reports" | "updated" | "status";

export type WorkbenchQuery = {
  search: string;
  levels: string[];
  topics: string[];
  exams: string[];
  statuses: string[];
  /** Keep only words carrying at least this many open reader reports. */
  minOpenReports: number;
  /** true = edited since publish, false = in sync, null = don't care. */
  drifted: boolean | null;
  sort: WorkbenchSort;
  dir: "asc" | "desc";
  page: number;
  pageSize: number;
};

/** An authoring record plus everything derived at read time. */
export type WorkbenchRow = WorkbenchWord & {
  openReports: number;
  /** Open-report reasons for this word: severe ones first, then most-named. */
  topReasons: { id: string; count: number }[];
  /** Whether the published catalog carries this word at all. */
  published: boolean;
  /** Whether the authoring text has moved on from what was published. */
  drifted: boolean;
};

export type WorkbenchFacets = {
  levels: Record<string, number>;
  topics: Record<string, number>;
  exams: Record<string, number>;
  statuses: Record<string, number>;
};

export const EMPTY_QUERY: WorkbenchQuery = {
  search: "",
  levels: [],
  topics: [],
  exams: [],
  statuses: [],
  minOpenReports: 0,
  drifted: null,
  sort: "word",
  dir: "asc",
  page: 0,
  pageSize: 50,
};

/** Which axis to leave unapplied, so that axis's own facet counts stay meaningful. */
type Axis = "levels" | "topics" | "exams" | "statuses";

function matchesSearch(row: WorkbenchRow, needle: string): boolean {
  if (!needle) return true;
  const q = needle.toLowerCase();
  return (
    row.word.toLowerCase().includes(q) ||
    row.id.toLowerCase().includes(q) ||
    row.defVi.toLowerCase().includes(q) ||
    row.leadVi.toLowerCase().includes(q) ||
    row.anticipateVi.toLowerCase().includes(q)
  );
}

function matchesAxes(row: WorkbenchRow, query: WorkbenchQuery, skip?: Axis): boolean {
  if (skip !== "levels" && query.levels.length && !query.levels.includes(row.level ?? "")) {
    return false;
  }
  if (skip !== "topics" && query.topics.length) {
    if (!row.topics.some((topic) => query.topics.includes(topic))) return false;
  }
  if (skip !== "exams" && query.exams.length) {
    if (!row.exams.some((exam) => query.exams.includes(exam))) return false;
  }
  if (skip !== "statuses" && query.statuses.length && !query.statuses.includes(row.status)) {
    return false;
  }
  return true;
}

function matchesDerived(row: WorkbenchRow, query: WorkbenchQuery): boolean {
  if (row.openReports < query.minOpenReports) return false;
  if (query.drifted !== null && row.drifted !== query.drifted) return false;
  return true;
}

/**
 * Apply every axis of a query.
 * @param rows - all authoring rows
 * @param query - the active query
 * @param skip - an axis to leave unapplied, used when counting that axis's facets
 * @returns The matching rows, order untouched
 * @pure true
 */
export function filterRows(
  rows: readonly WorkbenchRow[],
  query: WorkbenchQuery,
  skip?: Axis,
): WorkbenchRow[] {
  return rows.filter(
    (row) =>
      matchesSearch(row, query.search) &&
      matchesAxes(row, query, skip) &&
      matchesDerived(row, query),
  );
}

function tally(values: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}

/**
 * Count how many words each axis value would match.
 * @param rows - all authoring rows
 * @param query - the active query
 * @returns Per-axis value counts
 * @pure true
 */
export function countFacets(rows: readonly WorkbenchRow[], query: WorkbenchQuery): WorkbenchFacets {
  return {
    levels: tally(
      filterRows(rows, query, "levels")
        .map((row) => row.level ?? "")
        .filter(Boolean),
    ),
    topics: tally(filterRows(rows, query, "topics").flatMap((row) => row.topics)),
    exams: tally(filterRows(rows, query, "exams").flatMap((row) => row.exams)),
    statuses: tally(filterRows(rows, query, "statuses").map((row) => row.status)),
  };
}

const LEVEL_ORDER = new Map(LEVELS.map((level, index) => [level as string, index]));
const STATUS_ORDER = new Map(
  ["draft", "needs-review", "approved", "rejected"].map((status, index) => [status, index]),
);

function compare(a: WorkbenchRow, b: WorkbenchRow, sort: WorkbenchSort): number {
  switch (sort) {
    case "word":
      return a.word.localeCompare(b.word);
    // An unlevelled word sorts after every levelled one rather than before "A1".
    case "level":
      return (
        (LEVEL_ORDER.get(a.level ?? "") ?? LEVELS.length) -
        (LEVEL_ORDER.get(b.level ?? "") ?? LEVELS.length)
      );
    // A word flagged "nhạy cảm" or "không ổn" outranks any count of ordinary reports.
    case "reports":
      return (
        Number(isSevereReason(a.topReasons[0]?.id ?? "")) -
          Number(isSevereReason(b.topReasons[0]?.id ?? "")) || a.openReports - b.openReports
      );
    case "updated":
      return a.updatedAt.localeCompare(b.updatedAt);
    case "status":
      return (STATUS_ORDER.get(a.status) ?? 0) - (STATUS_ORDER.get(b.status) ?? 0);
  }
}

/**
 * Order rows, breaking every tie on the word so paging is stable.
 * @param rows - rows to order (not mutated)
 * @param sort - sort key
 * @param dir - direction
 * @returns A new ordered array
 * @pure true
 */
export function sortRows(
  rows: readonly WorkbenchRow[],
  sort: WorkbenchSort,
  dir: "asc" | "desc",
): WorkbenchRow[] {
  const sign = dir === "desc" ? -1 : 1;
  return [...rows].sort(
    (a, b) =>
      compare(a, b, sort) * sign || a.word.localeCompare(b.word) || a.id.localeCompare(b.id),
  );
}

/**
 * Clamp a page request to what the result set actually holds.
 * @param rows - the ordered result set
 * @param page - zero-based page index
 * @param pageSize - rows per page
 * @returns The slice plus the page index actually used
 * @pure true
 */
export function pageOf<T>(
  rows: readonly T[],
  page: number,
  pageSize: number,
): { slice: T[]; page: number; pageCount: number } {
  const size = Math.max(1, pageSize);
  const pageCount = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(Math.max(0, page), pageCount - 1);
  return { slice: rows.slice(current * size, (current + 1) * size), page: current, pageCount };
}
