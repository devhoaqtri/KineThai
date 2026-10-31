/** Server-only merged catalog and per-locale paging. Exports: catalog, catalogFor, deckLocaleFor, DECK_LOCALES, MAX_POSITION, readVocabularyPage, servedCatalogFor. Depends on: ../lib/catalog-source, ../lib/paging, ../lib/word-block. */
import { catalog, catalogFor, deckLocaleFor, DECK_LOCALES } from "../lib/catalog-source";
import type { TargetLocale } from "../lib/target-language";
import { readCatalogPage, MAX_POSITION } from "../lib/paging";
import { getBlockDigest } from "../lib/word-block";
import { getBlockedWordIds } from "./word-block.server";
import type { Catalog } from "../lib/schema";
import type { FeedPage, FeedRequest } from "../types";

export { catalog, catalogFor, deckLocaleFor, DECK_LOCALES, MAX_POSITION };

/** Last built served catalog per locale, keyed by the blocklist it was built from. */
const servedCache = new Map<TargetLocale, { digest: string; catalog: Catalog }>();

/**
 * The catalog as readers actually receive it: the compiled decks minus any word currently
 * held back by reports.
 *
 * The revision carries the blocklist's digest, and that is not cosmetic. A cursor is only
 * accepted against the revision that issued it, so if the pool could change while the
 * revision stayed still, a reader would page on through a deck that is no longer the one
 * their cursor was cut from — positions would quietly point at different words. Folding the
 * digest in turns that into an honest 409 and a fresh stream.
 *
 * With nothing blocked the digest is empty and the catalog is returned untouched, so the
 * ordinary case allocates nothing and the revision is exactly the deck's own.
 *
 * The digest is appended with no separator because a revision travels back as bounded hex
 * (endpoint.server.ts); anything else would refuse every page after the first.
 * @param locale - answer language
 * @returns The catalog to page over
 */
export function servedCatalogFor(locale: TargetLocale = "en"): Catalog {
  const full = catalogFor(locale);
  const blocked = getBlockedWordIds(deckLocaleFor(locale));
  const digest = getBlockDigest(blocked);
  if (!digest) return full;
  const cached = servedCache.get(locale);
  if (cached && cached.digest === digest) return cached.catalog;
  const words = full.words.filter((word) => !blocked.has(word.id));
  const served: Catalog = {
    ...full,
    words,
    count: words.length,
    revision: `${full.revision}${digest}`,
  };
  servedCache.set(locale, { digest, catalog: served });
  return served;
}

/** @param input Validated cursor/filters. @param locale Deck locale. @returns Page plus catalog metadata. */
export function readVocabularyPage(input: FeedRequest, locale: TargetLocale = "en"): FeedPage {
  return readCatalogPage(servedCatalogFor(locale), input);
}
