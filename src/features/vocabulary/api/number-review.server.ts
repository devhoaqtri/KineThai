/**
 * The English deck's unsure numbers, and a person's choice for each (/admin/numbers).
 *
 * The number scan (../lib/worded-numbers) writes digits only where a number is certain and
 * leaves the rest `unsure`: "bài ba" (a label), "hai bạn" (two friends, or you two), a
 * number inside a highlight mark. Here each unsure hit is shown with the sentence it would
 * become, and the choice is kept in scripts/data/worded-number-decisions.json so it is
 * asked once. "number" writes the digits into the pack file at once, through
 * updateDeckWord, so the write is checked and queued like any library edit; "word" leaves
 * the text. Choosing "word" after "number" puts the words back, as long as the field
 * still reads the way the write left it.
 *
 * A clue whose words change carries its clue-review verdict along
 * (scripts/data/clue-review-ledger.json), as the bulk scan does, so a reviewed clue never
 * becomes an unreviewed gap candidate.
 *
 * Writing needs `npm run dev`: a deployment has no deck files to write, so it lists
 * nothing. A word-crawler re-import replaces the packs; scripts/scan-worded-numbers.ts
 * --apply writes the "number" choices again.
 *
 * Exports: NumberChoice, NumberReviewItem, NumberReview, listNumberReview, decideNumber,
 *   DECISIONS_FILE
 * Depends on: node:fs/promises, ./deck-files.server, ../lib/worded-numbers
 */

import { randomUUID } from "node:crypto";
import { readFile, readdir, rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { applyHit, plainWords, scanCard, type Hit, type StoredCard } from "../lib/worded-numbers";
import { deckFilesWritable, updateDeckWord, type DeckWordEdit } from "./deck-files.server";

export type NumberChoice = "number" | "word";

export type NumberReviewItem = {
  /** The hit's key: deck, card, field, the words around it and which occurrence. */
  key: string;
  /** The pack file, as packs/en-a1.json. */
  deck: string;
  id: string;
  /** The English headword. */
  word: string;
  level: string;
  /** meaningVi, defVi, leadVi, anticipateVi or usage[0].vi. */
  field: string;
  /** The field with the number words, as stored. */
  before: string;
  /** The field with the digits. */
  after: string;
  /** Where the number words sit in `before`. */
  start: number;
  end: number;
  words: string;
  digits: string;
  /** Why the scan could not decide. */
  reason: string;
  /** The words sit inside a `/…/` highlight mark. */
  inMark: boolean;
  /** What a person chose, or null while it waits. */
  choice: NumberChoice | null;
  /** The field reads as the choice left it, so the other choice can still be made. */
  current: boolean;
};

export type NumberReview = {
  items: NumberReviewItem[];
  /** False where decks cannot be written: choices need `npm run dev`. */
  writable: boolean;
};

type Decision = {
  key: string;
  deck: string;
  id: string;
  field: string;
  words: string;
  digits: string;
  choice: NumberChoice;
  before: string;
  after: string;
  at: string;
};

type DecisionLedger = { about: string; entries: Decision[] };

type ClueLedger = { entries: Array<{ id: string; field: string; text: string }> };

/** Repository-relative, so a script and the server name the same file. */
export const DECISIONS_FILE = "scripts/data/worded-number-decisions.json";
const CLUE_LEDGER_FILE = "scripts/data/clue-review-ledger.json";
const CLUE_FIELDS = new Set(["defVi", "leadVi", "anticipateVi"]);
const ABOUT =
  "Choices made at /admin/numbers on the English deck's unsure number words " +
  "(src/features/vocabulary/lib/worded-numbers.ts). number: the words were written as " +
  "digits; word: they stay words. Keyed by card, field and the words around the number. " +
  "scripts/scan-worded-numbers.ts --apply writes the number choices again after a re-import.";

type Card = StoredCard & {
  id: string;
  word?: string;
  level?: string;
  usage?: { en: string; vi: string }[];
};
type Deck = { words: Card[] };

const dataRoot = (root: string) => join(root, "src/features/vocabulary/data");

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}

// Choices are queued so two taps cannot each read the ledger and overwrite the other.
let queue: Promise<unknown> = Promise.resolve();
function queued<T>(task: () => Promise<T>): Promise<T> {
  const next = queue.then(task, task);
  queue = next.catch(() => undefined);
  return next;
}

