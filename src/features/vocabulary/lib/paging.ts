/** Pure deterministic paging over any compiled catalog; shared by the server endpoint and browser-imported packs. Exports: MAX_POSITION, readCatalogPage. Depends on: schema, difficulty, random. */
import { wordTrackLevel, type Catalog, type VocabularyLevel, type VocabularyWord } from "./schema";
import { LEVEL_SAMPLE_PRIORITY, difficultyLevels } from "./difficulty";
import { randomGenerator } from "./random";
import type { FeedPage, FeedRequest } from "../types";

export const MAX_POSITION = 1_000_000_000_000;
const pools = new Map<string, Uint32Array>();
const orders = new Map<string, Uint32Array>();
const totals = new WeakMap<Catalog, number>();

/** Unique headwords in a catalog; Japanese decks carry one card per reader level. */
function uniqueHeadwords(catalog: Catalog): number {
  const cached = totals.get(catalog);
  if (cached !== undefined) return cached;
  const heads = new Set<string>();
  for (const word of catalog.words) heads.add(word.word.toLowerCase());
  totals.set(catalog, heads.size);
  return heads.size;
}

function remember(cache: Map<string, Uint32Array>, key: string, value: Uint32Array, cap: number) {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > cap) cache.delete(cache.keys().next().value!);
  return value;
}

type LevelFilter = {
  /** CEFR/HSK levels admitted by the chosen difficulty tracks, or null for any. */
  band: Set<string> | null;
  /** Exact reader level (Japanese school level), or null for any. */
  exact: string | null;
};

/**
 * Resolve the two independent level filters. Japanese words carry both an English CEFR
 * level and a school reader level, so the title difficulty never intersects with the
 * Settings school-level filter; for other decks both read the same `level` field.
 * @param catalog Deck being paged (its track levels decide which tracks are servable)
 * @param level Exact reader level, or "" for any
 * @param difficulty Difficulty track id(s), or "" for any
 * @returns The track band plus the exact reader level
 * @pure true
 */
function allowedLevels(catalog: Catalog, level: string, difficulty: string): LevelFilter {
  // The catalog's own track levels decide which tracks can be served at all — the same
  // rule the picker greys rows by, so a track shown at 0 streams nothing by URL either.
  const band = difficultyLevels(difficulty, catalog.trackLevels);
  return { band: band ? new Set<string>(band) : null, exact: level || null };
}

function matchingPool(
  catalog: Catalog,
  topic: string,
  level: string,
  difficulty: string,
): Uint32Array {
  // Revision in the key: each locale deck has its own word indices.
  const key = `${catalog.revision}:${topic}:${level}:${difficulty}`;
  const existing = pools.get(key);
  if (existing) return remember(pools, key, existing, 64);
  const filter = allowedLevels(catalog, level, difficulty);
  // A Japanese deck carries one card per reader level for the same English word. A
  // single-level track admits only one, but "all levels" (or several tracks) would
  // otherwise repeat the word on every card. Keep one card per headword, preferring the
  // generator's JHIGH default; elsewhere the rule is still first-pack-wins.
  const matches = new Map<string, number>();
  catalog.words.forEach((word, index) => {
    // A word carries several usage domains; the legacy single `topic` is the fallback
    // for a deck compiled before the axis became multi-valued.
    if (topic && !(word.topics?.includes(topic) ?? word.topic === topic)) return;
    // A word with no track level cannot belong to any band, so a filtered stream
    // excludes it while an unfiltered one still offers it. The exact reader level is a
    // separate axis, which is what lets a CEFR track sit on top of a school level.
    const trackLevel = wordTrackLevel(word);
    if (filter.band && !(trackLevel && filter.band.has(trackLevel))) return;
    if (filter.exact && word.level !== filter.exact) return;
    const head = word.word.toLowerCase();
    const previous = matches.get(head);
    if (
      previous === undefined ||
      (word.level === "JHIGH" && catalog.words[previous]!.level !== "JHIGH")
    ) {
      matches.set(head, index);
    }
  });
  return remember(pools, key, Uint32Array.from(matches.values()), 64);
}

/** Sample words kept per level: enough for every track that shares a top level. */
const LEVEL_SAMPLES = 4;

/** @param word Deck word. @returns Whether it begins with an a, ignoring accents. @pure true */
function startsWithA(word: string): boolean {
  return /^a/i.test(word.normalize("NFD"));
}
const levelTallies = new Map<
  string,
  {
    counts: Partial<Record<VocabularyLevel, number>>;
    samples: FeedPage["levelSamples"];
    total: number;
  }
>();

/**
 * Count the catalog's words per CEFR level under one topic. This is what sizes the
 * difficulty picker, and it is taken with the SAME topic test `matchingPool` uses, so a
 * track's figure is by construction the number of words choosing it will stream.
 *
 * Sample selection per level: words starting with "a" come first (priority words named in
 * LEVEL_SAMPLE_PRIORITY, then catalog order), then any remaining slots take the other
 * priority words and finally catalog order. This ensures the onboarding picker always
 * shows a learner-appropriate representative word rather than the first word the base
 * catalog happens to carry for that level.
 * @param topic Topic slug, or "" for every topic
 * @returns Per-level counts plus the topic's full size (unlevelled words included)
 */
