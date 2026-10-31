/** Server-only merged catalog and per-locale paging. Exports: catalog, catalogFor, deckLocaleFor, MAX_POSITION, readVocabularyPage. Depends on: ../lib/catalog-source, ../lib/paging. */
import { catalog, catalogFor, deckLocaleFor } from "../lib/catalog-source";
import { DEFAULT_TARGET, type TargetLocale } from "../lib/target-language";
import { readCatalogPage, MAX_POSITION } from "../lib/paging";
import type { FeedPage, FeedRequest } from "../types";

export { catalog, catalogFor, deckLocaleFor, MAX_POSITION };

/** @param input Validated cursor/filters. @param locale Deck locale. @returns Page plus catalog metadata. */
export function readVocabularyPage(
  input: FeedRequest,
  locale: TargetLocale = DEFAULT_TARGET,
): FeedPage {
  return readCatalogPage(catalogFor(locale), input);
}
