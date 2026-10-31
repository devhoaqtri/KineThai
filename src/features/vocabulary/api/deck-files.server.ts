/**
 * Reading and changing one word in the deck files readers are served.
 *
 * Decks are read raw here, never from the loaded catalog: that one has already turned `_`
 * into no-break spaces, and writing it back would strip the marks generators rely on. A
 * save changes only that word, so a deck's diff stays a few lines.
 *
 * Only a machine with a writable disk can do this, which means `npm run dev`; the deployed
 * build has no writable filesystem, so a change reaches readers by commit and publish. A
 * deck imported again from word-crawler replaces these files, so a fix that must last
 * belongs in that deck too.
 *
 * English lives in data/packs/; the one word left in data/catalog.json belongs to the
 * workbench's publish step and is not written from here.
 *
 * Exports: DeckWordEdit, deckFilesWritable, readDeckWord, updateDeckWord
 * Depends on: node:fs/promises, node:crypto, ../lib/schema, ../lib/target-language (type)
 */

import { randomUUID } from "node:crypto";
import { access, constants, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { normalizeDeck, type VocabularyLevel } from "../lib/schema";
import type { TargetLocale } from "../lib/target-language";

const DATA_ROOT = resolve(process.cwd(), "src/features/vocabulary/data");

/** The fields the library can change. */
export type DeckWordEdit = {
  word?: string;
  meaningVi?: string;
  defVi?: string;
  leadVi?: string;
  anticipateVi?: string;
  ipa?: string;
  pos?: string;
  level?: VocabularyLevel;
  usage?: { en: string; vi: string }[];
};

type DeckWord = DeckWordEdit & { id: string; chars?: number; initial?: string };
type DeckFile = { levels?: string[]; words: DeckWord[] };

const folderFor = (locale: TargetLocale, root: string) =>
  join(root, locale === "en" ? "packs" : locale);

async function deckPaths(locale: TargetLocale, root: string): Promise<string[]> {
  const folder = folderFor(locale, root);
  const names = await readdir(folder);
  return names
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => join(folder, name));
}

async function findWord(locale: TargetLocale, id: string, root: string) {
  for (const path of await deckPaths(locale, root)) {
    const raw = await readFile(path, "utf8");
    const deck = JSON.parse(raw) as DeckFile;
    const index = deck.words.findIndex((word) => word.id === id);
    if (index >= 0) return { path, raw, deck, index };
  }
  return null;
}

// Saves are queued so two edits to one deck cannot each read it and overwrite the other.
let queue: Promise<unknown> = Promise.resolve();
function queued<T>(task: () => Promise<T>): Promise<T> {
  const next = queue.then(task, task);
  queue = next.catch(() => undefined);
  return next;
}

/**
 * @param locale - the deck's language
 * @returns False where deck files cannot be written, such as a Workers deployment
 */
export async function deckFilesWritable(
  locale: TargetLocale,
  root: string = DATA_ROOT,
): Promise<boolean> {
  try {
    await access(folderFor(locale, root), constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * One word exactly as its deck file stores it.
 * @param locale - the deck's language
 * @param id - the word
 * @returns The stored word and its file, or null where it has no deck file to read
 */
export async function readDeckWord(
  locale: TargetLocale,
  id: string,
  root: string = DATA_ROOT,
): Promise<{ word: DeckWord; file: string } | null> {
  try {
    const found = await findWord(locale, id, root);
    return found && { word: found.deck.words[found.index]!, file: relative(root, found.path) };
  } catch {
    return null;
  }
}

/**
 * Change one word, refusing the write if the file moved on or the deck would stop being valid.
 * @param locale - the deck's language
 * @param id - the word
 * @param edit - the fields to change
 * @param expected - those fields as the editor last saw them
 * @returns The stored word and its file
 */
export function updateDeckWord(
  locale: TargetLocale,
  id: string,
  edit: DeckWordEdit,
  expected: DeckWordEdit,
  root: string = DATA_ROOT,
): Promise<{ word: DeckWord; file: string }> {
  return queued(async () => {
    const found = await findWord(locale, id, root);
    if (!found) throw new Error(`"${id}" has no deck file to edit`);
    const { path, raw, deck, index } = found;
    const current = deck.words[index]!;
    for (const key of Object.keys(edit) as (keyof DeckWordEdit)[]) {
      if (JSON.stringify(current[key]) !== JSON.stringify(expected[key])) {
        throw new Error(
          "This word changed somewhere else since you opened it. Reopen it before saving.",
        );
      }
    }
    const next = { ...current, ...edit };
    deck.words[index] = next;
    const compiled = normalizeDeck(deck);
    const checked = compiled.words.find((word) => word.id === id.toLowerCase());
    // Worked out from the word when a deck compiles, and read straight from the file after.
    if (checked) deck.words[index] = { ...next, chars: checked.chars, initial: checked.initial };
    deck.levels = compiled.levels;
    const body = `${JSON.stringify(deck, null, 2)}${raw.endsWith("\n") ? "\n" : ""}`;
    const temporary = `${path}.${randomUUID()}.tmp`;
    await writeFile(temporary, body, "utf8");
    await rename(temporary, path);
    return { word: deck.words[index]!, file: relative(root, path) };
  });
}
