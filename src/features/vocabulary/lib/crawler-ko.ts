/**
 * Turn WordCrawler Korean batch files into the deck shape the importer validates.
 *
 * Each file is a bare array of cards, named for its level and batch (K101 is TOPIK 1,
 * batch 01). The crawler writes its own keys rather than the ones
 * docs/word-grammar-fields.md specifies for ko, so they are mapped here:
 *
 * - `blankKo`, the form that fills the example's blank (해요 for 하다) → `usage[].fill`
 * - `emphasisVi`, one phrase per clue field in the order defVi, leadVi, anticipateVi
 *   → a `/…/` mark in that field
 * - `irregularKo` + `politeKo` / `banmalKo` / `formalKo` → `verbInfo` {활용, 활용형}
 * - `honorificKo` → `honorific` {높임말}, only when it is a form of its own (먹다 → 드시다);
 *   the regular -(으)시- form (알다 → 아시다) is not one
 * - `counterKo` ("사람 세 명") → `counter` ("명"); `hanjaKo` / `hanVietVi` → `hanja` / `hanViet`
 * - `pronKo` ("[읻따]") rides after the romanization in `ipa`; `registerVi` → `tipVi`
 *
 * `classKo`, `particleKo`, `counterNum`, `originKo` and `pairKo` have no place in the
 * deck and are dropped. A card the crawler left empty is skipped, and a headword that
 * repeats (a second sense of 일) keeps its first sense only: a deck holds one card per
 * headword.
 *
 * Exports: isKoCrawlerCards, fromKoCrawler
 * Depends on: ./crawler-shared
 */

import { crawlerId, markPhrase } from "./crawler-shared";

type CrawlerCard = Record<string, unknown> & { word: string };

/** A batch file's name: K, the TOPIK level, then the batch number. */
const BATCH_NAME = /(?:^|[^a-z0-9])k([1-6])\d{2}(?=[^a-z0-9]|$)/i;
const MARKED_FIELDS = ["defVi", "leadVi", "anticipateVi"] as const;
const IRREGULAR: Record<string, string> = {
  ㅂ: "ㅂ 불규칙",
  ㄷ: "ㄷ 불규칙",
  ㅅ: "ㅅ 불규칙",
  ㅎ: "ㅎ 불규칙",
  르: "르 불규칙",
  ㄹ: "ㄹ 탈락",
  으: "으 탈락",
};
const CONJUGATING = new Set(["동사", "형용사"]);

/** @returns Whether a parsed file is a crawler Korean batch (a card array with Korean keys). @pure true */
export function isKoCrawlerCards(json: unknown): json is CrawlerCard[] {
  return (
    Array.isArray(json) &&
    json.length > 0 &&
    json.every((card) => typeof card === "object" && card !== null && "classKo" in card)
  );
}

function text(card: CrawlerCard, key: string): string {
  const value = card[key];
  return typeof value === "string" ? value.trim() : "";
}

/** A Hangul syllable's initial consonant and vowel, without its final consonant. */
function openSyllable(char: string): number {
  return Math.floor((char.codePointAt(0)! - 0xac00) / 28);
}

/**
 * Whether an honorific is only the regular -(으)시- form of a verb (알다 → 아시다,
 * 덥다 → 더우시다, 들다 → 드시다), which a learner builds without being told.
 */
function isRegularHonorific(word: string, honorific: string): boolean {
  if (!word.endsWith("다") || !honorific.endsWith("시다")) return false;
  const stem = Array.from(word.slice(0, -1));
  let head = honorific.slice(0, -2);
  if (head.length > stem.length && /[으우]$/.test(head)) head = head.slice(0, -1);
  const form = Array.from(head);
  if (form.length !== stem.length) return false;
  const last = stem.length - 1;
  return form.every((char, index) =>
    index < last ? char === stem[index] : openSyllable(char) === openSyllable(stem[index]!),
  );
}

