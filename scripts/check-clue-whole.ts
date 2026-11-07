/**
 * Guard: every Vietnamese clue is a whole sentence, never one with the word cut out.
 *
 * Some clues were written by deleting the word that names the meaning from a natural
 * sentence, to "hide" it: `ra hồ trường_học sải mỗi=sáng`, where `bơi` was cut and `sải`
 * is left meaning nothing. No blank shows, so the reader just meets broken Vietnamese.
 * docs/clue-deleted-word-proposal.md measures it; docs/highlight-generation-rule.md
 * Rule 8 forbids it.
 *
 * No rule finds these on its own (the measured recall is about half), so the check works
 * against a review ledger (scripts/data/clue-review-ledger.json) that records a person's
 * verdict on a clue's plain text: `ok` or `broken`. It fails when:
 *   1. a hard rule fires on a clue the ledger does not already call broken:
 *      a bound syllable without its head, a quantifier straight before a demonstrative,
 *      or a clue that is its card's own usage line with the meaning removed;
 *   2. more clues the ledger calls broken are shipped than MAX_KNOWN_BROKEN_CLUES
 *      (a fix lowers it; a re-import that brings an old text back goes over it);
 *   3. more gap candidates are unreviewed than MAX_UNREVIEWED_CLUE_GAPS.
 * Both numbers are ratchets: lower them as decks improve, never raise them.
 *
 * A gap candidate is a clue lacking the meaning's root where the root fits between two
 * neighbours (`prev ROOT` and `ROOT next` are attested in the decks) while `prev next`
 * occurs nowhere else. About 1 in 20 is real, which is why each one is read once and
 * recorded instead of failing outright.
 *
 * Scope: the English deck (data/catalog.json and data/packs/*.json), the launch deck.
 *
 * Run: npx tsx scripts/check-clue-whole.ts            (the check)
 *      npx tsx scripts/check-clue-whole.ts --list     (also print every unreviewed candidate)
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// A ratchet: lower it as decks improve, never raise it to let a deck through.
const MAX_UNREVIEWED_CLUE_GAPS = 331;
// A ratchet: the ledger's broken clues still shipped. Lower it with every fix.
const MAX_KNOWN_BROKEN_CLUES = 3;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "src/features/vocabulary/data");
const LEDGER = join(ROOT, "scripts/data/clue-review-ledger.json");
const CLUE_FIELDS = ["defVi", "leadVi", "anticipateVi"] as const;
const LIST = process.argv.includes("--list");

const checks: string[] = [];
function check(name: string, pass: boolean) {
  checks.push(`${pass ? "OK  " : "FAIL"} ${name}`);
  if (!pass) process.exitCode = 1;
}

// ── Text ─────────────────────────────────────────────────────────────────────

type Token = { syllable: string; edge: boolean };
const WRAP = /^["'“”‘’()[\]«»\-–—]+|["'“”‘’()[\]«»\-–—]+$/g;
const TRAILING_PUNCT = /[,.;:!?…]+$/;

/** Plain lowercase syllables, marks removed; `edge` is a phrase edge after the syllable. */
function tokenize(text: string): Token[] {
  const spaced = text
    .normalize("NFC")
    .replace(/\//g, "")
    .replace(/[|_= ]/g, " ");
  const out: Token[] = [];
  for (const raw of spaced.split(/\s+/)) {
    let syllable = raw.replace(WRAP, "").toLowerCase();
    const edge = TRAILING_PUNCT.test(syllable);
    syllable = syllable.replace(TRAILING_PUNCT, "").replace(WRAP, "");
    if (syllable) out.push({ syllable, edge });
  }
  return out;
}

const plain = (text: string) => tokenize(text).map((token) => token.syllable);

/** Light syllables that wrap a meaning (`môn bơi` → `bơi`); the root is what is left. */
const LIGHT = new Set(
  `môn sự việc cái con người cuộc nỗi niềm tính độ bị được làm có một các những điều lời
   phép nghề trò bài chiếc cơn bữa lúc khi rất hơi đã đang sẽ không chưa ra vào lên xuống
   đi lại thật quá`.split(/\s+/),
);

/** Each comma-separated alternative of `meaningVi`, as its root syllables. */
function meaningRoots(meaning: string): string[][] {
  return meaning
    .normalize("NFC")
    .split(/[,;/]| hoặc /)
    .map((part) => plain(part).filter((syllable) => !syllable.startsWith("(")))
    .filter((syllables) => syllables.length > 0)
    .map((syllables) => {
      const root = syllables.filter((syllable) => !LIGHT.has(syllable));
      return root.length > 0 ? root : syllables;
    });
}

function containsRun(haystack: string[], needle: string[]): boolean {
  for (let start = 0; start + needle.length <= haystack.length; start += 1) {
    if (needle.every((syllable, offset) => haystack[start + offset] === syllable)) return true;
  }
  return false;
}

function withoutRun(haystack: string[], needle: string[]): string[] {
  const out: string[] = [];
  for (let index = 0; index < haystack.length;) {
    if (needle.every((syllable, offset) => haystack[index + offset] === syllable)) {
      index += needle.length;
    } else {
      out.push(haystack[index]!);
      index += 1;
    }
  }
  return out;
}

/** 2·LCS / (|a| + |b|) over syllables: 1 is the same sentence. */
function similarity(a: string[], b: string[]): number {
  if (a.length + b.length === 0) return 1;
  let previous = new Array<number>(b.length + 1).fill(0);
  for (const left of a) {
    const row = [0];
    for (let j = 0; j < b.length; j += 1) {
      row.push(left === b[j] ? previous[j]! + 1 : Math.max(previous[j + 1]!, row[j]!));
    }
    previous = row;
  }
  return (2 * previous[b.length]!) / (a.length + b.length);
}

// ── Decks ────────────────────────────────────────────────────────────────────

type Card = Record<string, unknown> & { id?: string; word?: string; meaningVi?: string };

function deckFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? entry.name === "incoming"
        ? []
        : deckFiles(join(dir, entry.name))
      : entry.name.endsWith(".json")
        ? [join(dir, entry.name)]
        : [],
  );
}

