/**
 * Report: cards whose two story clues name one person with two different pronouns.
 *
 * Each clue's person was a name the generator later swapped for a pronoun, field by
 * field, so `leadVi` can follow `em` while `anticipateVi` asks about `bạn ấy` or `chị`.
 * The detector (scripts/lib/pronoun-agreement.ts) reads both clues through the deck's
 * marks and lists every card whose anticipation follows someone the lead never names.
 *
 * It reports only and never edits a deck; fixes belong in word-refinery's batches too.
 * Grades (MismatchGrade): `strong` (a named stand-in like `bạn ấy`, or mình ↔ tôi),
 * `likely` (two kin/peer pronouns, anh ↔ em ↔ chị) and `weak` (a switch involving bare
 * bạn/mình/tôi, or an elder entering a young narrator's story, which can be a genuinely
 * new person). Exit code is 0 either way: this is a worklist, not a gate.
 *
 * Scope: the English deck (data/catalog.json and data/packs/*.json, not packs/incoming).
 *
 * Run: npx tsx scripts/check-pronoun-agreement.ts             (every grade, grouped)
 *      npx tsx scripts/check-pronoun-agreement.ts --sure      (strong and likely only)
 *      npx tsx scripts/check-pronoun-agreement.ts --json      (machine-readable list)
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { checkPronounPair, MISMATCH_GRADES, type PronounMismatch } from "./lib/pronoun-agreement";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "src/features/vocabulary/data");
const SURE_ONLY = process.argv.includes("--sure");
const JSON_OUT = process.argv.includes("--json");

type DeckWord = { id: string; word?: string; meaningVi?: string; leadVi?: string; anticipateVi?: string };

function deckFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? entry.name === "incoming"
          ? []
          : deckFiles(join(dir, entry.name))
        : entry.name.endsWith(".json")
          ? [join(dir, entry.name)]
          : [],
    )
    .sort();
}

type Row = { id: string; word: string; file: string; leadVi: string; anticipateVi: string } & PronounMismatch;

const files = [join(DATA, "catalog.json"), ...deckFiles(join(DATA, "packs"))];
const rows: Row[] = [];
let compared = 0;
for (const path of files) {
  const deck = JSON.parse(readFileSync(path, "utf8")) as { words?: DeckWord[] };
  for (const entry of deck.words ?? []) {
    if (!entry.leadVi || !entry.anticipateVi) continue;
    compared += 1;
    const mismatch = checkPronounPair(entry.leadVi, entry.anticipateVi, entry.meaningVi);
    if (!mismatch || (SURE_ONLY && mismatch.grade === "weak")) continue;
    rows.push({
      id: entry.id,
      word: entry.word ?? "",
      file: relative(ROOT, path),
      leadVi: entry.leadVi,
      anticipateVi: entry.anticipateVi,
      ...mismatch,
    });
  }
}

if (JSON_OUT) {
  const out = rows.map((row) => ({
    id: row.id,
    word: row.word,
    file: row.file,
    grade: row.grade,
    leadVi: row.leadVi,
    anticipateVi: row.anticipateVi,
    leadPerson: row.lead.phrase,
    anticipatePerson: row.anticipate.phrase,
    leadPronouns: row.leadPronouns,
    anticipatePronouns: row.anticipatePronouns,
  }));
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
} else {
  for (const grade of MISMATCH_GRADES) {
    const graded = rows.filter((row) => row.grade === grade);
    if (!graded.length) continue;
    console.log(`\n── ${grade} (${graded.length}) ${"─".repeat(60)}`);
    for (const row of graded) {
      console.log(`${row.id}  (${row.file})  ${row.lead.phrase} → ${row.anticipate.phrase}`);
      console.log(`  lead:       ${row.leadVi}    [${row.leadPronouns.join(", ")}]`);
      console.log(`  anticipate: ${row.anticipateVi}    [${row.anticipatePronouns.join(", ")}]`);
    }
  }
  const counts = MISMATCH_GRADES.map((grade) => `${rows.filter((row) => row.grade === grade).length} ${grade}`);
  console.log(`\n${compared} cards compared; ${rows.length} pronoun mismatches (${counts.join(", ")}).`);
}
