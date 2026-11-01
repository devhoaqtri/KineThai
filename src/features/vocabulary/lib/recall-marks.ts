/**
 * What the reader answered for each word during self-revision.
 *
 * "yes" is a check (they still remember the meaning). "no" is the X. A word with
 * neither is unchecked, and an unchecked word counts as not remembering — only
 * checks add to the tally. The answer stays on this device. An older store that
 * only listed remembered ids is read as checks.
 *
 * Exports: RECALL_MARKS_KEY, RecallChoice, RecallMarks, loadRecallMarks, saveRecallMarks,
 *   clearRecallMarks
 * Depends on: localStorage only
 */

export const RECALL_MARKS_KEY = "wordcrawler:recall-marks:v1";

export type RecallChoice = "yes" | "no";
export type RecallMarks = Record<string, RecallChoice>;

function isChoice(value: unknown): value is RecallChoice {
  return value === "yes" || value === "no";
}

/** @returns The stored answers, or an empty record when nothing usable is stored. */
export function loadRecallMarks(): RecallMarks {
  try {
    if (typeof localStorage === "undefined") return {};
    const raw = localStorage.getItem(RECALL_MARKS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    const marks: RecallMarks = {};
    // The first version stored only the ids that were marked "nhớ".
    if (Array.isArray(parsed)) {
      for (const id of parsed) if (typeof id === "string" && id.length > 0) marks[id] = "yes";
      return marks;
    }
    if (typeof parsed !== "object" || parsed === null) return {};
    for (const [id, value] of Object.entries(parsed)) {
      if (id.length > 0 && isChoice(value)) marks[id] = value;
    }
    return marks;
  } catch {
    return {};
  }
}

/** @param marks Answers currently chosen. Never throws. */
export function saveRecallMarks(marks: RecallMarks): void {
  try {
    if (typeof localStorage === "undefined") return;
    const entries = Object.entries(marks)
      .filter((entry): entry is [string, RecallChoice] => isChoice(entry[1]))
      .sort(([a], [b]) => a.localeCompare(b));
    localStorage.setItem(RECALL_MARKS_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Quota or privacy mode — the answer stays in memory for this visit.
  }
}

/** Forget every answer, alongside the history they belong to. Never throws. */
export function clearRecallMarks(): void {
  try {
    localStorage.removeItem(RECALL_MARKS_KEY);
  } catch {
    // Ignore privacy-mode failures.
  }
}
