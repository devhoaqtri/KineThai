/**
 * Bring Word Refinery's verified words into the English deck.
 *
 * Usage:
 *   npm run vocab:import-refinery -- <word-refinery-kinemedia-en_vi.json> [--dry]
 *
 * The file is the refinery's "Export for KineMedia" (or its `npm run export:kinemedia`).
 * Where each word lands is decided by lib/refinery-import.ts; this script reads the
 * deck files, applies that plan, and writes:
 *
 *   data/packs/refinery-en.json   the refinery's words, compiled and validated
 *   data/packs/<other>.json       rewritten without the words that moved out of them
 *                                 (deleted if none remain)
 *
 * then runs scripts/assign-share-codes.ts so every new word has a code before the
 * deck is served, and refreshes data/level-ladder.json, which snapshots the catalogs. Every output is validated before anything is written, and each file
 * is written atomically. `--dry` prints the plan and writes nothing.
 */
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeDeck, type VocabularyWord } from "../src/features/vocabulary/lib/schema.ts";
import {
  REFINERY_PACK,
  planRefineryImport,
  readRefineryExport,
} from "../src/features/vocabulary/lib/refinery-import.ts";

const DATA = fileURLToPath(new URL("../src/features/vocabulary/data/", import.meta.url));
const PACKS = join(DATA, "packs");
const REFINERY_FILE = join(PACKS, `${REFINERY_PACK}.json`);

type Compiled = { name: string; words: VocabularyWord[] };
const readJson = async <T>(path: string): Promise<T> =>
  JSON.parse(await readFile(path, "utf8")) as T;

/** Validate words the way every deck is validated, and stamp a revision. */
function compile(name: string, words: unknown[]) {
  const catalog = normalizeDeck({ meta: { name }, words });
  const revision = createHash("sha256").update(JSON.stringify(catalog)).digest("hex").slice(0, 24);
  return `${JSON.stringify({ revision, ...catalog }, null, 2)}\n`;
}

async function writeAtomic(path: string, text: string): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, text, { flag: "wx" });
  await rename(temporary, path);
}

const argv = process.argv.slice(2);
const dry = argv.includes("--dry");
const source = argv.filter((arg) => arg !== "--dry");
if (source.length !== 1) {
  console.error("Usage: npm run vocab:import-refinery -- <export.json> [--dry]");
  process.exit(1);
}

try {
  const exported = readRefineryExport(await readJson(resolve(source[0]!)));
  const base = (await readJson<Compiled>(join(DATA, "catalog.json"))).words;
  const packs = new Map<string, Compiled>();
  for (const name of readdirSync(PACKS)
    .filter((file) => file.endsWith(".json"))
    .sort()) {
    if (name === `${REFINERY_PACK}.json`) continue;
    packs.set(name, await readJson<Compiled>(join(PACKS, name)));
  }
  const previous = existsSync(REFINERY_FILE) ? await readJson<Compiled>(REFINERY_FILE) : null;
  const ledger =
    (await readJson<Record<string, Record<string, string>>>(join(DATA, "share-codes.json"))).en ??
    {};

  const plan = planRefineryImport({
    incoming: exported.words,
    base,
    packs: new Map([...packs].map(([name, pack]) => [name, pack.words])),
    previous: previous?.words ?? [],
    ledger,
  });

  // Compile everything first: a word that fails validation must stop the import
  // before any pack has given its copy away.
  const outputs = new Map<string, string | null>();
  outputs.set(REFINERY_FILE, compile(previous?.name ?? "Word Refinery verified", plan.words));
  for (const [name, words] of plan.trimmed) {
    outputs.set(join(PACKS, name), words.length ? compile(packs.get(name)!.name, words) : null);
  }

  const { report } = plan;
  console.log(
    `${dry ? "[dry] " : ""}Word Refinery → ${REFINERY_PACK}: ${plan.words.length} word(s)`,
  );
  console.log(
    `  ${report.added.length} new, ${report.updated.length} updated, ${report.moved.length} moved in from older packs`,
  );
  const from = new Map<string, number>();
  for (const move of report.moved) from.set(move.from, (from.get(move.from) ?? 0) + 1);
  for (const [name, count] of from) {
    const left = plan.trimmed.get(name)!.length;
    console.log(
      `    ${name}: ${count} moved out, ${left ? `${left} remain` : "now empty, removed"}`,
    );
  }
  if (report.restoredCode.length)
    console.log(`  ${report.restoredCode.length} returning word(s) got their old share code back`);
  if (report.keptBase.length) {
    console.log(
      `  ${report.keptBase.length} left out because catalog.json (admin-edited) has them: ${report.keptBase.slice(0, 8).join(", ")}${report.keptBase.length > 8 ? ", …" : ""}`,
    );
  }
  if (report.keptPrevious)
    console.log(`  ${report.keptPrevious} earlier refinery word(s) not in this export, kept`);
  if (dry) process.exit(0);

  for (const [path, text] of outputs) {
    if (text === null) await unlink(path);
    else await writeAtomic(path, text);
  }
  const codes = spawnSync(
    "npx",
    ["tsx", fileURLToPath(new URL("./assign-share-codes.ts", import.meta.url))],
    {
      stdio: "inherit",
    },
  );
  if (codes.status !== 0)
    throw new Error("assign-share-codes failed; run it before serving the deck");
  // The codes were written after the revision was stamped, and appended out of schema
  // order; recompiling restamps it, so a repeat import writes the same bytes.
  const coded = await readJson<Compiled>(REFINERY_FILE);
  await writeAtomic(REFINERY_FILE, compile(coded.name, coded.words));
  // The level ladder is a snapshot of the compiled catalogs; it moves with them.
  const ladder = spawnSync(
    "npx",
    ["vitest", "run", "src/features/vocabulary/lib/__tests__/level-ladder.test.ts", "-u"],
    { stdio: "ignore" },
  );
  if (ladder.status !== 0)
    console.warn("Could not refresh data/level-ladder.json; run its test with -u");
  console.log("Restart dev / rebuild to serve.");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Refinery import failed");
  process.exitCode = 1;
}
