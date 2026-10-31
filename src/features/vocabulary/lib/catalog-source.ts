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
 * Exports: catalog (English), catalogFor, deckLocaleFor, DECK_LOCALES
 * Depends on: ../data/catalog.json, ../data/packs/*.json, ../data/<locale>/*.json, ./schema, ./word-joiner
 */
import baseCatalog from "../data/catalog.json";
import type { Catalog } from "./schema";
import { mergeCatalogs } from "./schema";
import { TARGET_LOCALES, type TargetLocale } from "./target-language";
import { withWordJoiners } from "./word-joiner";

function sorted(modules: Record<string, { default: Catalog }>): Catalog[] {
  return Object.keys(modules)
    .sort()
    .map((path) => modules[path]!.default);
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
// One file per JLPT level (jlpt-n5.json, jlpt-n4.json, …). A new deck is picked up here.
const jaPacks = sorted(
  import.meta.glob<{ default: Catalog }>("../data/ja/*.json", { eager: true }),
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

/** The English catalog: base `catalog.json` plus every compiled provider pack. */
export const catalog: Catalog = withWordJoiners(mergeCatalogs(baseCatalog as Catalog, ...enPacks));

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
  byLocale[locale] = result;
  return result;
}

/**
 * The deck a language really reads. One with no deck of its own reads English, so its
 * reports and hidden words are the English deck's.
 * @param locale Answer language. @returns `locale`, or "en" when it has no deck.
 */
export function deckLocaleFor(locale: TargetLocale): TargetLocale {
  return catalogFor(locale) === catalog ? "en" : locale;
}

/** Every language with a deck of its own, English first. */
export const DECK_LOCALES: readonly TargetLocale[] = TARGET_LOCALES.filter(
  (locale) => deckLocaleFor(locale) === locale,
);
