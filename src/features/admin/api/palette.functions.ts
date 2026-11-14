/**
 * Admin palette CRUD server functions (local file-backed).
 *
 * Reads/writes src/features/canvas/data/palettes.json. Unlike the template store,
 * this file IS the runtime source: src/features/canvas/palette-collection.ts
 * statically imports it, so a saved palette reaches the feed on the next reload.
 * Every write is audit-gated — a palette that would render an unreadable label is
 * rejected with the failing checks named, rather than stored and repaired later.
 *
 * Exports: listPalettes, savePalette, deletePalette
 * Depends on: fs/promises, path, zod, canvas/palettes, admin-access, require-admin
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import {
  auditPalette,
  describePaletteCheck,
  normalizePalette,
  PALETTE_SCHEMES,
  PALETTE_FONTS,
  type Palette,
  type PaletteScheme,
} from "@/features/canvas/palettes";
import { requireAdmin, requireAdminAccess } from "../lib/admin-access";
import { requireAdminContext } from "../lib/require-admin";

const PALETTES_PATH = resolve(process.cwd(), "src/features/canvas/data/palettes.json");

/** The feed indexes the collection by modulo, so an empty file would crash it. */
const MIN_PALETTE_COUNT = 1;

export type PaletteSaveResult = { ok: true; palette: Palette } | { ok: false; errors: string[] };

export type PaletteDeleteResult = { ok: true } | { ok: false; errors: string[] };

const hexColor = z
  .string()
  .trim()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Must be a #rgb or #rrggbb hex color");

const paletteSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9][a-z0-9-]*$/, "Use lowercase letters, numbers and dashes"),
  label: z.string().trim().min(1).max(60),
  mood: z.string().trim().max(140).default(""),
  scheme: z.enum(PALETTE_SCHEMES as unknown as [PaletteScheme, ...PaletteScheme[]]),
  tone: z.enum(["dark", "light"]),
  hue: z.number().int().min(0).max(359),
  background: z.string().trim().min(1).max(240),
  ink: hexColor,
  accentA: hexColor,
  accentB: hexColor,
  onAccent: hexColor,
  // Only a palette face is accepted: the feed paints Vietnamese clue text in the theme
  // font, so an accent-less family (or the monospace one) is rejected, not silently healed.
  font: z.enum(PALETTE_FONTS as unknown as [string, ...string[]], {
    message: `Pick a feed font with Vietnamese diacritics support (${PALETTE_FONTS.join(", ")})`,
  }),
});

async function readPalettes(): Promise<Palette[]> {
  const raw = await readFile(PALETTES_PATH, "utf-8");
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) return [];
  return (parsed as Palette[]).map(normalizePalette);
}

/** Write through a sibling temp file then rename, so a crash never truncates the collection. */
async function writePalettes(palettes: Palette[]): Promise<void> {
  const temporary = `${PALETTES_PATH}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(palettes, null, 2)}\n`, { flag: "wx" });
  await rename(temporary, PALETTES_PATH);
}

/** Describe every audit failure in plain language for the mutation error surface. */
function describeFailures(palette: Palette): string[] {
  const audit = auditPalette(palette);
  if (audit.pass) return [];
  return audit.checks.filter((check) => !check.pass).map(describePaletteCheck);
}

/**
 * List the stored palette collection.
 * Admin only, like every admin read.
 */
export const listPalettes = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async (): Promise<Palette[]> => readPalettes());

/**
 * Insert or replace one palette, refusing any combination that fails the audit.
 */
export const savePalette = createServerFn({ method: "POST" })
  .middleware([requireAdminAccess])
  .inputValidator((d: unknown) => z.object({ palette: paletteSchema }).parse(d))
  .handler(async ({ data, context }): Promise<PaletteSaveResult> => {
    await requireAdminContext({ authUserId: context.userId });
    const palette = normalizePalette(data.palette as Palette);
    const errors = describeFailures(palette);
    if (errors.length) {
      return {
        ok: false,
        errors: [
          "That combination would render unreadable text or a one-color backdrop. Repair it or pick different colors.",
          ...errors,
        ],
      };
    }
    const palettes = await readPalettes();
    const index = palettes.findIndex((entry) => entry.id === palette.id);
    if (index >= 0) palettes[index] = palette;
    else palettes.push(palette);
    await writePalettes(palettes);
    return { ok: true, palette };
  });

/**
 * Delete one palette. The last remaining palette is protected because the feed
 * picks a theme with `hash % THEMES.length`.
 */
export const deletePalette = createServerFn({ method: "POST" })
  .middleware([requireAdminAccess])
  .inputValidator((d: unknown) => z.object({ id: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }): Promise<PaletteDeleteResult> => {
    await requireAdminContext({ authUserId: context.userId });
    const palettes = await readPalettes();
    const remaining = palettes.filter((entry) => entry.id !== data.id);
    if (remaining.length === palettes.length) {
      return { ok: false, errors: [`No palette has the id "${data.id}".`] };
    }
    if (remaining.length < MIN_PALETTE_COUNT) {
      return {
        ok: false,
        errors: ["Keep at least one palette — the feed has nothing to render without it."],
      };
    }
    await writePalettes(remaining);
    return { ok: true };
  });
