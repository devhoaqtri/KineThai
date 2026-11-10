/**
 * Assign a share code to every deck word that does not have one yet.
 *
 * Append-only by construction: a word that already carries a code is never
 * touched, and a code that has ever been issued is never handed to another word,
 * because codes travel in chat messages and have to keep meaning the same word
 * forever. The ledger (data/share-codes.json) remembers codes belonging to words
 * that have since left a deck, so they can never be recycled onto a new answer.
 *
 * Codes are unique PER DECK, not globally. A deck is what one host serves — the
 * English deck is `catalog.json` merged with every pack in `data/packs`, and each
 * other locale is its own directory (see lib/catalog-source). The same code may
 * therefore mean different words on anh.chayla.app and a zh host, which is the
 * price of keeping 32,768 codes available to each of them.
 *
 * A new code must also pass the screen (scripts/lib/share-code-screen): it may not read as
 * an English word or a taboo shorthand. Codes retired for failing it
 * (data/share-codes-retired.json, see scripts/rescreen-share-codes.ts) are never issued.
 *
 * Usage: npx tsx scripts/assign-share-codes.ts [--dry]
 * Depends on: ../src/features/vocabulary/lib/share-code, ./lib/share-code-screen
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import {
  SHARE_CODE_SPACE,
  isShareCode,
  randomShareCode,
} from "../src/features/vocabulary/lib/share-code";
import { screenShareCode } from "./lib/share-code-screen";

const here = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(here, "../src/features/vocabulary/data");
const LEDGER = join(DATA, "share-codes.json");
const RETIRED = join(DATA, "share-codes-retired.json");

type Word = { id: string; shareCode?: string };
type Deck = { words: Word[] };
/** locale -> code -> word id, including ids no longer in that deck. */
type Ledger = Record<string, Record<string, string>>;

/** Every file that contributes words to one deck, in the order catalog-source merges them. */
function deckFiles(locale: string): string[] {
  const packs = (dir: string) =>
    existsSync(dir)
      ? readdirSync(dir)
          .filter((name) => name.endsWith(".json"))
          .sort()
          .map((name) => join(dir, name))
      : [];
  return locale === "en"
    ? [join(DATA, "catalog.json"), ...packs(join(DATA, "packs"))]
    : packs(join(DATA, locale));
}

const LOCALES = ["en", "zh", "ko", "ja", "fr", "de", "es"];
const dry = process.argv.includes("--dry");

let ledger: Ledger = {};
try {
  ledger = JSON.parse(readFileSync(LEDGER, "utf8")) as Ledger;
} catch {
  // First run, or the pre-locale format; rebuilt below from what the decks carry.
}

/** locale -> retired code -> what it named; never issued again. */
const retired = existsSync(RETIRED)
  ? (JSON.parse(readFileSync(RETIRED, "utf8")) as Record<string, Record<string, unknown>>)
  : {};

let totalAssigned = 0;
for (const locale of LOCALES) {
  const files = deckFiles(locale);
  if (!files.length) continue;
  const issued = (ledger[locale] ??= {});
  const taken = new Set([...Object.keys(issued), ...Object.keys(retired[locale] ?? {})]);
  // A crawler re-import rewrites a deck file without its codes; a word the ledger
  // already knows gets its own code back rather than a second one.
  const earlier = new Map<string, string>();
  for (const [code, id] of Object.entries(issued)) if (!earlier.has(id)) earlier.set(id, code);

  const decks = files.map((file) => ({
    file,
    deck: JSON.parse(readFileSync(file, "utf8")) as Deck,
  }));
  const restored = new Set<string>();
  for (const { file, deck } of decks) {
    for (const word of deck.words ?? []) {
      if (word.shareCode) taken.add(word.shareCode);
      else if (earlier.has(word.id)) {
        word.shareCode = earlier.get(word.id)!;
        restored.add(file);
      }
    }
  }
  if (!dry)
    for (const { file, deck } of decks) {
      if (restored.has(file)) writeFileSync(file, `${JSON.stringify(deck, null, 2)}\n`);
    }

  const needed = decks.reduce(
    (count, { deck }) => count + (deck.words ?? []).filter((word) => !word.shareCode).length,
    0,
  );
  if (taken.size + needed > SHARE_CODE_SPACE) {
    throw new Error(
      `[${locale}] share code space exhausted: ${taken.size} issued + ${needed} needed > ${SHARE_CODE_SPACE}. ` +
        `The format has to grow a character, which invalidates every code already shared.`,
    );
  }

  let assigned = 0;
  for (const { file, deck } of decks) {
    let touched = false;
    for (const word of deck.words ?? []) {
      if (word.shareCode) {
        issued[word.shareCode] = word.id;
        continue;
      }
      let code = randomShareCode();
      while (taken.has(code) || screenShareCode(code)) code = randomShareCode();
      taken.add(code);
      word.shareCode = code;
      issued[code] = word.id;
      assigned += 1;
      touched = true;
    }
    if (touched && !dry) writeFileSync(file, `${JSON.stringify(deck, null, 2)}\n`);
  }

  if (![...taken].every(isShareCode))
    throw new Error(`[${locale}] an issued code is not well-formed`);
  totalAssigned += assigned;
  console.log(
    `${dry ? "[dry] " : ""}${locale}: ${assigned} assigned, ${taken.size} issued of ${SHARE_CODE_SPACE} (${files.length} file(s))`,
  );
}

if (!dry) writeFileSync(LEDGER, `${JSON.stringify(ledger, null, 2)}\n`);
console.log(`${dry ? "[dry] would assign" : "Assigned"} ${totalAssigned} code(s) in total`);