function levelTally(catalog: Catalog, topic: string) {
  const key = `${catalog.revision}:${topic}`;
  const cached = levelTallies.get(key);
  if (cached) return cached;
  const counts: Partial<Record<VocabularyLevel, number>> = {};
  const samples: FeedPage["levelSamples"] = {};
  const heads = new Set<string>();
  // Index one card per headword per track level, so the picker's count is the number
  // of distinct words the stream will serve, not the number of school variants.
  const byLevel = new Map<VocabularyLevel, Map<string, VocabularyWord>>();
  for (const word of catalog.words) {
    if (topic && !(word.topics?.includes(topic) ?? word.topic === topic)) continue;
    const head = word.word.toLowerCase();
    heads.add(head);
    const level = wordTrackLevel(word);
    if (!level) continue;
    let group = byLevel.get(level);
    if (!group) {
      group = new Map();
      byLevel.set(level, group);
    }
    const previous = group.get(head);
    if (!previous || (word.level === "JHIGH" && previous.level !== "JHIGH")) {
      group.set(head, word);
    }
  }
  for (const [level, group] of byLevel) counts[level] = group.size;
  for (const [level, group] of byLevel) {
    const words = [...group.values()];
    const priority = LEVEL_SAMPLE_PRIORITY[level] ?? [];
    const picked: FeedPage["levelSamples"][VocabularyLevel] = [];
    const already = new Set<string>();
    const take = (w: (typeof words)[number]) => {
      if (picked.length >= LEVEL_SAMPLES || already.has(w.word)) return;
      picked.push({ word: w.word, defVi: w.defVi.replace(/\//g, "") });
      already.add(w.word);
    };
    const named = priority.flatMap((name) => words.filter((x) => x.word === name));
    // Words starting with "a" go first so every rung's sample shares an initial; a level
    // without enough of them (or a non-Latin deck) falls back to the old order.
    for (const w of named) if (startsWithA(w.word)) take(w);
    for (const w of words) if (startsWithA(w.word)) take(w);
    for (const w of named) take(w);
    for (const w of words) take(w);
    samples[level] = picked;
  }
  const tally = { counts, samples, total: heads.size };
  if (levelTallies.size > 32) levelTallies.clear();
  levelTallies.set(key, tally);
  return tally;
}

function rawOrder(size: number, seed: string, cycle: number): Uint32Array {
  // With two words a fixed alternating order is the only way to avoid adjacent repeats.
  const orderCycle = size <= 2 ? 0 : cycle;
  const key = `${seed}:${size}:${orderCycle}`;
  const cached = orders.get(key);
  if (cached) return remember(orders, key, cached, 32);
  const order = Uint32Array.from({ length: size }, (_, index) => index);
  const random = randomGenerator(key);
  for (let index = size - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [order[index], order[other]] = [order[other], order[index]];
  }
  return remember(orders, key, order, 32);
}

function indexAt(size: number, seed: string, position: number): number {
  const cycle = Math.floor(position / size);
  let offset = position % size;
  const order = rawOrder(size, seed, cycle);
  // For n >= 3, swapping only the first two leaves the last element unchanged.
  // Thus the previous RAW last element is sufficient; no recursive cycle walk is needed.
  if (size >= 3 && cycle > 0 && offset < 2) {
    const previous = rawOrder(size, seed, cycle - 1);
    if (order[0] === previous[size - 1]) offset = 1 - offset;
  }
  return order[offset];
}

/** Read a deterministic page without writes or external services. @param input Validated cursor/filters. @returns Page plus catalog metadata. */
export function readCatalogPage(catalog: Catalog, input: FeedRequest): FeedPage {
  const { seed, position, topic, level, difficulty, limit } = input;
  const pool = matchingPool(catalog, topic, level, difficulty);
  const tally = levelTally(catalog, topic);
  const streamKey = `${catalog.revision}:${seed}:${topic}:${level}:${difficulty}`;
  const entries = pool.length
    ? Array.from({ length: limit }, (_, offset) => {
        const absolute = position + offset;
        return {
          occurrenceId: `${streamKey}:${absolute}`,
          position: absolute,
          cycle: Math.floor(absolute / pool.length),
          word: catalog.words[pool[indexAt(pool.length, streamKey, absolute)]],
        };
      })
    : [];
  return {
    entries,
    seed,
    revision: catalog.revision,
    position,
    previousPosition: position > 0 && pool.length ? Math.max(0, position - limit) : null,
    nextPosition: pool.length && position + limit <= MAX_POSITION ? position + limit : null,
    total: uniqueHeadwords(catalog),
    matching: pool.length,
    levelCounts: tally.counts,
    levelSamples: tally.samples,
    topicTotal: tally.total,
    name: catalog.name,
    topics: catalog.topics,
    levels: catalog.levels,
    trackLevels: catalog.trackLevels,
  };
}
