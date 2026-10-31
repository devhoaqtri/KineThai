/**
 * Turn a WordCrawler Japanese batch into the deck shape the importer validates.
 *
 * The crawler writes its own card keys, not the ones docs/word-grammar-fields.md
 * specifies for ja: the reading sits in `kana` (with romaji in `ipa`), the grammar is
 * flat (`verbGroup`, `adjType`, `transitivity`, `transPair`, `keigo`), the conjugated form
 * that fills an example's blank is `usageForm`, and the highlight is a phrase in
 * `emphasisVi` rather than a `/…/` mark in the text. A file holds several batches keyed
 * by name ("N501" … "N505"), and the JLPT level is the batch name's first two characters.
 *
 * Fields with no place in the deck (`register`, `pitchAccent`, `kanjiReadings`) are
 * dropped.
 *
 * Exports: isJaCrawlerBatch, fromJaCrawler
 * Depends on: ./crawler-shared
 */

import { crawlerId, markPhrase } from "./crawler-shared";

type CrawlerCard = {
  word: string;
  ipa?: string;
  kana?: string;
  usageEn?: string;
  usageVi?: string;
  usageForm?: string;
  emphasisVi?: string[];
  verbGroup?: string;
  adjType?: string;
  transitivity?: string;
  transPair?: string;
  keigo?: { sonkei?: string; kenjou?: string };
  counter?: string;
  hanViet?: string;
  defVi?: string;
  leadVi?: string;
  anticipateVi?: string;
  [key: string]: unknown;
};

const BATCH_KEY = /^N([1-5])\d*$/;
const HAN = /\p{Script=Han}/u;

const VERB_GROUP: Record<string, string> = {
  五段: "五段動詞",
  一段: "一段動詞",
  する: "サ変動詞",
  くる: "カ変動詞",
  来る: "カ変動詞",
};
const ADJ_TYPE: Record<string, string> = { い: "い形容詞", な: "な形容詞" };
const TRANSITIVITY: Record<string, string> = { 自: "自動詞", 他: "他動詞" };
const DROPPED = [
  "kana",
  "usageEn",
  "usageVi",
  "usageForm",
  "emphasisVi",
  "verbGroup",
  "adjType",
  "transitivity",
  "transPair",
  "keigo",
  "register",
  "pitchAccent",
  "kanjiReadings",
];
/** Fields the highlight may sit in, in the order one is chosen. */
const MARKED_FIELDS = ["defVi", "leadVi", "anticipateVi"] as const;

/** @returns Whether a parsed file is a crawler Japanese batch file. @pure true */
export function isJaCrawlerBatch(json: unknown): json is Record<string, CrawlerCard[]> {
  if (typeof json !== "object" || json === null || Array.isArray(json)) return false;
  const entries = Object.entries(json);
  return (
    entries.length > 0 &&
    entries.every(([key, value]) => BATCH_KEY.test(key) && Array.isArray(value))
  );
}

/** A stable id: the romaji, then a fingerprint of the headword (see crawlerId). */
function cardId(card: CrawlerCard): string {
  return crawlerId(card.ipa ?? "", card.word);
}

/** Mark the highlight phrase in the first field that holds it as one word. */
function markHighlight(card: CrawlerCard, out: Record<string, unknown>): void {
  const phrase = card.emphasisVi?.[0];
  if (!phrase) return;
  for (const field of MARKED_FIELDS) {
    const marked = typeof out[field] === "string" ? markPhrase(out[field] as string, phrase) : null;
    if (!marked) continue;
    out[field] = marked;
    return;
  }
}

function grammarOf(card: CrawlerCard): Record<string, unknown> {
  const verbInfo: Record<string, string> = {};
  const kind = VERB_GROUP[card.verbGroup ?? ""] ?? ADJ_TYPE[card.adjType ?? ""];
  if (kind) verbInfo["種類"] = kind;
  const transitivity = TRANSITIVITY[card.transitivity ?? ""];
  if (transitivity) {
    verbInfo["自他"] = card.transPair ? `${transitivity} ↔ ${card.transPair}` : transitivity;
  }
  const honorific: Record<string, string> = {};
  if (card.keigo?.sonkei) honorific["尊敬語"] = card.keigo.sonkei;
  if (card.keigo?.kenjou) honorific["謙譲語"] = card.keigo.kenjou;
  return {
    counter: card.counter || null,
    hanViet: card.hanViet || null,
    verbInfo: Object.keys(verbInfo).length ? verbInfo : null,
    honorific: Object.keys(honorific).length ? honorific : null,
  };
}

/**
 * @param json A crawler Japanese batch file (see isJaCrawlerBatch)
 * @returns A deck: its words in batch order, ready for normalizeDeck
 * @pure true
 */
export function fromJaCrawler(json: Record<string, CrawlerCard[]>): {
  meta: { name: string };
  words: Record<string, unknown>[];
} {
  const words: Record<string, unknown>[] = [];
  for (const [batch, cards] of Object.entries(json)) {
    const level = `N${BATCH_KEY.exec(batch)![1]}`;
    for (const card of cards) {
      const out: Record<string, unknown> = Object.fromEntries(
        Object.entries(card).filter(([key]) => !DROPPED.includes(key)),
      );
      // The reading in hiragana, as the Chinese deck carries pinyin. A word written in
      // kana already shows its reading, so it keeps the romaji instead.
      out.ipa = HAN.test(card.word) && card.kana ? card.kana : (card.ipa ?? "");
      out.id = cardId(card);
      out.level = level;
      const fill = card.usageForm && card.usageForm !== card.word ? card.usageForm : undefined;
      out.usage = card.usageEn
        ? [{ en: card.usageEn, vi: card.usageVi ?? "", ...(fill && { fill }) }]
        : [];
      Object.assign(out, grammarOf(card));
      markHighlight(card, out);
      words.push(out);
    }
  }
  const batches = Object.keys(json);
  return {
    meta: { name: `JLPT ${batches[0]}${batches.length > 1 ? `–${batches.at(-1)}` : ""}` },
    words,
  };
}
