/**
 * Records finished words and surfaces a milestone the moment it is earned.
 *
 * The split follows ./useViewHistory: the pure logic lives in lib/streak and this owns the
 * read, the write and the one piece of transient state — which milestone is being
 * celebrated right now. Nothing here decides whether to celebrate; that is the return value
 * of `recordFinishedWord`, which is what makes "exactly once, ever" structural rather than
 * a matter of timing.
 *
 * Exports: useStreak
 * Depends on: React, ../lib/streak, ../lib/durable-storage
 */

import { useCallback, useState } from "react";
import { requestDurableStorage } from "../lib/durable-storage";
import { readStreak, recordFinishedWord, writeStreak } from "../lib/streak";

export type StreakApi = {
  /** Call when a word has genuinely been finished. Safe to call more than once. */
  finish: (wordId: string) => void;
  /** The milestone to celebrate right now, in days; null when there is nothing to show. */
  celebrating: number | null;
  /** The celebration has played out. */
  dismiss: () => void;
};

/**
 * @returns The finish handler and the current celebration, if any
 */
export function useStreak(): StreakApi {
  const [celebrating, setCelebrating] = useState<number | null>(null);

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
    if (celebrate.length) setCelebrating(Math.max(...celebrate));
  }, []);

  const dismiss = useCallback(() => setCelebrating(null), []);

  return { finish, celebrating, dismiss };
}
