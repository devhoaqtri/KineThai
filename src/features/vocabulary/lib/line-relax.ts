/**
 * Per-site thresholds for loosening a clue page's line rules.
 *
 * A measured clue page whose strict layout would be set under this share of its full size
 * is laid out again with the line rules loosened, when that makes it at least 5% larger
 * (kinetic-text solveMeasuredLines `relaxBelow`). Each site gets its own value because each
 * deck writes its clues differently. Sites start at 0.6, which on a 123-page walk of
 * the English site fixed as many half-size pages as 0.65–0.7 while loosening fewer. The
 * English site is trialled at 0.65 to clamp within-scene font spread for manual review.
 *
 * Tune from data: `npm run fonts:walk -- --host hoa.localhost` fills the dev log for one
 * site, and `npm run fonts:report` shows each site's pages and what each threshold would
 * change. 0 turns loosening off for a site.
 *
 * Exports: RELAX_LINE_RULE_BELOW, relaxBelowFor
 * Depends on: ./target-language
 */
import { DEFAULT_TARGET, type TargetLocale } from "./target-language";

/** Share of full size under which a page is loosened, by site (its deck language). */
export const RELAX_LINE_RULE_BELOW: Readonly<Record<TargetLocale, number>> = {
  en: 0.65,
  zh: 0.6,
  ko: 0.6,
  ja: 0.6,
  fr: 0.6,
  de: 0.6,
  es: 0.6,
};

/**
 * @param locale - the site's deck language, as DeckLocaleContext gives it
 * @returns That site's threshold
 * @pure true
 */
export function relaxBelowFor(locale: TargetLocale): number {
  return RELAX_LINE_RULE_BELOW[locale] ?? RELAX_LINE_RULE_BELOW[DEFAULT_TARGET];
}
