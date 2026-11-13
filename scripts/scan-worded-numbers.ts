/**
 * Find numbers written as words in the shipped decks' Vietnamese text ("hai người",
 * "mười lăm phút", "ba mươi") and turn the certain ones into digits.
 *
 * The verdicts (number, other-meaning, unsure) and every rule behind them live in
 * src/features/vocabulary/lib/worded-numbers.ts. Only `number` is changed here. The
 * English deck's `unsure` hits are settled by a person at /admin/numbers, and those
 * choices are kept in scripts/data/worded-number-decisions.json: this scan reports a
 * decided hit with its decision, and --apply writes a "number" decision again if a
 * re-import brought the words back.
 *
 * Scope: data/catalog.json, data/packs/*.json and data/<locale>/*.json; the fields
 * meaningVi, defVi, leadVi, anticipateVi, usage[].vi, grammar.tipVi, grammar.serEstar and
 * grammar.collocations[].vi. Han-Viet readings and emphasis lists are not prose.
 *
 * Run: npx tsx scripts/scan-worded-numbers.ts                 counts by verdict and reason
 *      npx tsx scripts/scan-worded-numbers.ts --list unsure   every hit with that verdict
 *      npx tsx scripts/scan-worded-numbers.ts --en            English deck only
 *      npx tsx scripts/scan-worded-numbers.ts --json <file>   every hit, as JSON
 *      npx tsx scripts/scan-worded-numbers.ts --apply         write digits for `number`
 * --apply also moves the clue-review ledger's text along, so a reviewed clue keeps its
 * verdict (scripts/data/clue-review-ledger.json). A word-crawler re-import replaces the
 * decks, so a lasting change belongs in the source batches too.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyDigits,
  plainWords,
  scanCard,
  textSlots,
  type Hit,
  type StoredCard,
  type Verdict,
} from "../src/features/vocabulary/lib/worded-numbers";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "src/features/vocabulary/data");
const LEDGER = join(ROOT, "scripts/data/clue-review-ledger.json");
const DECISIONS = join(ROOT, "scripts/data/worded-number-decisions.json");
const LOCALES = ["zh", "ko", "ja", "fr", "de", "es"];

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const ENGLISH_ONLY = args.includes("--en");
const listArg = args.indexOf("--list");
const LIST = listArg >= 0 ? args[listArg + 1] : undefined;
const jsonArg = args.indexOf("--json");
const JSON_OUT = jsonArg >= 0 ? args[jsonArg + 1] : undefined;

function deckFiles(): string[] {
  const files = [join(DATA, "catalog.json")];
  for (const name of readdirSync(join(DATA, "packs")).sort())
    if (name.endsWith(".json")) files.push(join(DATA, "packs", name));
  if (ENGLISH_ONLY) return files;
  for (const locale of LOCALES)
    for (const name of readdirSync(join(DATA, locale)).sort())
      if (name.endsWith(".json")) files.push(join(DATA, locale, name));
  return files;
}

/** Choices made at /admin/numbers, by hit key. */
function readDecisions(): Map<string, "number" | "word"> {
  if (!existsSync(DECISIONS)) return new Map();
  const ledger = JSON.parse(readFileSync(DECISIONS, "utf8")) as {
    entries: Array<{ key: string; choice: "number" | "word" }>;
  };
  return new Map(ledger.entries.map((entry) => [entry.key, entry.choice]));
}

function main() {
  const decisions = readDecisions();
  const all: Hit[] = [];
  const changes: Array<{ id: string; field: string; before: string; after: string }> = [];
  for (const file of deckFiles()) {
    const deck = relative(DATA, file);
    const english = !deck.includes("/") || deck.startsWith("packs/");
    const catalog = JSON.parse(readFileSync(file, "utf8"));
    let changed = false;
    for (const word of catalog.words as StoredCard[]) {
      const hits = scanCard(deck, word);
      for (const hit of hits) {
        const decided = decisions.get(hit.key);
        if (decided === undefined || hit.verdict === "number") continue;
        // A person's choice outranks the scan, but only where digits exist to write.
        if (decided === "number" && hit.digits !== undefined) {
          hit.verdict = "number";
          hit.reason = "decided by hand: digits";
        } else if (decided === "word") {
          hit.verdict = "other-meaning";
          hit.reason = "decided by hand: keep the word";
        }
      }
      all.push(...hits);
      if (!APPLY) continue;
      for (const slot of textSlots(word)) {
        const text = slot.get();
        if (typeof text !== "string") continue;
        const next = applyDigits(
          text,
          hits.filter((hit) => hit.field === slot.field),
        );
        if (next === text) continue;
        slot.set(next);
        changed = true;
        if (english)
          changes.push({
            id: String(word.id).toLowerCase(),
            field: slot.field,
            before: text,
            after: next,
          });
      }
    }
    if (changed) writeFileSync(file, `${JSON.stringify(catalog, null, 2)}\n`);
  }

  if (APPLY) {
    // A ledger verdict is on a clue's words, so it moves along with the new words.
    const ledger = JSON.parse(readFileSync(LEDGER, "utf8"));
    let moved = 0;
    for (const entry of ledger.entries as Array<{ id: string; field: string; text: string }>) {
      const change = changes.find(
        (candidate) =>
          candidate.id === entry.id.toLowerCase() &&
          candidate.field === entry.field &&
          plainWords(candidate.before) === plainWords(entry.text),
      );
      if (change) {
        entry.text = change.after;
        moved += 1;
      }
    }
    if (moved > 0) writeFileSync(LEDGER, `${JSON.stringify(ledger, null, 2)}\n`);
    const written = all.filter((hit) => hit.verdict === "number").length;
    console.log(`applied: ${written} hits written as digits; ${moved} ledger entries moved along`);
  }

  if (JSON_OUT) writeFileSync(JSON_OUT, `${JSON.stringify(all, null, 1)}\n`);

  const counts = new Map<string, number>();
  for (const hit of all) counts.set(hit.verdict, (counts.get(hit.verdict) ?? 0) + 1);
  console.log(`hits: ${all.length}`);
  for (const verdict of ["number", "other-meaning", "unsure"])
    console.log(`  ${verdict.padEnd(14)} ${counts.get(verdict) ?? 0}`);

  const show = (hit: Hit) =>
    `${hit.deck} ${hit.id} ${hit.field} [${hit.words}${hit.digits ? ` → ${hit.digits}` : ""}] ${hit.reason}\n    ${hit.text}`;
  if (LIST) {
    for (const hit of all.filter((candidate) => candidate.verdict === LIST)) console.log(show(hit));
    return;
  }
  for (const verdict of ["number", "other-meaning", "unsure"] as Verdict[]) {
    const reasons = new Map<string, number>();
    for (const hit of all.filter((candidate) => candidate.verdict === verdict)) {
      const reason = hit.reason.replace(/\(.*\)/, "(…)").replace(/".*"/, '"…"');
      reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
    }
    console.log(`\n${verdict}:`);
    for (const [reason, count] of [...reasons].sort((a, b) => b[1] - a[1]))
      console.log(`  ${String(count).padStart(6)}  ${reason}`);
  }
}

main();
