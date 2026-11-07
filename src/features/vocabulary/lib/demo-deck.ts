/**
 * The first-visit demo plays a short list of hand-picked words that ships with the page, not
 * the server's stream.
 *
 * A newcomer should see a word the moment the page is up. The feed's first page comes from
 * /api/public/vocabulary, and a server that has just woken parses every deck before it can
 * answer: measured at 2–3 s on the live site, the longest wait a newcomer ever has. So the
 * demo carries its own words, a dozen per language on one theme (hello, welcome, start,
 * begin, first, new, learn…), each a fair first guess from the deck's easiest track. They
 * page in the browser through lib/paging, like an imported pack, so the shuffle and the
 * endless loop are the feed's own.
 *
 * The words themselves are copies taken from the decks by `npm run demo:decks`, one small
 * JSON file per language in features/vocabulary/demo/, loaded on demand so a host downloads
 * only its own language. demo-deck.test.ts fails when a copy differs from its deck, so a
 * deck edit is followed by a fresh `npm run demo:decks`. A copy cannot follow a word that
 * readers report off the feed (word-block runs on the server), so these words are picked by
 * hand and kept few.
 *
 * Exports: DEMO_WORD_IDS, MIN_DEMO_WORDS, MAX_DEMO_WORDS, loadDemoDeck, readDemoPage
 * Depends on: ./paging, ./level-ladder, ./word-joiner, ./schema (type), ./target-language (type)
 */

import { levelLadderFor } from "./level-ladder";
import { readCatalogPage } from "./paging";
import type { Catalog } from "./schema";
import type { TargetLocale } from "./target-language";
import { withWordJoiners } from "./word-joiner";
import type { FeedPage, FeedRequest } from "../types";

/** Fewest words a demo list holds: below this the loop repeats a word too soon. */
export const MIN_DEMO_WORDS = 5;

/** Most words a demo list holds. It ships to every newcomer, so it stays a sample. */
export const MAX_DEMO_WORDS = 12;

/**
 * The demo's words, per deck, by word id: greetings and beginnings first, then learning and
 * a few easy everyday verbs and adjectives. Each must sit in its deck's easiest track
 * (demoDifficulty), which demo-deck.test.ts checks.
 */
export const DEMO_WORD_IDS: Record<TargetLocale, readonly string[]> = {
  en: [
    "vi-hello",
    "vi-welcome",
    "vi-start",
    "vi-begin",
    "vi-first",
    "vi-new",
    "vi-learn",
    "vi-lesson",
    "vi-try",
    "vi-ready",
    "vi-easy",
    "vi-open",
  ],
  zh: [
    "huanying-bf7e2e",
    "renshi-acac5b",
    "xin-b59b20",
    "shengci-9dadb1",
    "xue-e34cb2",
    "xuexi-cb323b",
    "shi-4f36bb",
    "zhunbei-bd820e",
    "dakai-095ba7",
  ],
  ko: [
    "annyeong-c19bbb",
    "bangapda-7f7c26",
    "cheoeum-a946d9",
    "sijak-5cc146",
    "sae-4ca67b",
    "baeuda-ec06fc",
    "gongbu-66ff42",
    "junbi-991cb3",
    "swipda-2cca8b",
    "yeolda-105d5e",
  ],
  ja: [
    "hajimete-d707f0",
    "hajime-e0436a",
    "atarashii-174962",
    "ichiban-ecf5d6",
    "narau-24ace3",
    "benkyo-04315c",
    "yasashii-c45b9a",
    "aku-b02957",
  ],
  fr: ["ami", "matin", "apprendre", "cole", "lire", "crire", "pr-t", "facile", "ouvrir"],
  de: ["willkommen", "anfangen", "anfang", "neu", "lernen", "versuchen", "bereit", "leicht"],
  es: ["bienvenido", "empezar", "comenzar", "primero", "nuevo", "aprender", "f-cil", "abrir"],
};

/**
 * One loader per language: a dynamic import, so each language's list is its own small chunk.
 * A language with no list loads nothing and the demo streams from the server as before.
 */
const LOADERS: Partial<Record<TargetLocale, () => Promise<{ default: unknown }>>> = {
  en: () => import("../demo/en.json"),
  zh: () => import("../demo/zh.json"),
  ko: () => import("../demo/ko.json"),
  ja: () => import("../demo/ja.json"),
  fr: () => import("../demo/fr.json"),
  de: () => import("../demo/de.json"),
  es: () => import("../demo/es.json"),
};

const loaded = new Map<TargetLocale, Promise<Catalog | null>>();

/**
 * The demo list for a deck, with its `_` joins turned into no-break spaces as every catalog
 * is on load. Loaded once per page; a failed load is forgotten so the next call tries again.
 * @param locale Deck locale. @returns The list, or null when this deck has none.
 */
export function loadDemoDeck(locale: TargetLocale): Promise<Catalog | null> {
  const loader = LOADERS[locale];
  if (!loader) return Promise.resolve(null);
  const cached = loaded.get(locale);
  if (cached) return cached;
  const pending = loader().then(
    (module) => {
      const deck = module.default as Catalog;
      return deck.words.length ? withWordJoiners(deck) : null;
    },
    (error: unknown) => {
      loaded.delete(locale);
      throw error;
    },
  );
  loaded.set(locale, pending);
  return pending;
}

/**
 * One page of the demo, paged exactly as the server pages a deck. Its level and topic counts
 * are the whole deck's (the bundled ladder), not the list's, so the level controls opened
 * during the demo read the same figures they will after it.
 * @param deck The demo list. @param locale Deck locale. @param input The page request.
 * @returns A feed page.
 * @pure true
 */
export function readDemoPage(deck: Catalog, locale: TargetLocale, input: FeedRequest): FeedPage {
  const page = readCatalogPage(deck, input);
  const ladder = levelLadderFor(locale);
  const topicTotal = Object.values(ladder.levelCounts).reduce(
    (sum, count) => sum + (count ?? 0),
    0,
  );
  return {
    ...page,
    levels: ladder.levels,
    levelCounts: ladder.levelCounts,
    topicTotal,
    total: topicTotal,
  };
}
