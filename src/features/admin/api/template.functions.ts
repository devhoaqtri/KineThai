/**
 * Admin template CRUD server functions (local file-backed).
 *
 * Reads/writes src/features/canvas/data/templates.json so the developer
 * can curate canvas templates locally before syncing to production.
 *
 * Exports: listTemplates, updateTemplateSection, deleteTemplateItem, addTemplateItem
 * Depends on: fs/promises, path, zod, require-admin
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin, requireAdminAccess } from "../lib/admin-access";
import { requireAdminContext } from "../lib/require-admin";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const TEMPLATES_PATH = resolve(process.cwd(), "src/features/canvas/data/templates.json");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TemplateSection =
  | "gradients"
  | "transitionPaths"
  | "patterns"
  | "scenes"
  | "animationTemplates"
  | "photos"
  | "videos"
  | "fonts"
  | "entrances"
  | "loops"
  | "tempos"
  | "rhythms"
  | "palette"
  | "commentChips";

export type TemplateData = {
  gradients: string[];
  transitionPaths: Array<{
    id: string;
    label: string;
    mood: string;
    gradients: string[];
  }>;
  patterns: Array<{
    id: string;
    label: string;
    mood: string;
    base: string;
    image: string;
    size: string | null;
    step: { x: number; y: number };
    positions: Array<{ x: number; y: number }> | null;
  }>;
  scenes: Array<{
    id: string;
    label: string;
    mood: string;
    base: string;
    image: string;
    size: string | null;
    step: { x: number; y: number };
  }>;
  animationTemplates: Array<{
    id: string;
    label: string;
    mood: string;
    backdrop: { mode: string; [key: string]: string };
    spec: {
      font: string;
      size: number;
      color: string;
      weight: number;
      letterSpacing: number;
      entrance: string;
      loop: string;
      tempo: string;
      rhythm: string;
      x: number;
      y: number;
      rotation: number;
      backgroundScene?: string;
      backgroundPattern?: string;
    };
  }>;
  photos: Array<{ id: string; label: string; url: string }>;
  videos: Array<{ id: string; label: string; url: string }>;
  fonts: string[];
  entrances: string[];
  loops: string[];
  tempos: string[];
  rhythms: string[];
  palette: string[];
  commentChips: Array<{ id: string; emoji: string; label: string }>;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function readTemplates(): Promise<TemplateData> {
  const raw = await readFile(TEMPLATES_PATH, "utf-8");
  return JSON.parse(raw) as TemplateData;
}

async function writeTemplates(data: TemplateData): Promise<void> {
  const json = JSON.stringify(data, null, 2) + "\n";
  await writeFile(TEMPLATES_PATH, json, "utf-8");
}

const SECTION_NAMES: readonly TemplateSection[] = [
  "gradients",
  "transitionPaths",
  "patterns",
  "scenes",
  "animationTemplates",
  "photos",
  "videos",
  "fonts",
  "entrances",
  "loops",
  "tempos",
  "rhythms",
  "palette",
  "commentChips",
];

const sectionSchema = z.enum(SECTION_NAMES as unknown as [TemplateSection, ...TemplateSection[]]);

/** Return the id-like value for an item, or its string value for plain-string arrays. */
function getItemId(item: unknown): string {
  if (item != null && typeof item === "object" && "id" in item) {
    return (item as { id: string }).id;
  }
  return String(item);
}

// ---------------------------------------------------------------------------
// Server functions
// ---------------------------------------------------------------------------

/**
 * List all template data from the local JSON file.
 */
export const listTemplates = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async (): Promise<TemplateData> => readTemplates());

/**
 * Replace an entire section of the template data.
 */
export const updateTemplateSection = createServerFn({ method: "POST" })
  .middleware([requireAdminAccess])
  .inputValidator((d: unknown) => z.object({ section: sectionSchema, data: z.unknown() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdminContext({ authUserId: context.userId });
    const templates = await readTemplates();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (templates as any)[data.section] = data.data;
    await writeTemplates(templates);
    return { ok: true };
  });

/**
 * Delete one item from a section by its id (or string value for plain arrays).
 */
export const deleteTemplateItem = createServerFn({ method: "POST" })
  .middleware([requireAdminAccess])
  .inputValidator((d: unknown) =>
    z.object({ section: sectionSchema, id: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireAdminContext({ authUserId: context.userId });
    const templates = await readTemplates();
    const arr = (templates as Record<string, unknown[]>)[data.section];
    if (!Array.isArray(arr)) return { ok: false };
    const filtered = arr.filter((item) => getItemId(item) !== data.id);
    (templates as Record<string, unknown[]>)[data.section] = filtered;
    await writeTemplates(templates);
    return { ok: true };
  });

/**
 * Add one item to a section.
 */
export const addTemplateItem = createServerFn({ method: "POST" })
  .middleware([requireAdminAccess])
  .inputValidator((d: unknown) => z.object({ section: sectionSchema, item: z.unknown() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdminContext({ authUserId: context.userId });
    const templates = await readTemplates();
    const arr = (templates as Record<string, unknown[]>)[data.section];
    if (!Array.isArray(arr)) return { ok: false };
    arr.push(data.item);
    (templates as Record<string, unknown[]>)[data.section] = arr;
    await writeTemplates(templates);
    return { ok: true };
  });
