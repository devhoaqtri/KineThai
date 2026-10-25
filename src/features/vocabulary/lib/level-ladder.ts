/**
 * The first-load level picker's data — words per level and a few sample words per
 * level — shipped with the bundle instead of fetched.
 *
 * The picker used to ask the server for a whole feed page just to read the metadata
 * riding on it, so the very first screen waited on a query before its ladder could
 * fill. Catalogs only change with a deploy, so the figures are fixed per build: they
 * are compiled into data/level-ladder.json by the level-ladder test (`vitest -u`),
 * which also fails whenever a catalog changes without the snapshot being refreshed.
 *
 * Exports: LevelLadder, buildLevelLadder, buildLevelLadders, levelLadderFor
 * Depends on: ../data/level-ladder.json, ./paging, ./target-language
 */

import snapshot from "../data/level-ladder.json";
import { readCatalogPage } from "./paging";
import type { Catalog, VocabularyLevel } from "./schema";
import type { TargetLocale } from "./target-language";
import type { FeedPage } from "../types";

export type LevelLadder = Pick<FeedPage, "levelCounts" | "levels"> & {
  /** Only the word: the picker never shows a sample's meaning. */
  levelSamples: Partial<Record<VocabularyLevel, { word: string }[]>>;
};

/**
 * The ladder figures for one catalog, taken through the same tally a feed page reports
 * under "every topic", so a rung's count is by construction what choosing it streams.
 * @param catalog Compiled catalog
 * @returns Levels present, words per level, and sample words per level
 * @pure true
 */
export function buildLevelLadder(catalog: Catalog): LevelLadder {
  const page = readCatalogPage(catalog, {
    seed: "level-ladder",
    position: 0,
    topic: "",
    level: "",
    difficulty: "",
    limit: 0,
  });
  const levelSamples: LevelLadder["levelSamples"] = {};
  for (const [level, samples] of Object.entries(page.levelSamples)) {
    levelSamples[level as VocabularyLevel] = samples.map(({ word }) => ({ word }));
  }
  return { levels: page.levels, levelCounts: page.levelCounts, levelSamples };
}

/**
 * Every locale's ladder, omitting locales that are served the English catalog.
 * @param catalogFor The catalog each locale is served
 * @param locales Locales to cover
 * @returns Ladders keyed by locale, English always present
 * @pure true
 */
export function buildLevelLadders(
  catalogFor: (locale: TargetLocale) => Catalog,
  locales: readonly TargetLocale[],
): Partial<Record<TargetLocale, LevelLadder>> {
  const english = catalogFor("en");
  const ladders: Partial<Record<TargetLocale, LevelLadder>> = { en: buildLevelLadder(english) };
  for (const locale of locales) {
    const catalog = catalogFor(locale);
    if (catalog !== english) ladders[locale] = buildLevelLadder(catalog);
  }
  return ladders;
}

const ladders = snapshot as Partial<Record<TargetLocale, LevelLadder>>;

/** @param locale Deck locale. @returns That locale's ladder, or English's when it has none. */
export function levelLadderFor(locale: TargetLocale): LevelLadder {
  return ladders[locale] ?? ladders.en ?? { levels: [], levelCounts: {}, levelSamples: {} };
}
