/**
 * Server-paging bounds for the vocabulary stream backfill.
 *
 * The feed endpoint permutes the same matching pool forever — `nextPosition` only
 * turns null at MAX_POSITION — so `hasNextPage` can never be the signal that stops
 * a backfill. These bounds answer the only question that matters: can the next page
 * still contain a word this stream has not been offered yet?
 *
 * Exports: VOCAB_PAGE_LIMIT, VOCAB_MAX_PAGES, getBlockedRun, canWalkFurther, selectVisibleEntries
 * Depends on: types (FeedEntry)
 */

import type { FeedEntry } from "../types";

/** Entries requested per feed page (see api/feed.ts). */
export const VOCAB_PAGE_LIMIT = 12;

/** Pages retained by the infinite query (see hooks/useVocabularyFeed.ts). */
export const VOCAB_MAX_PAGES = 10;

/**
 * How many buffered positions trail the last word the reader can be shown.
 *
 * This is what bounds the backfill: a stretch of positions with nothing showable in it.
 * It used to be the stream's absolute position, which also counted every word the reader
 * had actually read — so a reader who had read ~120 words was told the pool was spent and
 * landed on the "you have seen every word" page, in a level of a thousand.
 * @param entries - Buffered entries, in server order.
 * @param visibleIds - Occurrence ids the stream is showing.
 * @returns Entries after the last visible one (all of them when none is visible).
 * @pure true
 */
export function getBlockedRun(
  entries: readonly FeedEntry[],
  visibleIds: ReadonlySet<string>,
): number {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (visibleIds.has(entries[index].occurrenceId)) return entries.length - 1 - index;
  }
  return entries.length;
}

/**
 * Decide whether another page can still pay off.
 *
 * One full pass over the pool shows every word the filters match, so once a whole cycle
 * (plus a page of slack for the eviction boundary) has come back with nothing showable,
 * a further page can only repeat blocked words. The run is additionally capped at what the
 * local buffer retains, because `maxPages` drops earlier positions anyway — without the
 * cap, a fully blocked stream re-fetches the same blocked cycle hundreds of times a second.
 * @param matching - Pool size reported by the server (0 when unknown).
 * @param blockedRun - Buffered positions after the last showable word (getBlockedRun).
 * @returns True while a further page can still contain an unseen word.
 * @pure true
 */
export function canWalkFurther(matching: number, blockedRun: number): boolean {
  const bufferCeiling = VOCAB_PAGE_LIMIT * VOCAB_MAX_PAGES;
  const cycleCeiling = matching > 0 ? matching + VOCAB_PAGE_LIMIT : bufferCeiling;
  return blockedRun < Math.min(bufferCeiling, cycleCeiling);
}

/**
 * Pick the buffered entries the stream shows.
 *
 * An entry once admitted stays (so the current card never vanishes when its view is
 * recorded); otherwise the day history decides. When no more words can be loaded
 * (`relaxHistory`: the next page failed after every fallback, or the device is offline),
 * the words already on the device are served instead of an error: entries after the last
 * admitted one are let back in even if they were seen today. Only that tail is relaxed, so
 * nothing is inserted before the card on screen.
 * @param entries - Buffered entries, in server order.
 * @param admitted - Occurrence ids already admitted; updated in place.
 * @param isAllowed - The day-history rule for a word id.
 * @param relaxHistory - Whether to let already-seen words in at the tail.
 * @returns The entries to show, in order.
 */
export function selectVisibleEntries(
  entries: readonly FeedEntry[],
  admitted: Set<string>,
  isAllowed: (wordId: string) => boolean,
  relaxHistory: boolean,
): FeedEntry[] {
  let lastAdmitted = -1;
  if (relaxHistory) {
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      if (admitted.has(entries[index].occurrenceId)) {
        lastAdmitted = index;
        break;
      }
    }
  }
  const out: FeedEntry[] = [];
  entries.forEach((entry, index) => {
    if (
      admitted.has(entry.occurrenceId) ||
      isAllowed(entry.word.id) ||
      (relaxHistory && index > lastAdmitted)
    ) {
      admitted.add(entry.occurrenceId);
      out.push(entry);
    }
  });
  return out;
}
