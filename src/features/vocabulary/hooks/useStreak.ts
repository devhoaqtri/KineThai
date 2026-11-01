/**
 * Records finished words and sends a milestone to the badge inbox the moment it is earned.
 *
 * The split follows ./useViewHistory: the pure logic lives in lib/streak and this owns the
 * read and the write. Nothing here decides whether to celebrate; that is the return value
 * of `recordFinishedWord`, which is what makes "exactly once, ever" structural rather than
 * a matter of timing.
 *
 * Exports: useStreak
 * Depends on: React, ../lib/streak, ../lib/badge-inbox, ../lib/durable-storage
 */

import { useCallback } from "react";
import { enqueueBadge } from "../lib/badge-inbox";
import { requestDurableStorage } from "../lib/durable-storage";
import { readStreak, recordFinishedWord, writeStreak } from "../lib/streak";

export type StreakApi = {
  /** Call when a word has genuinely been finished. Safe to call more than once. */
  finish: (wordId: string) => void;
};

/**
 * @returns The finish handler
 */
export function useStreak(): StreakApi {
  const finish = useCallback((wordId: string) => {
    const before = readStreak();
    const { store, celebrate } = recordFinishedWord(before, wordId);
    // recordFinishedWord hands back the identical object when the word was already counted
    // today, or when the day has already qualified. Skipping the write then keeps a long
    // reading session from re-serialising the store — and from waking every drawer
    // listener — once per word for no change.
    if (store !== before) writeStreak(store);
    if (store.days.length > before.days.length) requestDurableStorage();
    // At most one milestone can be crossed by one day's worth of finishes, but take the
    // largest rather than the first in case a restored store jumps several rungs.
    if (celebrate.length) enqueueBadge({ kind: "streak", days: Math.max(...celebrate) });
  }, []);

  return { finish };
}
