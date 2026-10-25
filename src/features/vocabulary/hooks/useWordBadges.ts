/**
 * The word milestones this device has earned, kept in sync with writes from the feed.
 * The same three-trigger shape as ./useStreakBadges, for the same reasons.
 *
 * Exports: useWordBadges
 * Depends on: React, ../lib/level-progress
 */

import { useEffect, useState } from "react";
import {
  LEVEL_PROGRESS_EVENT,
  LEVEL_PROGRESS_KEY,
  parseMilestoneKey,
  readProgress,
} from "../lib/level-progress";

/** An earned word badge, in the order earned. */
export type EarnedWordBadge = { key: string; scope: string; words: number };

function read(): EarnedWordBadge[] {
  return readProgress().earned.flatMap((key) => {
    const parsed = parseMilestoneKey(key);
    return parsed ? [{ key, ...parsed }] : [];
  });
}

/** @returns Earned word badges, oldest first; empty until the first is reached */
export function useWordBadges(): EarnedWordBadge[] {
  const [badges, setBadges] = useState<EarnedWordBadge[]>(read);
  useEffect(() => {
    const refresh = () => setBadges(read());
    const onStorage = (event: StorageEvent) => {
      if (event.key === LEVEL_PROGRESS_KEY) refresh();
    };
    // LEVEL_PROGRESS_EVENT: a word read in THIS tab; storage: in another tab;
    // focus/visibility: a catch-all after bfcache restores or tab switches.
    window.addEventListener("storage", onStorage);
    window.addEventListener(LEVEL_PROGRESS_EVENT, refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(LEVEL_PROGRESS_EVENT, refresh);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  return badges;
}
