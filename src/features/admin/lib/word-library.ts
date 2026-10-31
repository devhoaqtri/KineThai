/**
 * Finding one word among thousands: the search and ordering behind the word library.
 *
 * Search forgives what is awkward to type (accents, đ, a deck's layout marks), so `ban`
 * finds `bạn` and `ba lo` finds `ba_lô`. Results lead with the headword: an exact hit or a
 * share code first, then words starting with the query, then words containing it, and only
 * then words whose meaning or clues mention it.
 *
 * Exports: LANGUAGE_LABELS, LIBRARY_PAGE_SIZE, NO_LEVEL, foldText, plainText, searchWords,
 *   sortWords, LibrarySearchable
 * Depends on: target-language (type)
 */

import type { TargetLocale } from "@/features/vocabulary/lib/target-language";

export const LANGUAGE_LABELS: Record<TargetLocale, string> = {
  en: "English",
  zh: "Chinese",
  ko: "Korean",
  ja: "Japanese",
  fr: "French",
  de: "German",
  es: "Spanish",
};

/** Words on one page of a table. */
export const LIBRARY_PAGE_SIZE = 50;

/** The folder for a word with no level. */
export const NO_LEVEL = "none";

/** The fields search reads. */
export type LibrarySearchable = {
  id: string;
  word: string;
  meaningVi?: string;
  defVi?: string;
  leadVi?: string;
  anticipateVi?: string;
  shareCode?: string;
  usage?: readonly { en: string; vi?: string }[];
};

/**
 * Text as a person would type it: lower case, no accents, no deck layout marks.
 * @param text - any deck text
 * @returns The folded text
 * @pure true
 */
export function foldText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[_\u00a0|=/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Deck text as a reader sees it, without its layout marks.
 * @param text - stored deck text
 * @returns The sentence with `/emphasis/`, `|`, `=` and `_` resolved
 * @pure true
 */
export function plainText(text: string): string {
  return text
    .replace(/\/([^/]+)\//g, "$1")
    .replace(/\s*\|\s*/g, " ")
    .replace(/[=_]/g, " ");
}

type Folded = { head: string; meaning: string; rest: string };

const foldedWords = new WeakMap<object, Folded>();

function foldedOf(word: LibrarySearchable): Folded {
  let folded = foldedWords.get(word);
  if (!folded) {
    folded = {
      head: foldText(word.word),
      meaning: foldText(word.meaningVi ?? ""),
      rest: foldText(
        [
          word.defVi,
          word.leadVi,
          word.anticipateVi,
          ...(word.usage ?? []).flatMap((line) => [line.en, line.vi]),
        ]
          .filter(Boolean)
          .join(" "),
      ),
    };
    foldedWords.set(word, folded);
  }
  return folded;
}

function rank(word: LibrarySearchable, query: string, exact: string): number | null {
  const { head, meaning, rest } = foldedOf(word);
  if (
    head === query ||
    word.id.toLowerCase() === exact ||
    word.shareCode?.toLowerCase() === exact
  ) {
    return 0;
  }
  if (head.startsWith(query)) return 1;
  if (head.includes(query)) return 2;
  if (meaning.includes(query)) return 3;
  return rest.includes(query) ? 4 : null;
}

/**
 * Words matching a query, best first, keeping the given order within each rank.
 * @param words - the words to look through
 * @param query - what was typed
 * @returns Matching words; all of them for an empty query
 * @pure true
 */
export function searchWords<T extends LibrarySearchable>(words: readonly T[], query: string): T[] {
  const folded = foldText(query);
  if (!folded) return [...words];
  const exact = query.trim().toLowerCase();
  const ranked: { word: T; rank: number }[] = [];
  for (const word of words) {
    const found = rank(word, folded, exact);
    if (found !== null) ranked.push({ word, rank: found });
  }
  return ranked.sort((a, b) => a.rank - b.rank).map((entry) => entry.word);
}

/**
 * Alphabetical in the deck's own language, so a page number means the same thing every time.
 * @param words - the words to order
 * @param locale - the deck's language
 * @returns A sorted copy
 * @pure true
 */
export function sortWords<T extends { word: string }>(words: readonly T[], locale: string): T[] {
  const collator = new Intl.Collator(locale, { sensitivity: "base", numeric: true });
  return [...words].sort((a, b) => collator.compare(a.word, b.word));
}
