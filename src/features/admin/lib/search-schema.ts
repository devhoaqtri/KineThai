/**
 * Shared admin search params validator.
 *
 * The workbench keeps its whole query here rather than in component state, so a
 * filtered queue is a link: it survives a reload, works with the back button, and a
 * saved queue is simply a stored copy of these parameters.
 *
 * Exports: adminSearchSchema, AdminSearch, WORKBENCH_PARAM_KEYS
 * Depends on: zod
 */

import { z } from "zod";
import { TARGET_LOCALES, type TargetLocale } from "@/features/vocabulary/lib/target-language";

/** Comma-separated multi-select axis, kept as a string so the URL stays readable. */
const axis = z.string().max(240).optional();

export const adminSearchSchema = z.object({
  range: z.enum(["24h", "7d", "30d", "custom"]).optional().default("30d"),
  from: z.string().optional(),
  to: z.string().optional(),
  app: z.string().optional().default("kinetic-canvas"),
  /** Pre-filled search text, e.g. the word a report links to on the Vocabulary page. */
  q: z.string().max(64).optional(),
  // ── Vocabulary workbench query ──
  levels: axis,
  topics: axis,
  exams: axis,
  statuses: axis,
  /** Minimum open reader reports a word must carry. */
  reports: z.coerce.number().int().min(0).max(1000).optional(),
  /** "yes" = edited since publish, "no" = in sync with the catalog. */
  drift: z.enum(["yes", "no"]).optional(),
  sort: z.enum(["word", "level", "reports", "updated", "status"]).optional(),
  dir: z.enum(["asc", "desc"]).optional(),
  page: z.coerce.number().int().min(0).max(100_000).optional(),
  size: z.coerce.number().int().min(10).max(200).optional(),
  // ── Word library ──
  lang: z.enum(TARGET_LOCALES as [TargetLocale, ...TargetLocale[]]).optional(),
  level: z.string().max(8).optional(),
  word: z.string().max(80).optional(),
});

export type AdminSearch = z.infer<typeof adminSearchSchema>;

/** The params a saved queue stores; everything else on the URL is page chrome. */
export const WORKBENCH_PARAM_KEYS = [
  "q",
  "levels",
  "topics",
  "exams",
  "statuses",
  "reports",
  "drift",
  "sort",
  "dir",
  "size",
] as const;
