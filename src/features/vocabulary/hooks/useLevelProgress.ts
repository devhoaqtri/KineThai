/**
 * Files each read word under its level and surfaces a word milestone once that word is
 * finished. The same split as ./useStreak: lib/level-progress decides what is earned, this
 * owns the read, the write and which badge is being celebrated right now.
 *
 * A milestone is EARNED when the word is viewed (its answer held the screen, lib/history),
 * because that is when a word counts. It is SHOWN only at `release`, which the feed calls
 * when the word finishes, the moment a streak or daily badge appears: celebrating at the
 * view put the badge over the reveal and the spelling coda, and the word was cut off.
 * Shown at the word's end, the badge stands between two words; the stream is suspended
 * under it, so the next word starts from its first clue when the badge goes.
 *
 * Exports: useLevelProgress
 * Depends on: React, ../lib/level-progress, ../lib/word-badges
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  /** Show the milestone the last viewed word earned, if any: call when that word finishes. */
  release: () => void;
  dismiss: () => void;
} {
  const { scopes, levelCounts } = useMemo(() => progressScopes(locale), [locale]);
  const [seen, setSeen] = useState<LevelProgress>(() => readProgress().seen);
  const [celebrating, setCelebrating] = useState<WordMilestone | null>(null);
  // Earned, waiting for its word to finish. A ref: holding it changes nothing on screen.
  const pending = useRef<WordMilestone[]>([]);

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
      if (reached.length) pending.current = [...pending.current, ...reached];
    },
    [scopes, levelCounts],
  );

  const release = useCallback(() => {
    if (!pending.current.length) return;
    const milestone = headline(pending.current);
    pending.current = [];
    setCelebrating(milestone);
  }, []);

  const dismiss = useCallback(() => setCelebrating(null), []);

  return { seen, record, celebrating, release, dismiss };
}
