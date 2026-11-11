/**
 * Assert every palette in the collection is internally legible.
 *
 * Runs the same audit the app runs at load time, so a hand-edited palettes.json
 * that would render an unreadable label — or a backdrop dark enough that the
 * canvas pipeline swaps in its own default gradient — fails here rather than in
 * the feed. Also asserts the load-time repair is a no-op on stored values: if it
 * is not, the hex an operator sees in /admin/palettes is not the hex the app
 * paints.
 *
 * Usage: npm run check:palettes
 */
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  auditPalette,
  describePaletteCheck,
  ensureReadablePalette,
  isPaletteFont,
  normalizePalette,
  type Palette,
} from "../src/features/canvas/palettes.ts";

const COLLECTION = fileURLToPath(
  new URL("../src/features/canvas/data/palettes.json", import.meta.url),
);

const failures: string[] = [];
const rows: string[] = [];

try {
  const stored = JSON.parse(await readFile(COLLECTION, "utf8")) as Palette[];
  if (!Array.isArray(stored) || stored.length === 0) {
    failures.push(`${resolve(dirname(COLLECTION))}/palettes.json holds no palettes`);
  }

  const ids = new Set<string>();
  for (const raw of stored) {
    // Check the stored font BEFORE normalizePalette heals it: the loader silently
    // replaces an accent-less family with a safe default, so the feed would render
    // fine while /admin/palettes showed a font the collection never actually paints.
    // Fail loudly instead, so the JSON is corrected at the source.
    if (!isPaletteFont(raw.font)) {
      failures.push(
        `${raw.id}: font "${raw.font}" is not a palette font (PALETTE_FONTS): either it has no Vietnamese diacritics subset, or it is monospace, which squeezes Vietnamese letters on a card`,
      );
    }
    const palette = normalizePalette(raw);
    const audit = auditPalette(palette);
    const repaired = ensureReadablePalette(palette);
    const drift = (Object.keys(palette) as (keyof Palette)[]).filter(
      (key) => palette[key] !== repaired[key],
    );

    if (ids.has(palette.id)) failures.push(`${palette.id}: duplicate id`);
    ids.add(palette.id);
    for (const check of audit.checks) {
      if (check.pass) continue;
      failures.push(`${palette.id}: ${describePaletteCheck(check)}`);
    }
    if (drift.length) {
      failures.push(
        `${palette.id}: load-time repair would change ${drift.join(", ")} — store the repaired hex instead`,
      );
    }

    const worst = audit.checks
      .filter((check) => check.unit === "contrast")
      .reduce((min, check) => Math.min(min, check.value), Number.POSITIVE_INFINITY);
    rows.push(
      `${audit.pass && !drift.length ? "PASS" : "FAIL"}  ${palette.id.padEnd(18)} ${palette.tone.padEnd(6)} worst contrast ${worst.toFixed(2)}:1`,
    );
  }
} catch (error) {
  failures.push(error instanceof Error ? error.message : "Could not read the palette collection");
}

console.log(rows.join("\n"));
if (failures.length) {
  console.error(
    `\n${failures.length} palette problem(s):\n${failures.map((f) => `  - ${f}`).join("\n")}`,
  );
  process.exitCode = 1;
} else {
  console.log(`\n${rows.length} palettes clear every contrast and separation floor.`);
}
