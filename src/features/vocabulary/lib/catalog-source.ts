/**
 * Single source of truth for the vocabulary catalogs the app serves and reads.
 *
 * English = admin-editable `data/catalog.json` merged with every `data/packs/*.json`.
 * Other answer languages live in `data/<locale>/*.json` (compiled with
 * `vocab:import -- <deck> --pack <name> --locale zh`) and are served only on that
 * language's domain (see ./target-language). Locales without a deck fall back to English.
 *
 * Every catalog passes through withWordJoiners on its way in, so deck text that joins
 * the syllables of one word with `_` reaches readers as unbreakable text (./word-joiner).
 *
 * Exports: catalog (English), catalogFor, deckLocaleFor, withPackCefr, withKanaReadings
 * Depends on: ../data/catalog.json, ../data/kana-readings.json, ../data/packs/*.json,
 *   ../data/<locale>/*.json, ./schema, ./word-joiner
 */
import baseCatalog from "../data/catalog.json";
import kanaReadings from "../data/kana-readings.json";
import type { Catalog } from "./schema";
import { isCefrLevel, mergeCatalogs } from "./schema";
import type { TargetLocale } from "./target-language";
import { withWordJoiners } from "./word-joiner";

/**
 * Recover the English CEFR level from a Japanese pack's compiled filename. The 0B
 * importer writes one pack per reader level (`a2-jprim`, `b1-jsec`, …); the CEFR group
 * is in the stem, while every word's `level` is the school level.
 * @param catalog A compiled pack
 * @param path Module path ending in `<cefr>-j<level>.json`
 * @returns The pack with `cefr` filled in where it was missing
 * @pure true
 */
export function withPackCefr(catalog: Catalog, path: string): Catalog {
  const match = /(?:^|\/)(a1|a2|b1|b2|c1|c2)-j(?:prim|sec|high|coll)\.json$/i.exec(path);
  const cefr = match?.[1]?.toUpperCase();
  if (!isCefrLevel(cefr)) return catalog;
  const words = catalog.words.map((word) => (word.cefr ? word : { ...word, cefr }));
  return { ...catalog, words };
}

function sorted(
  modules: Record<string, { default: Catalog }>,
  options: { inferCefrFromPath?: boolean } = {},
): Catalog[] {
  return Object.keys(modules)
    .sort()
    .map((path) => {
      const catalog = modules[path]!.default;
      return options.inferCefrFromPath ? withPackCefr(catalog, path) : catalog;
    });
}

const enPacks = sorted(
  import.meta.glob<{ default: Catalog }>("../data/packs/*.json", { eager: true }),
);
const zhPacks = sorted(
  import.meta.glob<{ default: Catalog }>("../data/zh/*.json", { eager: true }),
);
const koPacks = sorted(
  import.meta.glob<{ default: Catalog }>("../data/ko/*.json", { eager: true }),
);
const jaPacks = sorted(
  import.meta.glob<{ default: Catalog }>("../data/ja/*.json", { eager: true }),
  { inferCefrFromPath: true },
);
const frPacks = sorted(
  import.meta.glob<{ default: Catalog }>("../data/fr/*.json", { eager: true }),
);
const dePacks = sorted(
  import.meta.glob<{ default: Catalog }>("../data/de/*.json", { eager: true }),
);
const esPacks = sorted(
  import.meta.glob<{ default: Catalog }>("../data/es/*.json", { eager: true }),
);

/** Katakana readings keyed by lowercase English headword. */
const KANA_READINGS = kanaReadings as Record<string, string>;

/**
 * Attach the katakana reading of each headword. The readings live in one map rather than
 * in every level pack: the same English word appears in up to four school-level packs and
 * the pronunciation is identical across them.
 * @param catalog A catalog
 * @returns The catalog with `kana` filled in where a reading exists
 * @pure true
 */
export function withKanaReadings(catalog: Catalog): Catalog {
  const words = catalog.words.map((word) => {
    if (word.kana) return word;
    const kana = KANA_READINGS[word.word.toLowerCase()];
    return kana ? { ...word, kana } : word;
  });
  return words.some((word, index) => word !== catalog.words[index])
    ? { ...catalog, words }
    : catalog;
}

/** The English catalog: base `catalog.json` plus every compiled provider pack. */
export const catalog: Catalog = withKanaReadings(
  withWordJoiners(mergeCatalogs(baseCatalog as Catalog, ...enPacks)),
);

const byLocale: Partial<Record<TargetLocale, Catalog>> = { en: catalog };
const sources: Record<Exclude<TargetLocale, "en">, Catalog[]> = {
  zh: zhPacks,
  ko: koPacks,
  ja: jaPacks,
  fr: frPacks,
  de: dePacks,
  es: esPacks,
};

/** @param locale Answer language. @returns That language's catalog, or English when none exists. */
export function catalogFor(locale: TargetLocale): Catalog {
  const cached = byLocale[locale];
  if (cached) return cached;
  const packs = sources[locale as Exclude<TargetLocale, "en">] ?? [];
  const result = packs.length
    ? withWordJoiners(mergeCatalogs(packs[0]!, ...packs.slice(1)))
    : catalog;
  const localized = withKanaReadings(result);
  byLocale[locale] = localized;
  return localized;
}

/**
 * The deck a language really reads. One with no packs of its own reads English, so a
 * report filed from it belongs to the English deck.
 * @param locale Answer language. @returns `locale`, or "en" when it has no deck.
 */
export function deckLocaleFor(locale: TargetLocale): TargetLocale {
  return locale !== "en" && sources[locale].length ? locale : "en";
}
