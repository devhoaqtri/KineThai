/**
 * On-device copies of the words the reader has seen, for the memory sheet.
 *
 * The deck is server-only and word ids cannot be resolved (./saved-word-cache says why),
 * so the sheet has nothing to look a past word up in. It keeps its own small copy
 * instead, taken from the card when the view is logged: the headword, the gloss and one
 * example, never the clues. The reader only ever holds words the feed already showed
 * them, and a copy lives exactly as long as the word stays in the viewing history.
 *
 * Exports: RECALL_WORDS_KEY, RecallWord, loadRecallWords, rememberRecallWord,
 *   clearRecallWords, recallFallbackLabel
 * Depends on: ./history, ./schema (types)
 */
import { loadHistory } from "./history";
import type { VocabularyWord } from "./schema";

export const RECALL_WORDS_KEY = "wordcrawler:recall-words:v1";

export type RecallWord = {
  word: string;
  meaning: string;
  ipa?: string;
  pos?: string;
  /** Example sentence with its ____ answer blank. */
  example?: string;
};

function isCopy(value: unknown): value is RecallWord {
  if (typeof value !== "object" || value === null) return false;
  const copy = value as RecallWord;
  return typeof copy.word === "string" && typeof copy.meaning === "string";
}

/** @returns Every stored copy by word id; empty when nothing usable is stored. */
export function loadRecallWords(): Record<string, RecallWord> {
  try {
    if (typeof localStorage === "undefined") return {};
    const raw = localStorage.getItem(RECALL_WORDS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, copy]) => isCopy(copy)));
  } catch {
    return {};
  }
}

/**
 * Keep a copy of a word the reader just stayed on, dropping copies whose word has left
 * the history. Never throws.
 * @param word - The word on the card
 * @param now - Reference time
 */
export function rememberRecallWord(word: VocabularyWord, now: number = Date.now()): void {
  try {
    if (typeof localStorage === "undefined") return;
    const history = loadHistory(now);
    const kept = Object.entries(loadRecallWords()).filter(([id]) => id in history);
    const example = word.usage[0]?.en;
    const copy: RecallWord = {
      word: word.word,
      meaning: word.meaningVi || word.defVi,
      ...(word.ipa && { ipa: word.ipa }),
      ...(word.pos && { pos: word.pos }),
      ...(example && { example }),
    };
    localStorage.setItem(
      RECALL_WORDS_KEY,
      JSON.stringify({ ...Object.fromEntries(kept), [word.id]: copy }),
    );
  } catch {
    // Quota or privacy mode — the sheet falls back to the id for this word.
  }
}

/** Forget every copy, alongside the history they belong to. Never throws. */
export function clearRecallWords(): void {
  try {
    localStorage.removeItem(RECALL_WORDS_KEY);
  } catch {
    // Ignore privacy-mode failures.
  }
}

/**
 * The best name for a word with no copy: one seen before copies existed, or lost to a
 * full store. Ids are headwords, some with a provider prefix.
 * @param id - Word id
 * @returns A readable headword
 * @pure true
 */
export function recallFallbackLabel(id: string): string {
  return id.replace(/^vi-/, "");
}
