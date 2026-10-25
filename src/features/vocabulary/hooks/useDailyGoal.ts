/**
 * Counts finished words towards the daily goals, and surfaces each one the moment it is met. The same
 * split as ./useStreak: lib/daily-goal decides, this owns the read, the write and the one
 * piece of transient state — which count is being celebrated right now.
 *
 * Exports: useDailyGoal, useDailyGoalStore
 * Depends on: React, ../lib/daily-goal
 */

import { useCallback, useEffect, useState } from "react";
import {
  DAILY_GOAL_EVENT,
  DAILY_GOAL_KEY,
  readDailyGoal,
  recordDailyWord,
  writeDailyGoal,
  type DailyGoal,
  type DailyGoalStore,
} from "../lib/daily-goal";

/** @returns The finish handler, and the goal just met with its count (1, 2, 3…), or null */
export function useDailyGoal(): {
  finish: (wordId: string) => void;
  celebrating: { goal: DailyGoal; times: number } | null;
  dismiss: () => void;
} {
  const [celebrating, setCelebrating] = useState<{ goal: DailyGoal; times: number } | null>(null);
  const finish = useCallback((wordId: string) => {
    const before = readDailyGoal();
    const { store, reached } = recordDailyWord(before, wordId, Date.now());
    if (store !== before) writeDailyGoal(store);
    if (reached) setCelebrating({ goal: reached, times: store.times[reached] });
  }, []);
  const dismiss = useCallback(() => setCelebrating(null), []);
  return { finish, celebrating, dismiss };
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