async function packNames(root: string): Promise<string[]> {
  const names = await readdir(join(dataRoot(root), "packs"));
  return names.filter((name) => /^en-.*\.json$/.test(name)).sort();
}

/** The text in one field path (defVi, usage[0].vi). */
function fieldText(card: Card, field: string): string | undefined {
  const usage = /^usage\[(\d+)\]\.vi$/.exec(field);
  const value = usage ? card.usage?.[Number(usage[1])]?.vi : card[field];
  return typeof value === "string" ? value : undefined;
}

/** The library edit that sets one field path, and what that edit expects to find. */
function fieldEdit(
  card: Card,
  field: string,
  from: string,
  to: string,
): { edit: DeckWordEdit; expected: DeckWordEdit } {
  const usage = /^usage\[(\d+)\]\.vi$/.exec(field);
  if (usage) {
    const index = Number(usage[1]);
    const lines = (card.usage ?? []) as { en: string; vi: string }[];
    const expected = lines.map((line, at) => (at === index ? { ...line, vi: from } : line));
    return {
      edit: { usage: lines.map((line, at) => (at === index ? { ...line, vi: to } : line)) },
      expected: { usage: expected },
    };
  }
  return { edit: { [field]: to }, expected: { [field]: from } };
}

function itemOf(deck: string, card: Card, hit: Hit, choice: NumberChoice | null): NumberReviewItem {
  return {
    key: hit.key,
    deck,
    id: card.id,
    word: String(card.word ?? ""),
    level: String(card.level ?? ""),
    field: hit.field,
    before: hit.text,
    after: applyHit(hit.text, hit),
    start: hit.start,
    end: hit.end,
    words: hit.words,
    digits: hit.digits!,
    reason: hit.reason,
    inMark: hit.reason.startsWith("inside a /"),
    choice,
    current: true,
  };
}

