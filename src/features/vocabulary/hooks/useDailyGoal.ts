/**
 * Counts finished words towards the daily goals, and sends each one to the badge inbox the
 * moment it is met. The same split as ./useStreak: lib/daily-goal decides, this owns the read
 * and the write.
 *
 * Exports: useDailyGoal, useDailyGoalStore
 * Depends on: React, ../lib/daily-goal, ../lib/badge-inbox
 */

import { useCallback, useEffect, useState } from "react";
import { enqueueBadge } from "../lib/badge-inbox";
import {
  DAILY_GOAL_EVENT,
  DAILY_GOAL_KEY,
  readDailyGoal,
  recordDailyWord,
  writeDailyGoal,
  type DailyGoalStore,
} from "../lib/daily-goal";

/** @returns The finish handler */
export function useDailyGoal(): { finish: (wordId: string) => void } {
  const finish = useCallback((wordId: string) => {
    const before = readDailyGoal();
    const { store, reached } = recordDailyWord(before, wordId, Date.now());
    if (store !== before) writeDailyGoal(store);
    if (reached) enqueueBadge({ kind: "daily", goal: reached, times: store.times[reached] });
  }, []);
  return { finish };
}

/** @returns The stored daily goal, kept in sync with this tab, other tabs and focus. */
export function useDailyGoalStore(): DailyGoalStore {
  const [store, setStore] = useState<DailyGoalStore>(() => readDailyGoal());
  useEffect(() => {
    const refresh = () => setStore(readDailyGoal());
    const onStorage = (event: StorageEvent) => {
      if (event.key === DAILY_GOAL_KEY) refresh();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(DAILY_GOAL_EVENT, refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(DAILY_GOAL_EVENT, refresh);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  return store;
}
