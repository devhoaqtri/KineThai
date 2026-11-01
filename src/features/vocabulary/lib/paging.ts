/** Pure deterministic paging over any compiled catalog; shared by the server endpoint and browser-imported packs. Exports: MAX_POSITION, readCatalogPage. Depends on: schema, difficulty, hanzi, random, syllables. */
import type { Catalog, VocabularyLevel } from "./schema";
import { LEVEL_SAMPLE_PRIORITY, difficultyLevels } from "./difficulty";
import { getHanCharCount, isHanAnswer } from "./hanzi";
import { randomGenerator } from "./random";
import { countSyllables } from "./syllables";
import type { FeedPage, FeedRequest } from "../types";

/** @returns The list starting from its middle, wrapping round. @pure true */
function fromMiddle<T>(list: readonly T[]): T[] {
  const middle = Math.floor(list.length / 2);
  return [...list.slice(middle), ...list.slice(0, middle)];
}

export const MAX_POSITION = 1_000_000_000_000;
const pools = new Map<string, Uint32Array>();
const orders = new Map<string, Uint32Array>();

function remember(cache: Map<string, Uint32Array>, key: string, value: Uint32Array, cap: number) {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > cap) cache.delete(cache.keys().next().value!);
  return value;
}

/**
 * Resolve the level filters into one admitted set.
 * @param level Exact CEFR level, or "" for any
 * @param difficulty Difficulty track id, or "" for any
 * @returns The admitted levels, or null when no level filter applies
 * @pure true
 */
function allowedLevels(catalog: Catalog, level: string, difficulty: string): Set<string> | null {
  // The catalog's own levels decide which tracks can be served at all — the same rule the
  // picker greys rows by, so a track shown at 0 streams nothing even if asked for by URL.
  const band = difficultyLevels(difficulty, catalog.levels);
  if (!level) return band ? new Set<string>(band) : null;
  if (!band) return new Set<string>([level]);
  // Both given: intersect, so an exact level outside the chosen track's band
  // admits nothing rather than silently ignoring one of the two filters.
  return band.includes(level as VocabularyLevel) ? new Set<string>([level]) : new Set<string>();
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
  const allowed = allowedLevels(catalog, level, difficulty);
  const matches: number[] = [];
  catalog.words.forEach((word, index) => {
    // A word carries several usage domains; the legacy single `topic` is the fallback
    // for a deck compiled before the axis became multi-valued.
    if (topic && !(word.topics?.includes(topic) ?? word.topic === topic)) return;
    // A word with no CEFR level cannot belong to any band, so a filtered stream
    // excludes it while an unfiltered one still offers it.
    if (allowed && !(word.level && allowed.has(word.level))) return;
    matches.push(index);
  });
  return remember(pools, key, Uint32Array.from(matches), 64);
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
 * Sample selection per level: two-syllable words come first, because a one-syllable word
 * is too often a particle (的, 把) to say anything about a level. Among any words, those
 * starting with "a" lead (priority words named in LEVEL_SAMPLE_PRIORITY, then catalog
 * order), then the other priority words and finally catalog order. This ensures the
 * onboarding picker always shows a learner-appropriate representative word rather than the
 * first word the base catalog happens to carry for that level. A level short of
 * two-syllable words fills up from the rest.
 * @param topic Topic slug, or "" for every topic
 * @returns Per-level counts plus the topic's full size (unlevelled words included)
 */
function levelTally(catalog: Catalog, topic: string) {
  const key = `${catalog.revision}:${topic}`;
  const cached = levelTallies.get(key);
  if (cached) return cached;
  const counts: Partial<Record<VocabularyLevel, number>> = {};
  const samples: FeedPage["levelSamples"] = {};
  let total = 0;
  // Index every matching word per level so the priority pass can look up by name.
  const byLevel = new Map<VocabularyLevel, typeof catalog.words>();
  for (const word of catalog.words) {
    if (topic && !(word.topics?.includes(topic) ?? word.topic === topic)) continue;
    total += 1;
    if (!word.level) continue;
    counts[word.level] = (counts[word.level] ?? 0) + 1;
    if (!byLevel.has(word.level)) byLevel.set(word.level, []);
    byLevel.get(word.level)!.push(word);
  }
  for (const [level, words] of byLevel) {
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
    const pass = (keep: (word: (typeof words)[number]) => boolean) => {
      for (const w of named) if (startsWithA(w.word) && keep(w)) take(w);
      for (const w of words) if (startsWithA(w.word) && keep(w)) take(w);
      for (const w of named) if (keep(w)) take(w);
      for (const w of words) if (keep(w)) take(w);
    };
    const han = words.filter((w) => isHanAnswer(w.word));
    const ofLength = (size: number) =>
      fromMiddle(han.filter((w) => getHanCharCount(w.word) === size));
    const [three, two] = [ofLength(3), ofLength(2)];
    for (let index = 0; index < Math.max(three.length, two.length); index += 1) {
      for (const w of [three[index], two[index]]) if (w) take(w);
    }
    pass((w) => countSyllables(w) === 2);
    pass(() => true);
    samples[level] = picked;
  }
  const tally = { counts, samples, total };
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
    total: catalog.count,
    matching: pool.length,
    levelCounts: tally.counts,
    levelSamples: tally.samples,
    topicTotal: tally.total,
    name: catalog.name,
    topics: catalog.topics,
    levels: catalog.levels,
  };
}