/** Whether a place in deck text sits inside a `/…/` highlight mark. */
const insideMark = (text: string, at: number) =>
  (text.slice(0, at).match(/\//g)?.length ?? 0) % 2 === 1;

/** The item a "number" choice left behind, once its words are digits. */
function writtenItem(card: Card, decision: Decision): NumberReviewItem {
  const start = decision.before.indexOf(decision.words);
  return {
    key: decision.key,
    deck: decision.deck,
    id: card.id,
    word: String(card.word ?? ""),
    level: String(card.level ?? ""),
    field: decision.field,
    before: decision.before,
    after: decision.after,
    start,
    end: start + decision.words.length,
    words: decision.words,
    digits: decision.digits,
    reason: "written as digits",
    inMark: start >= 0 && insideMark(decision.before, start),
    choice: "number",
    current: fieldText(card, decision.field) === decision.after,
  };
}

/**
 * Every unsure number in the English packs, with any choice already made.
 * @param root - the repository (tests pass a scratch copy)
 * @returns The items in deck order, and whether choices can be written here
 */
export async function listNumberReview(root: string = process.cwd()): Promise<NumberReview> {
  const writable = await deckFilesWritable("en", dataRoot(root));
  let names: string[];
  try {
    names = await packNames(root);
  } catch {
    return { items: [], writable: false };
  }
  const ledger = await readJson<DecisionLedger>(join(root, DECISIONS_FILE), {
    about: ABOUT,
    entries: [],
  });
  const decisions = new Map(ledger.entries.map((entry) => [entry.key, entry]));
  const items: NumberReviewItem[] = [];
  for (const name of names) {
    const deck = `packs/${name}`;
    const { words } = await readJson<Deck>(join(dataRoot(root), "packs", name), { words: [] });
    for (const card of words) {
      const hits = scanCard(deck, card);
      const seen = new Set<string>();
      for (const hit of hits) {
        if (hit.verdict !== "unsure" || hit.digits === undefined) continue;
        seen.add(hit.key);
        const decided = decisions.get(hit.key);
        // A "number" choice whose words came back (a re-import) waits to be written again.
        items.push(itemOf(deck, card, hit, decided?.choice === "word" ? "word" : null));
      }
      for (const decision of ledger.entries) {
        if (decision.deck !== deck || decision.id !== card.id) continue;
        if (decision.choice === "number" && !seen.has(decision.key)) {
          items.push(writtenItem(card, decision));
        }
      }
    }
  }
  return { items, writable };
}

/** Move a reviewed clue's verdict along with its new words. */
async function moveClueVerdict(root: string, id: string, field: string, from: string, to: string) {
  if (!CLUE_FIELDS.has(field)) return;
  const path = join(root, CLUE_LEDGER_FILE);
  const ledger = await readJson<ClueLedger | null>(path, null);
  if (!ledger) return;
  let moved = false;
  for (const entry of ledger.entries) {
    if (
      entry.id.toLowerCase() === id.toLowerCase() &&
      entry.field === field &&
      plainWords(entry.text) === plainWords(from)
    ) {
      entry.text = to;
      moved = true;
    }
  }
  if (moved) await writeJson(path, ledger);
}

/**
 * Record a choice for one unsure number, writing or unwriting its digits.
 * @param input.key - the item's key
 * @param input.choice - "number" writes the digits, "word" keeps (or restores) the words
 * @param input.expected - the field as the page showed it, so a stale page cannot overwrite
 * @param root - the repository (tests pass a scratch copy)
 * @returns The item as it now stands
 */
export function decideNumber(
  input: { key: string; choice: NumberChoice; expected: string },
  root: string = process.cwd(),
): Promise<NumberReviewItem> {
  return queued(async () => {
    const { key, choice, expected } = input;
    const [deck, id, field] = key.split("|");
    if (!deck?.startsWith("packs/en-") || !id || !field) throw new Error("Unknown number key");
    if (!(await deckFilesWritable("en", dataRoot(root)))) {
      throw new Error("This server cannot write decks. Decide numbers with `npm run dev` locally.");
    }
    const name = deck.slice("packs/".length);
    const path = join(dataRoot(root), "packs", name);
    // Paths come from the key, so make sure it names a pack and nothing else.
    if (resolve(path) !== resolve(dataRoot(root), "packs", name) || name.includes("/")) {
      throw new Error("Unknown number key");
    }
    const { words } = await readJson<Deck>(path, { words: [] });
    const card = words.find((entry) => entry.id === id);
    if (!card) throw new Error(`"${id}" is not in ${deck}`);
    const text = fieldText(card, field);
    if (text === undefined) throw new Error(`"${id}" has no ${field}`);
    if (text !== expected) {
      throw new Error("This sentence changed since the page loaded. Reload and decide again.");
    }

    const ledgerPath = join(root, DECISIONS_FILE);
    const ledger = await readJson<DecisionLedger>(ledgerPath, { about: ABOUT, entries: [] });
    const previous = ledger.entries.find((entry) => entry.key === key);
    const hit = scanCard(deck, card).find((candidate) => candidate.key === key);

    let decision: Decision;
    if (hit && hit.digits !== undefined) {
      // The words are there: write the digits, or just note that they stay.
      const after = applyHit(text, hit);
      if (choice === "number" && insideMark(text, hit.start)) {
        // A digit is never half of a highlight: the gate refuses a lone digit and the
        // English mark grade refuses number + unit, so the page would go dark or weak.
        throw new Error(
          "This number is inside a highlight mark, so digits would break the highlight. Keep the words, or move the mark to another word in the library first.",
        );
      }
      if (choice === "number") {
        const { edit, expected: was } = fieldEdit(card, field, text, after);
        await updateDeckWord("en", id, edit, was, dataRoot(root));
        await moveClueVerdict(root, id, field, text, after);
      }
      decision = {
        key,
        deck,
        id,
        field,
        words: hit.words,
        digits: hit.digits,
        choice,
        before: text,
        after,
        at: new Date().toISOString(),
      };
    } else if (previous?.choice === "number" && text === previous.after) {
      // Already digits by an earlier choice: "word" puts the words back.
      if (choice === "word") {
        const { edit, expected: was } = fieldEdit(card, field, text, previous.before);
        await updateDeckWord("en", id, edit, was, dataRoot(root));
        await moveClueVerdict(root, id, field, text, previous.before);
      }
      decision = { ...previous, choice, at: new Date().toISOString() };
    } else {
      throw new Error("This number is no longer in the sentence. Reload the list.");
    }

    ledger.about = ABOUT;
    ledger.entries = [...ledger.entries.filter((entry) => entry.key !== key), decision];
    await writeJson(ledgerPath, ledger);

    const stored = (await readJson<Deck>(path, { words: [] })).words.find(
      (entry) => entry.id === id,
    )!;
    const fresh = scanCard(deck, stored).find((candidate) => candidate.key === key);
    return fresh && fresh.digits !== undefined
      ? itemOf(deck, stored, fresh, choice === "word" ? "word" : null)
      : writtenItem(stored, decision);
  });
}