function cardsOf(file: string): Card[] {
  const parsed = JSON.parse(readFileSync(file, "utf8")) as { words?: unknown };
  return Array.isArray(parsed.words) ? (parsed.words as Card[]) : [];
}

/** Every Vietnamese string in a deck: fields named `…Vi`, and usage lines' `vi`. */
function* vietnameseTexts(value: unknown): Generator<string> {
  if (Array.isArray(value)) {
    for (const item of value) yield* vietnameseTexts(item);
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (typeof item === "string" && (key.endsWith("Vi") || key === "vi")) yield item;
      else yield* vietnameseTexts(item);
    }
  }
}

const pairKey = (a: string, b: string) => `${a}\u0001${b}`;

/** Syllable bigrams over every deck in every language, the evidence for a cut. */
function buildBigrams(files: string[]) {
  const bigrams = new Map<string, number>();
  const joined = new Map<string, number>();
  const bump = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1);
  for (const file of files) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      continue;
    }
    for (const text of vietnameseTexts(parsed)) {
      const tokens = tokenize(text);
      for (let index = 0; index + 1 < tokens.length; index += 1) {
        if (!tokens[index]!.edge)
          bump(bigrams, pairKey(tokens[index]!.syllable, tokens[index + 1]!.syllable));
      }
      for (const raw of text.replace(/\//g, "").split(/\s+/)) {
        if (!raw.includes("_")) continue;
        const parts = plain(raw);
        for (let index = 0; index + 1 < parts.length; index += 1)
          bump(joined, pairKey(parts[index]!, parts[index + 1]!));
      }
    }
  }
  return {
    bigram: (a: string, b: string) => bigrams.get(pairKey(a, b)) ?? 0,
    join: (a: string, b: string) => joined.get(pairKey(a, b)) ?? 0,
  };
}

// ── Rules ────────────────────────────────────────────────────────────────────

/**
 * Syllables that mean nothing without their head. Seeded only from confirmed cases; add one
 * when a review confirms a new cut, with the neighbours that make it whole again.
 */
