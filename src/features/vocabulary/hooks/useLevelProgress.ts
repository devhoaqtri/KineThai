/**
 * Files each read word under its level and surfaces a word milestone the moment it is
 * earned. The same split as ./useStreak: lib/level-progress decides what is earned, this
 * owns the read, the write and which badge is being celebrated right now.
 *
 * Exports: useLevelProgress
 * Depends on: React, ../lib/level-progress, ../lib/word-badges
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ALL_SCOPE, progressScopes } from "../lib/word-badges";
import {
  LEVEL_PROGRESS_EVENT,
  LEVEL_PROGRESS_KEY,
  readProgress,
  recordSeenWord,
  writeProgress,
  type LevelProgress,
  type WordMilestone,
} from "../lib/level-progress";
import type { VocabularyLevel } from "../lib/schema";
import type { TargetLocale } from "../lib/target-language";

/**
 * One word can cross several milestones at once (the tracks overlap, and "all" spans
 * them). All are earned and land on the shelf, but only one takes the screen: the overall
 * one when it is among them, otherwise the biggest.
 */
function headline(reached: WordMilestone[]): WordMilestone {
  const overall = reached.find((milestone) => milestone.scope === ALL_SCOPE);
  return overall ?? reached.reduce((best, next) => (next.words > best.words ? next : best));
}

/**
 * @param locale The host's deck locale: decides the scopes and their sizes
 * @returns Seen words per level, the recorder, and the celebration in progress
 */
export function useLevelProgress(locale: TargetLocale): {
  seen: LevelProgress;
  record: (level: VocabularyLevel, wordId: string) => void;
  celebrating: WordMilestone | null;
  dismiss: () => void;
} {
  const { scopes, levelCounts } = useMemo(() => progressScopes(locale), [locale]);
  const [seen, setSeen] = useState<LevelProgress>(() => readProgress().seen);
  const [celebrating, setCelebrating] = useState<WordMilestone | null>(null);

  useEffect(() => {
    const refresh = () => setSeen(readProgress().seen);
    const onStorage = (event: StorageEvent) => {
      if (event.key === LEVEL_PROGRESS_KEY) refresh();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(LEVEL_PROGRESS_EVENT, refresh);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(LEVEL_PROGRESS_EVENT, refresh);
    };
  }, []);

  const record = useCallback(
    (level: VocabularyLevel, wordId: string) => {
      // Read fresh rather than from state: another tab may have earned a milestone since,
      // and the store's `earned` list is what keeps a badge from being celebrated twice.
      const before = readProgress();
      const { store, reached } = recordSeenWord(before, level, wordId, scopes, levelCounts);
      if (store === before) return;
      writeProgress(store);
      if (reached.length) setCelebrating(headline(reached));
    },
    [scopes, levelCounts],
  );

  const dismiss = useCallback(() => setCelebrating(null), []);

  return { seen, record, celebrating, dismiss };
}