function grammarOf(card: CrawlerCard): Record<string, unknown> {
  const counter = text(card, "counterKo").split(/\s+/).at(-1) || null;
  const hanja = text(card, "hanjaKo") || null;
  let verbInfo: Record<string, unknown> | null = null;
  if (CONJUGATING.has(text(card, "classKo"))) {
    const forms = Object.fromEntries(
      [
        ["해요체", text(card, "politeKo")],
        ["반말", text(card, "banmalKo")],
        ["합쇼체", text(card, "formalKo")],
      ].filter(([, form]) => form),
    );
    verbInfo = {
      활용: IRREGULAR[text(card, "irregularKo")] ?? "규칙",
      ...(Object.keys(forms).length && { 활용형: forms }),
    };
  }
  const honorific = text(card, "honorificKo");
  return {
    counter,
    hanja,
    hanViet: hanja ? text(card, "hanVietVi") || null : null,
    verbInfo,
    honorific:
      honorific && !isRegularHonorific(card.word, honorific) ? { 높임말: honorific } : null,
    tipVi: text(card, "registerVi") || null,
  };
}

const DROPPED = new Set([
  "usageEn",
  "usageVi",
  "emphasisVi",
  "blankKo",
  "pronKo",
  "classKo",
  "politeKo",
  "particleKo",
  "counterKo",
  "counterNum",
  "irregularKo",
  "honorificKo",
  "banmalKo",
  "formalKo",
  "registerVi",
  "originKo",
  "pairKo",
  "hanjaKo",
  "hanVietVi",
]);

/**
 * @param batches Each batch file's name (for its level) and its parsed cards
 * @returns The deck, plus the headwords skipped as empty and the repeated senses dropped
 * @pure true
 */
export function fromKoCrawler(batches: { name: string; cards: CrawlerCard[] }[]): {
  meta: { name: string };
  words: Record<string, unknown>[];
  skipped: string[];
  dropped: string[];
} {
  const words: Record<string, unknown>[] = [];
  const skipped: string[] = [];
  const dropped: string[] = [];
  const seen = new Set<string>();
  for (const { name, cards } of batches) {
    const match = BATCH_NAME.exec(name);
    if (!match) throw new Error(`${name}: expected a batch name like K101 (K, TOPIK level, batch)`);
    const level = `TOPIK${match[1]}`;
    for (const card of cards) {
      const word = card.word.normalize("NFC").trim();
      if (!text(card, "defVi") || !text(card, "usageEn")) {
        skipped.push(word);
        continue;
      }
      if (seen.has(word)) {
        dropped.push(`${word} (${text(card, "meaningVi")})`);
        continue;
      }
      seen.add(word);
      const out: Record<string, unknown> = Object.fromEntries(
        Object.entries(card).filter(([key]) => !DROPPED.has(key)),
      );
      const pronunciation = text(card, "pronKo");
      out.ipa = [text(card, "ipa"), pronunciation].filter(Boolean).join(" ");
      out.id = crawlerId(text(card, "ipa"), word);
      out.level = level;
      const fill = text(card, "blankKo");
      out.usage = [
        {
          en: text(card, "usageEn"),
          vi: text(card, "usageVi"),
          ...(fill && fill !== word && { fill }),
        },
      ];
      Object.assign(out, grammarOf(card));
      const phrases = Array.isArray(card.emphasisVi) ? (card.emphasisVi as unknown[]) : [];
      MARKED_FIELDS.forEach((field, index) => {
        const phrase = phrases[index];
        if (typeof phrase !== "string" || typeof out[field] !== "string") return;
        const marked = markPhrase(out[field] as string, phrase);
        if (marked) out[field] = marked;
      });
      words.push(out);
    }
  }
  const names = batches.map((batch) => BATCH_NAME.exec(batch.name)![0].replace(/^[^kK]/, ""));
  return {
    meta: { name: `TOPIK ${names[0]}${names.length > 1 ? `–${names.at(-1)}` : ""}` },
    words,
    skipped,
    dropped,
  };
}
