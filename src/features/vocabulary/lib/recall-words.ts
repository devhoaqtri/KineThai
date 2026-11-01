/**
 * On-device copies of the words the reader has seen, for the memory sheet.
 *
 * The deck is server-only and word ids cannot be resolved (./saved-word-cache says why),
 * so the sheet has nothing to look a past word up in. It keeps its own small copy
 * instead, taken from the card when the view is logged: the headword, the gloss and one
 * example, never the clues. The reader only ever holds words the feed already showed
 * them, and a copy lives exactly as long as the word stays in the viewing history. The
 * gloss is kept for each reader language, since the UI language can change after the view.
 *
 * Exports: RECALL_WORDS_KEY, RecallWord, loadRecallWords, rememberRecallWord, recallMeaning,
 *   clearRecallWords, recallFallbackLabel
 * Depends on: ./history, ./locale (type), ./schema (types)
 */
import { loadHistory } from "./history";
import type { Locale } from "./locale";
import type { VocabularyWord } from "./schema";

export const RECALL_WORDS_KEY = "wordcrawler:recall-words:v1";

export type RecallWord = {
  word: string;
  /** The gloss in the Vietnamese base. */
  meaning: string;
  /** The gloss in the other reader languages, where the deck has one. */
  meanings?: Partial<Record<Locale, string>>;
  ipa?: string;
  pos?: string;
  /** Example sentence with its ____ answer blank. */
  example?: string;
};

/** A deck's `|` phrase breaks mean nothing outside the reader's line layout. */
const plainGloss = (text: string) => text.replace(/\s*\|\s*/g, " ").trim();

/**
 * Only what the deck authored in that language: reading through resolveClue would store its
 * Vietnamese fallback under the language's name.
 * @param word - The word on the card
 * @returns Its gloss per reader language, where the deck has one
 */
function otherMeanings(word: VocabularyWord): Partial<Record<Locale, string>> {
  const ja = plainGloss(word.meaningJP || word.localized?.ja?.def || "");
  const th = plainGloss(word.localized?.th?.def ?? "");
  return { ...(ja && { ja }), ...(th && { th }) };
}

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
    const meaning = plainGloss(word.meaningVi || word.defVi);
    const meanings = otherMeanings(word);
    const copy: RecallWord = {
      word: word.word,
      meaning,
      ...(Object.keys(meanings).length && { meanings }),
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

/**
 * @param copy - A stored copy
 * @param ui - The reader's language
 * @returns The gloss to show, the Vietnamese base when that language has none
 * @pure true
 */
export function recallMeaning(copy: RecallWord, ui: Locale): string {
  return copy.meanings?.[ui] ?? copy.meaning;
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
 * full store. Ids are headwords, some with a provider prefix, and a Japanese deck's end in
 * a school level, which must never reach a reader.
 * @param id - Word id
 * @returns A readable headword
 * @pure true
 */
export function recallFallbackLabel(id: string): string {
  return id.replace(/^vi-/, "").replace(/-j(?:prim|sec|high|coll)$/i, "");
}
