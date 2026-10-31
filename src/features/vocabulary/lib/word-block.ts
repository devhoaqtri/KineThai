/**
 * When enough separate readers report the same word, hide it until an admin has looked.
 *
 * The rule is deliberately about SEPARATE readers, not about how many reports arrived: one
 * person tapping the same word eight times is one opinion, and the block is meant to catch
 * the case where strangers independently see the same thing wrong. A report therefore
 * carries an opaque reporter key (see reporter-digest.server.ts — it is a salted digest,
 * never an address), and only distinct keys count.
 *
 * The block is PROVISIONAL, which is the whole point: it takes the word out of the feed
 * while it waits for a human, and the moment an admin resolves those reports the word comes
 * back. Nothing here decides that a word is wrong — only that enough people said so for it
 * to be worth not showing until someone checks.
 *
 * This module is pure so the rule can be asserted without a database:
 * scripts/check-word-block.ts drives it directly.
 *
 * The rule runs per deck. Word ids are only unique within one (`budget` is a German word and
 * a French one), so reports in one language must never hide a word in another.
 *
 * Exports: BLOCK_AFTER_DISTINCT_REPORTERS, BLOCK_AFTER_SEVERE_REPORTERS, WordReportSignal,
 *   getBlockedByLocale, getBlockedWordIds, getBlockDigest, countDistinctReporters
 * Depends on: none (leaf module)
 */

/**
 * How many separate readers must report one word before it is hidden.
 *
 * Three is a judgement, not a law: one reader can be mistaken, two can be the same person
 * on two networks, three strangers agreeing is a signal worth acting on. Raising it makes
 * the feed more forgiving of a bad entry; lowering it makes a small number of readers able
 * to take a word out of circulation until an admin returns.
 */
export const BLOCK_AFTER_DISTINCT_REPORTERS = 3;

/**
 * How many separate readers picking a severe reason hide a word.
 *
 * Lower because a severe report says the card should not be shown at all, so waiting for a
 * third reader costs more than a correct word being held back for a while.
 */
export const BLOCK_AFTER_SEVERE_REPORTERS = 2;

/** The only part of a stored report this rule looks at. */
export type WordReportSignal = {
  /** The deck the report was filed against. */
  locale: string;
  wordId: string;
  /**
   * Opaque per-word reporter key, or null for a report filed before reporter keys existed
   * (or where the caller could not be distinguished at all). A null NEVER counts: it cannot
   * be shown to be a different reader from any other null, and counting it would let a
   * single source cross the threshold alone.
   */
  reporter: string | null;
  /** The report named a severe reason. */
  severe: boolean;
  /** Only an unresolved report counts; resolving is the admin verification that lifts it. */
  status: "new" | "resolved";
};

/**
 * How many distinct readers have an open report against this word.
 * @param reports - every stored signal, any word, any status
 * @param wordId - the word to count for
 * @param locale - the deck it belongs to
 * @returns The number of distinct, non-null reporter keys among its open reports
 * @pure true
 */
export function countDistinctReporters(
  reports: readonly WordReportSignal[],
  wordId: string,
  locale: string,
): number {
  const seen = new Set<string>();
  for (const report of reports) {
    if (report.wordId !== wordId || report.locale !== locale) continue;
    if (report.status !== "new" || !report.reporter) continue;
    seen.add(report.reporter);
  }
  return seen.size;
}

/**
 * Every word currently held back from the feed, per deck.
 * @param reports - every stored signal, any word, any status
 * @returns Deck locale to word ids with at least BLOCK_AFTER_DISTINCT_REPORTERS distinct open
 *   reporters, or BLOCK_AFTER_SEVERE_REPORTERS of them naming a severe reason
 * @pure true
 */
export function getBlockedByLocale(reports: readonly WordReportSignal[]): Map<string, Set<string>> {
  const byWord = new Map<
    string,
    { locale: string; wordId: string; readers: Set<string>; severe: Set<string> }
  >();
  for (const report of reports) {
    if (report.status !== "new" || !report.reporter) continue;
    const key = `${report.locale}\n${report.wordId}`;
    let word = byWord.get(key);
    if (!word) {
      word = {
        locale: report.locale,
        wordId: report.wordId,
        readers: new Set(),
        severe: new Set(),
      };
      byWord.set(key, word);
    }
    word.readers.add(report.reporter);
    if (report.severe) word.severe.add(report.reporter);
  }
  const blocked = new Map<string, Set<string>>();
  for (const { locale, wordId, readers, severe } of byWord.values()) {
    if (
      readers.size < BLOCK_AFTER_DISTINCT_REPORTERS &&
      severe.size < BLOCK_AFTER_SEVERE_REPORTERS
    ) {
      continue;
    }
    let words = blocked.get(locale);
    if (!words) blocked.set(locale, (words = new Set()));
    words.add(wordId);
  }
  return blocked;
}

/**
 * The words held back from one deck.
 * @param reports - every stored signal, any word, any status
 * @param locale - the deck to read
 * @returns Its blocked word ids
 * @pure true
 */
export function getBlockedWordIds(
  reports: readonly WordReportSignal[],
  locale: string,
): Set<string> {
  return getBlockedByLocale(reports).get(locale) ?? new Set();
}

/**
 * A short, order-independent digest of a blocklist.
 *
 * The served catalog's revision is built from this. A cursor is only valid against the
 * revision that issued it, so when the blocklist changes the revision must change with it —
 * otherwise a reader would page on through a word pool that is no longer the one their
 * cursor was cut from.
 * @param blocked - the blocked word ids, in any order
 * @returns 12 hex characters; "" for an empty blocklist, so an unblocked catalog keeps its
 *   own revision untouched
 * @pure true
 */
export function getBlockDigest(blocked: ReadonlySet<string>): string {
  if (blocked.size === 0) return "";
  const joined = [...blocked].sort().join(",");
  let digest = "";
  for (let round = 0; digest.length < 12; round += 1) {
    let hash = 0x811c9dc5;
    const stream = `${round}:${joined}`;
    for (let index = 0; index < stream.length; index += 1) {
      hash ^= stream.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    digest += hash.toString(16).padStart(8, "0");
  }
  return digest.slice(0, 12);
}