const BOUND: { syllable: string; headBefore: string[]; orAfter: string[]; whyCut: string }[] = [
  { syllable: "sải", headBefore: ["bơi"], orAfter: ["bước", "cánh", "chân", "tay"], whyCut: "bơi" },
];
/** Neighbours that only make sense with a word between them. */
const CUT_BETWEEN: { pair: [string, string]; whyCut: string }[] = [
  { pair: ["bật", "pin"], whyCut: "đèn" },
  { pair: ["tắt", "pin"], whyCut: "đèn" },
];
const QUANTIFIERS = new Set(["những", "các", "mấy", "vài", "mỗi", "từng", "mọi"]);
const DEMONSTRATIVES = new Set(["này", "kia", "đó", "ấy", "nọ"]);
const USAGE_COPY_SIMILARITY = 0.8;

function hardRule(tokens: Token[], card: Card): string | null {
  const syllables = tokens.map((token) => token.syllable);
  for (const rule of BOUND) {
    for (let index = 0; index < syllables.length; index += 1) {
      if (syllables[index] !== rule.syllable) continue;
      const before = syllables[index - 1];
      const after = syllables.slice(index + 1, index + 3);
      if (before && rule.headBefore.includes(before) && !tokens[index - 1]!.edge) continue;
      if (after.some((syllable) => rule.orAfter.includes(syllable))) continue;
      return `"${rule.syllable}" without "${rule.whyCut}"`;
    }
  }
  for (let index = 0; index + 1 < tokens.length; index += 1) {
    const [left, right] = [syllables[index]!, syllables[index + 1]!];
    if (tokens[index]!.edge) continue;
    const cut = CUT_BETWEEN.find((rule) => rule.pair[0] === left && rule.pair[1] === right);
    if (cut) return `"${left} ${right}": "${cut.whyCut}" cut from between`;
    if (QUANTIFIERS.has(left) && DEMONSTRATIVES.has(right))
      return `"${left} ${right}": quantifier with no noun`;
  }
  const roots = meaningRoots(String(card.meaningVi ?? ""));
  const usages = Array.isArray(card.usage) ? (card.usage as { vi?: unknown }[]) : [];
  for (const usage of usages) {
    const line = plain(String(usage?.vi ?? ""));
    for (const root of roots) {
      if (!containsRun(line, root)) continue;
      if (similarity(syllables, withoutRun(line, root)) >= USAGE_COPY_SIMILARITY) {
        return `its own usage line with "${root.join(" ")}" removed`;
      }
    }
  }
  return null;
}

/** Where the meaning's root was most likely cut out, or null. */
function gapOf(
  tokens: Token[],
  card: Card,
  bigrams: ReturnType<typeof buildBigrams>,
): string | null {
  const syllables = tokens.map((token) => token.syllable);
  const roots = meaningRoots(String(card.meaningVi ?? ""));
  if (roots.some((root) => containsRun(syllables, root))) return null;
  let best: { score: number; where: string } | null = null;
  for (const root of roots) {
    const [first, last] = [root[0]!, root[root.length - 1]!];
    for (let index = 1; index < tokens.length; index += 1) {
      const previous = tokens[index - 1]!;
      if (previous.edge) continue;
      const next = syllables[index]!;
      const own = tokens.filter(
        (token, at) =>
          !token.edge && token.syllable === previous.syllable && syllables[at + 1] === next,
      ).length;
      if (bigrams.bigram(previous.syllable, next) - own > 0) continue;
      const left =
        bigrams.bigram(previous.syllable, first) + 3 * bigrams.join(previous.syllable, first);
      const right = bigrams.bigram(last, next) + 3 * bigrams.join(last, next);
      if (left < 1 || right < 1) continue;
      const score = Math.min(left, right);
      if (!best || score > best.score)
        best = { score, where: `${previous.syllable} [${root.join(" ")}] ${next}` };
    }
  }
  return best?.where ?? null;
}

// ── Ledger ───────────────────────────────────────────────────────────────────

type Verdict = "ok" | "broken";
type LedgerEntry = { id: string; field: string; text: string; verdict: Verdict; note?: string };

/** A verdict is on the words, so a mark or join edited later keeps it. */
const ledgerKey = (id: string, field: string, text: string) =>
  `${id}\u0001${field}\u0001${plain(text).join(" ")}`;

