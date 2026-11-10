/**
 * Replace every issued share code that fails the screen (lib/share-code-screen): one that
 * reads as an English word or a taboo shorthand.
 *
 * A code is a promise, so it is RETIRED, never recycled: it moves from the ledger
 * (data/share-codes.json) to data/share-codes-retired.json with the word it named and why,
 * and is never issued again. The word gets a fresh code that passes the screen, recorded in
 * its deck file and the ledger. A link already shared with a retired code still opens its
 * word (api/word-endpoint.server.ts reads the retired file). Codes of words that have left a
 * deck are retired the same way, with no deck to update.
 *
 * Only replaces; it never gives a code to a word that has none (that is
 * scripts/assign-share-codes.ts, which now screens and skips retired codes too).
 *
 * Usage: npx tsx scripts/rescreen-share-codes.ts [--dry]
 * Depends on: ../src/features/vocabulary/lib/share-code, ./lib/share-code-screen
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { randomShareCode } from "../src/features/vocabulary/lib/share-code";
import { screenShareCode } from "./lib/share-code-screen";

const here = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(here, "../src/features/vocabulary/data");
const LEDGER = join(DATA, "share-codes.json");
const RETIRED = join(DATA, "share-codes-retired.json");

type Word = { id: string; shareCode?: string };
type Deck = { words: Word[] };
type Ledger = Record<string, Record<string, string>>;
type Retired = Record<string, Record<string, { id: string; reason: string; replacedBy?: string }>>;

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

const dry = process.argv.includes("--dry");
const ledger = JSON.parse(readFileSync(LEDGER, "utf8")) as Ledger;
const retired: Retired = existsSync(RETIRED)
  ? (JSON.parse(readFileSync(RETIRED, "utf8")) as Retired)
  : {};

let total = 0;
for (const locale of Object.keys(ledger)) {
  const issued = ledger[locale]!;
  const gone = (retired[locale] ??= {});
  const failing = Object.keys(issued)
    .map((code) => ({ code, reason: screenShareCode(code) }))
    .filter((entry): entry is { code: string; reason: string } => entry.reason !== null);
  if (!failing.length) continue;

  // Never hand out a code that is issued or retired, nor one that fails the screen.
  const taken = new Set([...Object.keys(issued), ...Object.keys(gone)]);
  const fresh = () => {
    let code = randomShareCode();
    while (taken.has(code) || screenShareCode(code)) code = randomShareCode();
    taken.add(code);
    return code;
  };
  const replacement = new Map<string, string>();
  for (const { code, reason } of failing) {
    const id = issued[code]!;
    const next = fresh();
    replacement.set(code, next);
    gone[code] = { id, reason, replacedBy: next };
    delete issued[code];
    issued[next] = id;
  }

  // Carry the new codes into the deck files that hold those words.
  let touchedFiles = 0;
  for (const file of deckFiles(locale)) {
    const deck = JSON.parse(readFileSync(file, "utf8")) as Deck;
    let touched = false;
    for (const word of deck.words ?? []) {
      const next = word.shareCode ? replacement.get(word.shareCode) : undefined;
      if (!next) continue;
      word.shareCode = next;
      touched = true;
    }
    if (touched) {
      touchedFiles += 1;
      if (!dry) writeFileSync(file, `${JSON.stringify(deck, null, 2)}\n`);
    }
  }
  total += failing.length;
  console.log(
    `${dry ? "[dry] " : ""}${locale}: ${failing.length} retired and replaced (${touchedFiles} deck file(s))`,
  );
}

if (!dry && total) {
  writeFileSync(LEDGER, `${JSON.stringify(ledger, null, 2)}\n`);
  writeFileSync(RETIRED, `${JSON.stringify(retired, null, 2)}\n`);
}
console.log(`${dry ? "[dry] would replace" : "Replaced"} ${total} code(s) in total`);
