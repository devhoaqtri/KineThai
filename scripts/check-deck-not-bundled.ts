/**
 * Guard: no word deck ships in a browser bundle.
 *
 * The decks are served one page at a time by /api/public/vocabulary, behind a signed
 * stream cursor and rate limits. All of that is moot if any client module imports
 * lib/catalog-source (or a deck JSON directly): the bundler then copies the whole deck
 * into a public asset, where it can be downloaded in one request. That happened once,
 * through the saved-words page, and nothing said so.
 *
 * This reads every deck file, takes its definitions as fingerprints, and fails if any of
 * them appears in a built client asset.
 *
 * Run after a build: npx vite build && npx tsx scripts/check-deck-not-bundled.ts
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const DATA = "src/features/vocabulary/data";
const ASSETS = ".output/public";

function deckFiles(): string[] {
  const files = [join(DATA, "catalog.json")];
  for (const entry of readdirSync(DATA)) {
    const dir = join(DATA, entry);
    if (!statSync(dir).isDirectory()) continue;
    for (const file of readdirSync(dir)) if (file.endsWith(".json")) files.push(join(dir, file));
  }
  return files.filter((file) => existsSync(file));
}

function assetFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return assetFiles(path);
    return /\.(m?js|json|html)$/.test(entry) ? [path] : [];
  });
}

if (!existsSync(ASSETS)) {
  console.error(`${ASSETS} does not exist; run \`npx vite build\` first.`);
  process.exit(1);
}

// Definitions are long, specific and never UI copy, so a hit is a deck in the bundle.
const fingerprints = new Map<string, string>();
for (const file of deckFiles()) {
  const deck = JSON.parse(readFileSync(file, "utf8")) as { words?: { defVi?: string }[] };
  for (const word of deck.words ?? []) {
    const def = word.defVi?.trim();
    if (def && def.length >= 24) fingerprints.set(JSON.stringify(def).slice(1, -1), file);
  }
}
// A definition quoted in client source on purpose (the import panel's sample pack) is a
// deliberate copy of one word, not a deck reaching the bundle through an import.
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return path === DATA ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry) && !entry.endsWith(".server.ts") ? [path] : [];
  });
}
const clientSource = sourceFiles("src")
  .map((file) => readFileSync(file, "utf8"))
  .join("\n");
for (const fingerprint of [...fingerprints.keys()]) {
  if (clientSource.includes(fingerprint)) fingerprints.delete(fingerprint);
}
// The first-visit demo ships a dozen words per language on purpose (lib/demo-deck): copies
// taken by `npm run demo:decks`, bounded by MAX_DEMO_WORDS in demo-deck.test.ts.
const DEMO = "src/features/vocabulary/demo";
if (existsSync(DEMO)) {
  for (const file of readdirSync(DEMO)) {
    if (!file.endsWith(".json")) continue;
    const demo = JSON.parse(readFileSync(join(DEMO, file), "utf8")) as {
      words?: { defVi?: string }[];
    };
    for (const word of demo.words ?? []) {
      const def = word.defVi?.trim();
      if (def) fingerprints.delete(JSON.stringify(def).slice(1, -1));
    }
  }
}
if (fingerprints.size === 0) {
  console.error("no deck fingerprints were read; this guard would pass vacuously");
  process.exit(1);
}

const leaks = new Map<string, Set<string>>();
for (const asset of assetFiles(ASSETS)) {
  const text = readFileSync(asset, "utf8");
  for (const [fingerprint, deck] of fingerprints) {
    if (!text.includes(fingerprint)) continue;
    const decks = leaks.get(asset) ?? new Set<string>();
    decks.add(deck);
    leaks.set(asset, decks);
  }
}

if (leaks.size) {
  for (const [asset, decks] of leaks) {
    console.error(`FAIL  ${asset} carries ${[...decks].join(", ")}`);
  }
  console.error(
    "\nA client module imports a deck. Only *.server.ts code may reach catalog-source.",
  );
  process.exit(1);
}
console.log(`OK    ${fingerprints.size} deck definitions, none in ${ASSETS}`);
