/**
 * Turn a WordCrawler Chinese batch into the deck shape the importer validates.
 *
 * The crawler writes its own card keys, not the ones docs/word-grammar-fields.md
 * specifies for zh: the counter sits in `measureWord` as {mw, pinyin, example}, the
 * separable-verb split in `separable` as {split, vi}, collocations pair a `zh` phrase
 * with its `vi` gloss, the Sino-Vietnamese reading is an object {reading, sameWord},
 * and two one-line learner notes (`toneNoteVi`, the tone sandhi rule, and `contrast`,
 * the confusable pair) compete for the deck's single `tipVi`. A file holds its batches
 * keyed by level ("HSK1" …), which is already a deck level of the HSK system.
 *
 * The clue texts arrive with their `_` joins and `/…/` marks already authored, so
 * `emphasisVi` is only a fallback: a page still dark gets a phrase marked where it can
 * be one connected word (./crawler-shared, markPhrase). Fields with no place in the
 * deck (`posDetail`, `register`) are dropped.
 *
 * Exports: isZhCrawlerBatch, fromZhCrawler
 * Depends on: ./crawler-shared
 */

import { crawlerId, markPhrase } from "./crawler-shared";

type CrawlerCard = {
  word: string;
  ipa?: string;
  usageEn?: string;
  usageVi?: string;
  emphasisVi?: string[];
  measureWord?: { mw?: string; pinyin?: string; example?: string } | null;
  separable?: { split?: string; vi?: string } | null;
  collocations?: { zh?: string; vi?: string }[] | null;
  contrast?: { word?: string; noteVi?: string } | null;
  toneNoteVi?: string;
  hanViet?: { reading?: string; sameWord?: boolean } | null;
  defVi?: string;
  leadVi?: string;
  anticipateVi?: string;
  [key: string]: unknown;
};

const BATCH_KEY = /^HSK[1-9]$/;
const DROPPED = [
  "usageEn",
  "usageVi",
  "emphasisVi",
  "measureWord",
  "separable",
  "collocations",
  "contrast",
  "toneNoteVi",
  "hanViet",
  "posDetail",
  "register",
];
/** Fields a fallback highlight may be marked in. */
const CLUE_FIELDS = ["defVi", "leadVi", "anticipateVi"] as const;

/** @returns Whether a parsed file is a crawler Chinese batch file. @pure true */
export function isZhCrawlerBatch(json: unknown): json is Record<string, CrawlerCard[]> {
  if (typeof json !== "object" || json === null || Array.isArray(json)) return false;
  const entries = Object.entries(json);
  return (
    entries.length > 0 &&
    entries.every(([key, value]) => BATCH_KEY.test(key) && Array.isArray(value))
  );
}

/**
 * The split pattern of a separable verb: the headword's characters matched in order
 * inside the split example, with "…" where material was inserted (打电话 in 打了个电话
 * → 打…电话). Falls back to the headword when no insertion is found.
 * @pure true
 */
function splitPattern(word: string, split: string): string {
  const chars = Array.from(word);
  const out: string[] = [];
  let at = 0;
  let ellipsis = false;
  for (const ch of chars) {
    const found = split.indexOf(ch, at);
    if (found === -1) return word;
    if (found > at && !ellipsis) {
      out.push("…");
      ellipsis = true;
    }
    out.push(ch);
    at = found + ch.length;
  }
  return ellipsis ? out.join("") : word;
}

/** The one beginner trap: the tone sandhi note, else the confusable pair. */
function tipOf(card: CrawlerCard): string | null {
  const tone = card.toneNoteVi?.trim();
  if (tone) return tone.replace(/^Đọc:\s*/, "");
  const note = card.contrast?.noteVi?.trim();
  return note || null;
}

function grammarOf(card: CrawlerCard): Record<string, unknown> {
  const mw = card.measureWord;
  const counter = mw?.mw ? `${mw.mw}${mw.pinyin ? ` ${mw.pinyin}` : ""}` : null;
  const split = card.separable?.split?.trim();
  const verbInfo = split ? { 离合词: `${splitPattern(card.word, split)} : ${split}` } : null;
  const collocations = (card.collocations ?? [])
    .map((pair) => ({ text: pair.zh?.trim() ?? "", vi: pair.vi?.trim() ?? "" }))
    .filter((pair) => pair.text);
  return {
    counter: counter || null,
    verbInfo,
    collocations: collocations.length ? collocations.slice(0, 4) : null,
    hanViet: card.hanViet?.reading?.trim() || null,
    tipVi: tipOf(card),
  };
}

/** Mark a fallback highlight in each clue page the deck left unmarked. */
function markUnlitPages(card: CrawlerCard, out: Record<string, unknown>): void {
  const phrases = card.emphasisVi ?? [];
  for (const field of CLUE_FIELDS) {
    const text = out[field];
    if (typeof text !== "string" || text.includes("/")) continue;
    for (const phrase of phrases) {
      const marked = markPhrase(text, phrase);
      if (!marked) continue;
      out[field] = marked;
      break;
    }
  }
}

/**
 * @param json A crawler Chinese batch file (see isZhCrawlerBatch)
 * @returns A deck: its words in batch order, ready for normalizeDeck
 * @pure true
 */
export function fromZhCrawler(json: Record<string, CrawlerCard[]>): {
  meta: { name: string };
  words: Record<string, unknown>[];
} {
  const words: Record<string, unknown>[] = [];
  for (const [batch, cards] of Object.entries(json)) {
    for (const card of cards) {
      const out: Record<string, unknown> = Object.fromEntries(
        Object.entries(card).filter(([key]) => !DROPPED.includes(key)),
      );
      out.id = crawlerId(card.ipa ?? "", card.word);
      out.level = batch;
      out.usage = card.usageEn ? [{ en: card.usageEn, vi: card.usageVi ?? "" }] : [];
      Object.assign(out, grammarOf(card));
      markUnlitPages(card, out);
      words.push(out);
    }
  }
  const batches = Object.keys(json);
  return {
    meta: { name: batches[0] + (batches.length > 1 ? `–${batches.at(-1)}` : "") },
    words,
  };
}
