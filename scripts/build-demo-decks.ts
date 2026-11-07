/**
 * Writes the first-visit demo lists: one small JSON per language in
 * src/features/vocabulary/demo/, holding the words DEMO_WORD_IDS names, copied from that
 * language's deck exactly as the server merges it (lib/catalog-source: base file first, then
 * each pack in name order, first copy of a word wins). Raw deck text, `_` joins included:
 * the browser turns them into no-break spaces when it loads the list, as for every deck.
 *
 * Run after DEMO_WORD_IDS or a deck changes: npm run demo:decks
 * demo-deck.test.ts fails while a list is out of date with its deck.
 *
 * Exports: none (script)
 * Depends on: lib/demo-deck (ids), lib/schema (mergeCatalogs)
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEMO_WORD_IDS } from "../src/features/vocabulary/lib/demo-deck";
import { mergeCatalogs, type Catalog } from "../src/features/vocabulary/lib/schema";
import { TARGET_LOCALES, type TargetLocale } from "../src/features/vocabulary/lib/target-language";

const DATA = "src/features/vocabulary/data";
const OUT = "src/features/vocabulary/demo";

function readDeck(path: string): Catalog {
  return JSON.parse(readFileSync(path, "utf8")) as Catalog;
}

function jsonIn(dir: string): string[] {
  return readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => join(dir, file));
}

/** The deck a language serves, merged as lib/catalog-source merges it. */
function deckFor(locale: TargetLocale): Catalog {
  const files =
    locale === "en"
      ? [join(DATA, "catalog.json"), ...jsonIn(join(DATA, "packs"))]
      : jsonIn(join(DATA, locale));
  const [first, ...rest] = files.map(readDeck);
  if (!first) throw new Error(`${locale}: no deck files`);
  return mergeCatalogs(first, ...rest);
}

mkdirSync(OUT, { recursive: true });
let failed = false;
for (const locale of TARGET_LOCALES) {
  const ids = DEMO_WORD_IDS[locale];
  if (!ids.length) continue;
  const deck = deckFor(locale);
  const byId = new Map(deck.words.map((word) => [word.id, word]));
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length) {
    console.error(`FAIL  ${locale}: not in the deck: ${missing.join(", ")}`);
    failed = true;
    continue;
  }
  const words = ids.map((id) => byId.get(id)!);
  const demo: Catalog = {
    revision: deck.revision,
    name: `${deck.name} · demo`,
    count: words.length,
    topics: deck.topics,
    levels: deck.levels,
    words,
  };
  const path = join(OUT, `${locale}.json`);
  writeFileSync(path, `${JSON.stringify(demo, null, 2)}\n`);
  console.log(`OK    ${path}: ${words.map((word) => word.word).join(", ")}`);
}
if (failed) process.exit(1);
