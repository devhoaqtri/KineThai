/** React binding for per-level progress. Exports: useLevelProgress. Depends on: level-progress lib. */
import { useCallback, useEffect, useState } from "react";
import {
  LEVEL_PROGRESS_KEY,
  loadLevelProgress,
  recordLevelProgress,
  saveLevelProgress,
  type LevelProgress,
} from "../lib/level-progress";
import type { VocabularyLevel } from "../lib/schema";

/** Keep level progress in state, persisted to localStorage and synced across tabs. @returns Progress map and recorder. */
export function useLevelProgress() {
  const [progress, setProgress] = useState<LevelProgress>(() => loadLevelProgress());
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === LEVEL_PROGRESS_KEY) setProgress(loadLevelProgress());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  const record = useCallback((level: VocabularyLevel, wordId: string) => {
    setProgress((previous) => {
      const next = recordLevelProgress(previous, level, wordId);
      if (next !== previous) saveLevelProgress(next);
      return next;
    });
  }, []);
  return { progress, record };
}
