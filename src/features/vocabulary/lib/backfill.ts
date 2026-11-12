/**
 * Server-paging bounds for the vocabulary stream backfill.
 *
 * The feed endpoint permutes the same matching pool forever — `nextPosition` only
 * turns null at MAX_POSITION — so `hasNextPage` can never be the signal that stops
 * a backfill. These bounds answer the only question that matters: can the next page
 * still contain a word this stream has not been offered yet?
 *
 * Exports: VOCAB_PAGE_LIMIT, VOCAB_MAX_PAGES, PREFETCH_AHEAD, getBlockedRun, canWalkFurther,
 *   selectVisibleEntries, holdAnchorRows, wantsWordsAhead
 * Depends on: types (FeedEntry)
 */

import type { FeedEntry } from "../types";

/** Entries requested per feed page (see api/feed.ts). */
export const VOCAB_PAGE_LIMIT = 12;

/** Pages retained by the infinite query (see hooks/useVocabularyFeed.ts). */
export const VOCAB_MAX_PAGES = 10;

/**
 * Showable words the stream likes to have ahead of the one on screen while its buffer still
 * has room. A full buffer asks for a page only when nothing is left ahead (wantsWordsAhead).
 */
export const PREFETCH_AHEAD = 4;

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

/**
 * Keep the row on screen, and the rows after it, when the list under them loses them.
 *
 * The infinite query keeps VOCAB_MAX_PAGES pages and drops the oldest when one more arrives,
 * whatever it holds. On a level whose words are nearly all in the day history, the showable
 * rows are so sparse that the page holding the word on screen can be the oldest, and losing
 * it made the window adopt whatever row then stood at that index: the screen walked through
 * several words in a second with no gesture. The rows from the anchor up to the first one
 * still present are kept, in place, until the reader has moved past them; rows behind the
 * reader are let go as before.
 * @param previous - What this returned last time (the stream's rows before this change).
 * @param next - The new list (lead word plus the query's entries).
 * @param anchorId - The occurrence on screen, or null before any.
 * @returns `next`, unchanged when it still holds the anchor, else with the kept rows put back.
 * @pure true
 */
export function holdAnchorRows(
  previous: readonly FeedEntry[],
  next: readonly FeedEntry[],
  anchorId: string | null,
): readonly FeedEntry[] {
  if (anchorId === null) return next;
  const present = new Map(next.map((entry, index) => [entry.occurrenceId, index]));
  if (present.has(anchorId)) return next;
  const at = previous.findIndex((entry) => entry.occurrenceId === anchorId);
  if (at < 0) return next;
  const kept: FeedEntry[] = [];
  let insertAt: number | undefined;
  for (let index = at; index < previous.length; index += 1) {
    const found = present.get(previous[index].occurrenceId);
    if (found !== undefined) {
      insertAt = found;
      break;
    }
    kept.push(previous[index]);
  }
  if (insertAt === undefined) {
    // Nothing after the anchor survived (a fresh stream): go after whatever still stands
    // before it, such as a shared lead word, so that is not played a second time.
    insertAt = 0;
    for (let index = 0; index < at; index += 1) {
      const found = present.get(previous[index].occurrenceId);
      if (found !== undefined) insertAt = Math.max(insertAt, found + 1);
    }
  }
  return [...next.slice(0, insertAt), ...kept, ...next.slice(insertAt)];
}

/**
 * Whether the stream should ask for another forward page, given what lies ahead.
 *
 * While the buffer has room it keeps PREFETCH_AHEAD showable words in hand. Once it is full,
 * every page that arrives drops the oldest, so a page is fetched only to find the very next
 * word. Asking for a lookahead there chained a page per response on a level the day history
 * had nearly emptied (~100 requests a view in a few minutes), each dropping a page under the
 * reader. What still bounds a hunt for the next word is the run of unshowable positions
 * (getBlockedRun, canWalkFurther).
 * @param ahead - Showable rows after the one on screen.
 * @param bufferFull - The query already holds VOCAB_MAX_PAGES pages.
 * @returns True when a forward page should be requested.
 * @pure true
 */
export function wantsWordsAhead(ahead: number, bufferFull: boolean): boolean {
  return ahead < (bufferFull ? 1 : PREFETCH_AHEAD);
}