const ledgerEntries = (JSON.parse(readFileSync(LEDGER, "utf8")) as { entries: LedgerEntry[] })
  .entries;
const ledger = new Map<string, Verdict>();
for (const entry of ledgerEntries) {
  check(
    `ledger entry ${entry.id} ${entry.field} has a known verdict`,
    entry.verdict === "ok" || entry.verdict === "broken",
  );
  ledger.set(ledgerKey(entry.id.toLowerCase(), entry.field, entry.text), entry.verdict);
}

// ── Run ──────────────────────────────────────────────────────────────────────

// Restate the tokenizer's contract so a regression cannot pass silently.
{
  check(
    "tokenize drops marks, joins and phrase edges",
    plain("Hè này, tôi | ra hồ /trường_học/ sải mỗi=sáng.").join(" ") ===
      "hè này tôi ra hồ trường học sải mỗi sáng",
  );
  check(
    "a meaning's light syllables are not its root",
    JSON.stringify(meaningRoots("môn bơi")) === '[["bơi"]]',
  );
}

const allDecks = deckFiles(DATA);
const englishDecks = [join(DATA, "catalog.json"), ...deckFiles(join(DATA, "packs"))];
const bigrams = buildBigrams(allDecks);

// The swimming card as first shipped is the defect this file exists for.
{
  const swimming: Card = { meaningVi: "môn bơi", usage: [] };
  const cut = tokenize("Hè này, tôi | ra hồ /trường_học/ sải mỗi=sáng.");
  check("the original swimming lead breaks a hard rule", hardRule(cut, swimming) !== null);
  check("the original swimming lead is a gap candidate", gapOf(cut, swimming, bigrams) !== null);
  const whole = tokenize("Hè này, tôi | ra hồ /trường_học/ | bơi sải mỗi=sáng.");
  check(
    "the fixed swimming lead passes",
    hardRule(whole, swimming) === null && gapOf(whole, swimming, bigrams) === null,
  );
}

let fields = 0;
const hard: string[] = [];
const knownBroken: string[] = [];
const unreviewed: string[] = [];
let reviewedOk = 0;

for (const file of englishDecks) {
  for (const card of cardsOf(file)) {
    const id = String(card.id ?? card.word ?? "").toLowerCase();
    for (const field of CLUE_FIELDS) {
      const text = card[field];
      if (typeof text !== "string" || text.trim() === "") continue;
      fields += 1;
      const where = `${relative(DATA, file)} ${id} ${field}: ${text}`;
      const verdict = ledger.get(ledgerKey(id, field, text));
      if (verdict === "broken") {
        knownBroken.push(where);
        continue;
      }
      const tokens = tokenize(text);
      const rule = hardRule(tokens, card);
      if (rule) {
        hard.push(`${where}  — ${rule}`);
        continue;
      }
      const gap = gapOf(tokens, card, bigrams);
      if (!gap) continue;
      if (verdict === "ok") reviewedOk += 1;
      else unreviewed.push(`${where}  — gap ${gap}`);
    }
  }
}

check(`the English deck has clue fields to check (${fields})`, fields > 10000);
for (const line of hard.slice(0, 10)) console.error(`  ${line}`);
check(`no clue breaks a hard rule (${hard.length})`, hard.length === 0);
for (const line of knownBroken.slice(0, 10)) console.error(`  known broken: ${line}`);
check(
  `known broken clues shipped (${knownBroken.length} of at most ${MAX_KNOWN_BROKEN_CLUES})`,
  knownBroken.length <= MAX_KNOWN_BROKEN_CLUES,
);
check(
  `unreviewed gap candidates (${unreviewed.length} of at most ${MAX_UNREVIEWED_CLUE_GAPS}; ${reviewedOk} reviewed ok)`,
  unreviewed.length <= MAX_UNREVIEWED_CLUE_GAPS,
);
if (LIST) for (const line of unreviewed) console.log(`  unreviewed: ${line}`);

console.log(checks.join("\n"));
if (process.exitCode) {
  console.error("\nwhole-clue guard FAILED");
} else {
  console.log(`\n${checks.length} whole-clue assertions passed`);
}
