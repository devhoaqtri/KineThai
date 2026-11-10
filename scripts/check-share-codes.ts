/**
 * Regression guard for share codes.
 *
 * A code is a promise: once it has been in a chat message, `/w/K7F` has to keep
 * meaning the same word forever. Nothing in the type system enforces that — decks
 * are JSON files that scripts rewrite — so these assertions do.
 *
 * Scope is the DECK, not one file: the English deck is `catalog.json` merged with
 * every pack, exactly as lib/catalog-source assembles it, because that merge is
 * what a host serves and therefore what a code has to be unique within. The
 * ledger is the authority on what has ever been issued, including codes whose word
 * has since left the deck; checking the deck against it is what catches a
 * reassignment, the failure that would silently point a shared link at the wrong
 * word.
 *
 * It also holds the screen (scripts/lib/share-code-screen): no issued code may read as an
 * English word or a taboo shorthand, and a code retired for that
 * (data/share-codes-retired.json) may never come back into a deck or the ledger.
 *
 * Usage: npx tsx scripts/check-share-codes.ts
 * Depends on: ../src/features/vocabulary/lib/share-code, ./lib/share-code-screen
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import {
  SHARE_CODE_LENGTH,
  SHARE_CODE_SPACE,
  isShareCode,
  normalizeShareCode,
} from "../src/features/vocabulary/lib/share-code";
import { screenShareCode } from "./lib/share-code-screen";

const here = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(here, "../src/features/vocabulary/data");

type Word = { id: string; shareCode?: string };
type Ledger = Record<string, Record<string, string>>;

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

const ledger = JSON.parse(readFileSync(join(DATA, "share-codes.json"), "utf8")) as Ledger;
const retiredPath = join(DATA, "share-codes-retired.json");
const retiredAll = existsSync(retiredPath)
  ? (JSON.parse(readFileSync(retiredPath, "utf8")) as Record<
      string,
      Record<string, { id: string }>
    >)
  : {};

let failures = 0;
function check(condition: boolean, message: string): void {
  if (condition) {
    console.log(`OK   ${message}`);
    return;
  }
  console.error(`FAIL: ${message}`);
  failures += 1;
}

for (const locale of ["en", "zh", "ko", "ja", "fr", "de", "es"]) {
  const files = deckFiles(locale);
  if (!files.length) continue;
  const words: Word[] = files.flatMap(
    (file) => (JSON.parse(readFileSync(file, "utf8")) as { words?: Word[] }).words ?? [],
  );
  const issued = ledger[locale] ?? {};
  const label = `[${locale}]`;

  const missing = words.filter((word) => !word.shareCode).map((word) => word.id);
  check(
    missing.length === 0,
    `${label} every word has a code${missing.length ? ` (missing ${missing.length}, e.g. ${missing.slice(0, 4).join(", ")})` : ` (${words.length} words)`}`,
  );

  const malformed = words.filter((word) => word.shareCode && !isShareCode(word.shareCode));
  check(
    malformed.length === 0,
    `${label} every code is ${SHARE_CODE_LENGTH} valid characters${
      malformed.length
        ? ` (bad: ${malformed
            .slice(0, 4)
            .map((w) => `${w.id}=${w.shareCode}`)
            .join(", ")})`
        : ""
    }`,
  );

  const noncanonical = words.filter(
    (word) => word.shareCode && normalizeShareCode(word.shareCode) !== word.shareCode,
  );
  check(
    noncanonical.length === 0,
    `${label} every code is in canonical form${
      noncanonical.length
        ? ` (got: ${noncanonical
            .slice(0, 4)
            .map((w) => w.shareCode)
            .join(", ")})`
        : ""
    }`,
  );

  // Unique across the MERGED deck — a base word and a pack word may not collide.
  const seen = new Map<string, string>();
  const duplicates: string[] = [];
  for (const word of words) {
    if (!word.shareCode) continue;
    const owner = seen.get(word.shareCode);
    if (owner) duplicates.push(`${word.shareCode}: ${owner} & ${word.id}`);
    else seen.set(word.shareCode, word.id);
  }
  check(
    duplicates.length === 0,
    `${label} no two words in the merged deck share a code${duplicates.length ? ` (${duplicates.slice(0, 3).join("; ")})` : ""}`,
  );

  const reassigned: string[] = [];
  const unrecorded: string[] = [];
  for (const word of words) {
    if (!word.shareCode) continue;
    const owner = issued[word.shareCode];
    if (owner === undefined) unrecorded.push(`${word.shareCode} (${word.id})`);
    else if (owner !== word.id)
      reassigned.push(`${word.shareCode}: ledger says ${owner}, deck says ${word.id}`);
  }
  check(
    reassigned.length === 0,
    `${label} no code has been reassigned${reassigned.length ? ` (${reassigned.slice(0, 3).join("; ")})` : ""}`,
  );
  check(
    unrecorded.length === 0,
    `${label} every code is recorded in the ledger${unrecorded.length ? ` (${unrecorded.slice(0, 4).join(", ")})` : ""}`,
  );

  // The screen: nothing issued reads as a word or a taboo, and nothing retired comes back.
  const screened = Object.keys(issued)
    .map((code) => [code, screenShareCode(code)] as const)
    .filter(([, why]) => why !== null);
  check(
    screened.length === 0,
    `${label} no issued code reads as a word or a taboo${
      screened.length
        ? ` (${screened.length}: ${screened
            .slice(0, 6)
            .map(([code, why]) => `${code}=${why}`)
            .join(", ")} — run scripts/rescreen-share-codes.ts)`
        : ""
    }`,
  );
  const retired = retiredAll[locale] ?? {};
  const revived = [
    ...words.filter((word) => word.shareCode && retired[word.shareCode]).map((w) => w.shareCode!),
    ...Object.keys(issued).filter((code) => retired[code]),
  ];
  check(
    revived.length === 0,
    `${label} no retired code is back in the deck or the ledger${revived.length ? ` (${[...new Set(revived)].slice(0, 6).join(", ")})` : ` (${Object.keys(retired).length} retired)`}`,
  );

  const count = Object.keys(issued).length;
  check(
    count <= SHARE_CODE_SPACE,
    `${label} issued codes fit the format (${count} of ${SHARE_CODE_SPACE}, ${((count / SHARE_CODE_SPACE) * 100).toFixed(1)}% used)`,
  );
}

if (failures > 0) {
  console.error(`\n${failures} share-code check(s) failed.`);
  process.exit(1);
}
console.log("\nAll share-code checks passed.");
