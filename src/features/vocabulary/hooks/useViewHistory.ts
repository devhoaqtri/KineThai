/** React binding for the on-device viewing history. Exports: useViewHistory. Depends on: history lib. */
import { useCallback, useEffect, useState } from "react";
import {
  HISTORY_KEY,
  historyStats,
  loadHistory,
  recordView,
  saveHistory,
  type ViewHistory,
} from "../lib/history";
import { clearRecallMarks } from "../lib/recall-marks";
import { clearRecallWords } from "../lib/recall-words";

/** Keep view history in state, persisted to localStorage and synced across tabs. @returns History map, recorder, and clearer. */
export function useViewHistory() {
  const [history, setHistory] = useState<ViewHistory>(() => loadHistory());
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === HISTORY_KEY) setHistory(loadHistory());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  const record = useCallback((wordId: string) => {
    if (!wordId) return;
    setHistory((previous) => {
      const now = Date.now();
      const times = previous[wordId] ?? [];
      // Coalesce double-mounts / jitter: ignore a repeat within 5s of the last record.
      if (times.length && now - times[times.length - 1] < 5_000) return previous;
      const next = recordView(previous, wordId, now);
      saveHistory(next);
      return next;
    });
  }, []);
  const clear = useCallback(() => {
    setHistory({});
    try {
      localStorage.removeItem(HISTORY_KEY);
    } catch {
      // Ignore privacy-mode failures.
    }
    clearRecallWords();
    clearRecallMarks();
  }, []);
  return { history, record, clear, stats: historyStats(history) };
}
