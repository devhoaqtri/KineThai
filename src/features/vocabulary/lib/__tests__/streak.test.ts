import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DAY_LIMIT,
  DAY_MIN_WORDS,
  MILESTONES,
  STREAK_EVENT,
  STREAK_KEY,
  currentStreak,
  emptyStreak,
  milestonesReached,
  parseStreak,
  readStreak,
  recordFinishedWord,
  streakRepeatsEarned,
  streakRunsCompleted,
  writeStreak,
  type StreakStore,
} from "../streak";
import { startOfDay, previousDay } from "../day";

// A streak is a claim about *today*: currentStreak only reads a run ending today or
// yesterday, so a run built from a fixed past date would already be lapsed and award
// nothing. We therefore anchor every fixture to the real current day and step back
// through previousDay, which stays correct across DST and month boundaries.
const NOW = Date.now();
const TODAY = startOfDay(NOW);
const AT = TODAY;
const noon = (dayStart: number) => dayStart + 12 * 60 * 60 * 1000;
const back = (n: number) => {
  let t = TODAY;
  for (let i = 0; i < n; i += 1) t = previousDay(t);
  return t;
};
const DAY = (n: number) => back(n);

function consecutive(count: number, newestBack = 0): number[] {
  return Array.from({ length: count }, (_, i) => DAY(newestBack + i));
}
function reached(days: number): number[] {
  return MILESTONES.filter((m) => days >= m);
}
function storeFrom(days: number[], earned?: number[]): StreakStore {
  return { days, earned: earned ?? reached(days.length), repeats: [] };
}
const NOON = noon(TODAY);
// Finish today as the next day of a run whose prior days end yesterday. Three fresh
// words today are needed because a day only qualifies on its DAY_MIN_WORDS-th word.
function finishToday(
  priorDays: number[],
  earned: number[],
  at: number = NOON,
): { celebrate: number[]; store: StreakStore } {
  let store: StreakStore = { days: priorDays, earned, repeats: [] };
  let celebrate: number[] = [];
  for (const id of ["w1", "w2", "w3"]) {
    const r = recordFinishedWord(store, id, at);
    store = r.store;
    if (r.celebrate.length) celebrate = r.celebrate;
  }
  return { celebrate, store };
}

function makeStorage(init: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(init));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("constants", () => {
  it("the milestone ladder starts at 3 and ends at 365", () => {
    expect(MILESTONES[0]).toBe(3);
    expect(MILESTONES.at(-1)).toBe(365);
  });
  it("the ladder is strictly ascending", () => {
    for (let i = 1; i < MILESTONES.length; i += 1) {
      expect(MILESTONES[i]!).toBeGreaterThan(MILESTONES[i - 1]!);
    }
  });
  it("a day needs three distinct words to qualify", () => expect(DAY_MIN_WORDS).toBe(3));
  it("the log is capped at 400 days", () => expect(DAY_LIMIT).toBe(400));
  it("the storage keys are namespaced under kinetic.vocab", () => {
    expect(STREAK_KEY).toBe("kinetic.vocab.streak");
    expect(STREAK_EVENT).toBe("kinetic:vocab-streak");
  });
});

describe("emptyStreak", () => {
  it("has no days and nothing earned", () => {
    expect(emptyStreak()).toEqual({ days: [], earned: [], repeats: [] });
  });
  it("returns a fresh object each call", () => {
    const a = emptyStreak();
    a.days.push(1);
    expect(emptyStreak().days).toHaveLength(0);
  });
});

describe("milestonesReached", () => {
  it("reaches nothing under three days", () => {
    expect(milestonesReached(0)).toEqual([]);
    expect(milestonesReached(2)).toEqual([]);
  });
  it("reaches 3 at exactly three days", () => {
    expect(milestonesReached(3)).toEqual([3]);
  });
  it("reaches 3 and 7 at seven days", () => {
    expect(milestonesReached(7)).toEqual([3, 7]);
  });
  it("reaches the whole ladder at a year", () => {
    expect(milestonesReached(365)).toEqual([...MILESTONES]);
  });
  it("caps at the ladder past 365", () => {
    expect(milestonesReached(500)).toEqual([...MILESTONES]);
  });
});

describe("currentStreak", () => {
  it("is zero for an empty log", () => {
    expect(currentStreak(emptyStreak(), AT)).toBe(0);
  });
  it("is one for a single qualifying day today", () => {
    expect(currentStreak({ days: [DAY(0)], earned: [], repeats: [] }, AT)).toBe(1);
  });
  it("still reads one when the run is anchored today", () => {
    expect(currentStreak({ days: consecutive(1), earned: [], repeats: [] }, AT)).toBe(1);
  });
  it("counts a full run ending today", () => {
    expect(currentStreak({ days: consecutive(5), earned: [], repeats: [] }, AT)).toBe(5);
  });
  it("anchors on yesterday too, before today has qualified", () => {
    expect(currentStreak({ days: consecutive(3, 1), earned: [], repeats: [] }, AT)).toBe(3);
  });
  it("is zero when the newest day is two days back", () => {
    expect(currentStreak({ days: consecutive(3, 2), earned: [], repeats: [] }, AT)).toBe(0);
  });
  it("stops the walk at the first gap", () => {
    // Today, yesterday, then a missing day before an older one.
    const days = [DAY(0), DAY(1), DAY(3)];
    expect(currentStreak({ days, earned: [], repeats: [] }, AT)).toBe(2);
  });
  it("ignores a pending day that has not qualified", () => {
    const store = {
      days: consecutive(2),
      earned: [],
      pending: { day: DAY(0), words: ["a"] },
      repeats: [],
    };
    expect(currentStreak(store, AT)).toBe(2);
  });
  it("does not mutate the store it reads", () => {
    const store = { days: consecutive(3), earned: [], repeats: [] };
    currentStreak(store, AT);
    expect(store.days).toHaveLength(3);
  });
});

describe("recordFinishedWord", () => {
  it("is a no-op when today already qualified", () => {
    const store = { days: [DAY(0), DAY(1), DAY(2)], earned: [3], repeats: [] };
    expect(recordFinishedWord(store, "w", AT)).toEqual({ store, celebrate: [] });
  });
  it("starts a pending day with the first word", () => {
    const { store, celebrate } = recordFinishedWord(emptyStreak(), "a", AT);
    expect(store.pending).toEqual({ day: DAY(0), words: ["a"] });
    expect(celebrate).toEqual([]);
  });
  it("does not count the same word twice in a day", () => {
    const first = recordFinishedWord(emptyStreak(), "a", AT).store;
    expect(recordFinishedWord(first, "a", AT)).toEqual({ store: first, celebrate: [] });
  });
  it("accumulates distinct words below the threshold", () => {
    const one = recordFinishedWord(emptyStreak(), "a", AT).store;
    const two = recordFinishedWord(one, "b", AT).store;
    expect(two.pending?.words).toEqual(["a", "b"]);
    expect(two.days).toEqual([]);
  });
  it("qualifies the day on the third distinct word", () => {
    const one = recordFinishedWord(emptyStreak(), "a", AT).store;
    const two = recordFinishedWord(one, "b", AT).store;
    const { store } = recordFinishedWord(two, "c", AT);
    expect(store.days).toEqual([DAY(0)]);
    expect(store.pending).toBeUndefined();
  });
  it("fires the 3-day milestone when the run reaches three days", () => {
    // Two prior qualifying days, ending yesterday; today becomes the third.
    const prior = [DAY(1), DAY(2)];
    const { celebrate, store } = finishToday(prior, []);
    expect(celebrate).toEqual([3]);
    expect(store.earned).toEqual([3]);
    expect(store.days[0]).toBe(DAY(0));
  });
  it("fires nothing for a run that has not reached a rung", () => {
    // Two prior days plus today reaches three, so start one short: only one prior day.
    const { celebrate, store } = finishToday([DAY(1)], []);
    expect(celebrate).toEqual([]);
    expect(store.earned).toEqual([]);
  });
  it("never re-fires a milestone already earned", () => {
    // Today will be the fourth day; 3 is already banked, and 4 is not a rung.
    const prior = [DAY(1), DAY(2), DAY(3)];
    const { celebrate } = finishToday(prior, [3]);
    expect(celebrate).toEqual([]);
  });
  it("fires the 7-day milestone when the run reaches a week", () => {
    const prior = consecutive(6, 1); // 6 days ending yesterday, milestone 3 banked
    const { celebrate, store } = finishToday(prior, [3]);
    expect(celebrate).toEqual([7]);
    expect(store.earned).toEqual([3, 7]);
  });
  it("advances a run anchored on yesterday into today", () => {
    const prior = consecutive(2, 1);
    const { store } = finishToday(prior, []);
    expect(store.days[0]).toBe(DAY(0));
    expect(currentStreak(store, NOON)).toBe(3);
  });
  it("a broken run restarts at a single day", () => {
    const store = storeFrom(consecutive(2, 5), []); // newest is 5 days back: lapsed
    const afterDay1 = recordFinishedWord(store, "a", AT).store;
    const afterDay2 = recordFinishedWord(afterDay1, "b", AT).store;
    const { store: qualified } = recordFinishedWord(afterDay2, "c", AT);
    expect(currentStreak(qualified, AT)).toBe(1);
  });
  it("sorts newly earned milestones ascending", () => {
    const prior = consecutive(6, 1); // completing the 7th day
    const { store } = finishToday(prior, []);
    expect(store.earned).toEqual([3, 7]);
  });
  it("caps the day log at DAY_LIMIT, dropping the oldest", () => {
    const days = Array.from({ length: DAY_LIMIT }, (_, i) => DAY(i + 1)); // 400 days ending yesterday
    const { store } = finishToday(days, reached(DAY_LIMIT));
    expect(store.days).toHaveLength(DAY_LIMIT);
    expect(store.days[0]).toBe(DAY(0));
    expect(store.days.at(-1)).toBe(DAY(DAY_LIMIT - 1));
  });
});

describe("parseStreak", () => {
  it("returns an empty store for null", () => {
    expect(parseStreak(null, AT)).toEqual(emptyStreak());
  });
  it("returns an empty store for unparseable JSON", () => {
    expect(parseStreak("not json", AT)).toEqual(emptyStreak());
  });
  it("returns an empty store for a bare array", () => {
    expect(parseStreak("[]", AT)).toEqual(emptyStreak());
  });
  it("keeps a well-formed store and drops non-finite days", () => {
    const raw = JSON.stringify({ days: [DAY(0), "x", null, DAY(1)], earned: [], repeats: [] });
    expect(parseStreak(raw, AT).days).toEqual([DAY(0), DAY(1)]);
  });
  it("drops a day stamped in the future", () => {
    const raw = JSON.stringify({
      days: [DAY(0) + 5 * 24 * 60 * 60 * 1000, DAY(1)],
      earned: [],
      repeats: [],
    });
    expect(parseStreak(raw, AT).days).toEqual([DAY(1)]);
  });
  it("drops a day older than the cap", () => {
    const raw = JSON.stringify({ days: [DAY(0), back(DAY_LIMIT + 50)], earned: [], repeats: [] });
    expect(parseStreak(raw, AT).days).toEqual([DAY(0)]);
  });
  it("deduplicates days", () => {
    const raw = JSON.stringify({ days: [DAY(0), DAY(0), DAY(1)], earned: [], repeats: [] });
    expect(parseStreak(raw, AT).days).toEqual([DAY(0), DAY(1)]);
  });
  it("sorts days newest first", () => {
    const raw = JSON.stringify({ days: [DAY(2), DAY(0), DAY(1)], earned: [], repeats: [] });
    expect(parseStreak(raw, AT).days).toEqual([DAY(0), DAY(1), DAY(2)]);
  });
  it("truncates to DAY_LIMIT days", () => {
    const many = Array.from({ length: DAY_LIMIT + 20 }, (_, i) => DAY(i));
    const raw = JSON.stringify({ days: many, earned: [], repeats: [] });
    expect(parseStreak(raw, AT).days).toHaveLength(DAY_LIMIT);
  });
  it("seeds an absent earned from the lived streak", () => {
    const raw = JSON.stringify({ days: consecutive(3) });
    expect(parseStreak(raw, AT).earned).toEqual([3]);
  });
  it("does not seed a present-but-empty earned", () => {
    const raw = JSON.stringify({ days: consecutive(3), earned: [], repeats: [] });
    expect(parseStreak(raw, AT).earned).toEqual([]);
  });
  it("filters an earned list to ladder and retired milestones", () => {
    const raw = JSON.stringify({ days: consecutive(3), earned: [3, 5, 99], repeats: [] });
    expect(parseStreak(raw, AT).earned).toEqual([3, 5]);
  });
  it("keeps a retired milestone a reader already earned", () => {
    const raw = JSON.stringify({ days: consecutive(3), earned: [5], repeats: [] });
    expect(parseStreak(raw, AT).earned).toEqual([5]);
  });
  it("sorts a restored earned list ascending", () => {
    const raw = JSON.stringify({ days: consecutive(3), earned: [7, 3], repeats: [] });
    expect(parseStreak(raw, AT).earned).toEqual([3, 7]);
  });
  it("keeps a pending day only when it is today", () => {
    const raw = JSON.stringify({ days: [], pending: { day: DAY(0), words: ["a", "b"] } });
    expect(parseStreak(raw, AT).pending).toEqual({ day: DAY(0), words: ["a", "b"] });
    const stale = JSON.stringify({ days: [], pending: { day: DAY(1), words: ["a"] } });
    expect(parseStreak(stale, AT).pending).toBeUndefined();
  });
  it("drops a pending day that already qualified", () => {
    const raw = JSON.stringify({
      days: [DAY(0)],
      earned: [],
      pending: { day: DAY(0), words: ["a"] },
    });
    expect(parseStreak(raw, AT).pending).toBeUndefined();
  });
  it("caps and deduplicates pending words", () => {
    const raw = JSON.stringify({
      days: [],
      pending: { day: DAY(0), words: ["a", "a", "b", "c", "d"] },
    });
    // Words are capped at DAY_MIN_WORDS *before* de-duplicating, so a repeat inside the
    // first three leaves fewer than three distinct survivors.
    expect(parseStreak(raw, AT).pending?.words).toEqual(["a", "b"]);
  });
  it("drops non-string pending words", () => {
    const raw = JSON.stringify({ days: [], pending: { day: DAY(0), words: [1, "a", null] } });
    expect(parseStreak(raw, AT).pending?.words).toEqual(["a"]);
  });
  it("normalises a mid-day timestamp to local midnight", () => {
    const raw = JSON.stringify({ days: [noon(DAY(0)), noon(DAY(1))], earned: [], repeats: [] });
    expect(parseStreak(raw, AT).days).toEqual([DAY(0), DAY(1)]);
  });
});

describe("readStreak", () => {
  it("returns an empty store when there is no window", () => {
    // No window/localStorage stubbed: the guard fires before any storage read.
    expect(readStreak(AT)).toEqual(emptyStreak());
  });
  it("reads a stored value back through parseStreak", () => {
    const ls = makeStorage({
      [STREAK_KEY]: JSON.stringify({ days: consecutive(3), earned: [], repeats: [] }),
    });
    vi.stubGlobal("window", { localStorage: ls });
    vi.stubGlobal("localStorage", ls);
    expect(currentStreak(readStreak(AT), AT)).toBe(3);
  });
  it("degrades to an empty store when storage throws", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
      },
    });
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
    });
    expect(readStreak(AT)).toEqual(emptyStreak());
  });
});

describe("writeStreak", () => {
  it("persists the store and signals this tab", () => {
    const ls = makeStorage();
    const dispatchEvent = vi.fn();
    vi.stubGlobal("window", { localStorage: ls, dispatchEvent });
    vi.stubGlobal("localStorage", ls);
    const store = storeFrom(consecutive(3), [3]);
    writeStreak(store);
    expect(ls.getItem(STREAK_KEY)).toBe(JSON.stringify(store));
    expect(dispatchEvent).toHaveBeenCalledWith(new Event(STREAK_EVENT));
  });
  it("still dispatches when the write throws (the celebration is the point)", () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal("window", {
      localStorage: {
        setItem: () => {
          throw new Error("quota");
        },
      },
      dispatchEvent,
    });
    writeStreak(storeFrom(consecutive(1), []));
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
  });
  it("does nothing on the server where there is no window", () => {
    expect(() => writeStreak(storeFrom(consecutive(1), []))).not.toThrow();
  });
});

describe("streakRunsCompleted", () => {
  const run = (from: number, length: number) => Array.from({ length }, (_, i) => back(from + i));
  it("counts each full stretch of a long run", () => {
    expect(streakRunsCompleted(run(0, 9), 3)).toBe(3);
    expect(streakRunsCompleted(run(0, 8), 3)).toBe(2);
  });
  it("adds up separate runs and never joins them across a gap", () => {
    // 4 days, a missed day, then 2 days: one 3-day run, not two.
    expect(streakRunsCompleted([...run(0, 4), ...run(5, 2)], 3)).toBe(1);
    expect(streakRunsCompleted([...run(0, 3), ...run(4, 3)], 3)).toBe(2);
  });
  it("is zero with no days or no length", () => {
    expect(streakRunsCompleted([], 3)).toBe(0);
    expect(streakRunsCompleted(run(0, 5), 0)).toBe(0);
  });
});

describe("repeat badges", () => {
  const DAY = 24 * 60 * 60 * 1000;
  // Five separate 3-day runs, a clear day between each.
  const earlyRuns = () => {
    const days: number[] = [];
    for (let run = 0; run < 5; run += 1) {
      for (let day = 0; day < 3; day += 1) days.push(back(run * 4 + day));
    }
    return days;
  };
  const stored = (extra: object = {}) =>
    JSON.stringify({ days: earlyRuns(), earned: [3], ...extra });

  it("is earned once the runs are completed", () => {
    expect(streakRepeatsEarned(earlyRuns(), [3], [])).toEqual([3]);
  });
  it("needs its run to have been earned first", () => {
    expect(streakRepeatsEarned(earlyRuns(), [], [])).toEqual([]);
  });
  it("is recorded on the day that completes it", () => {
    const days = earlyRuns().slice(1);
    let store: StreakStore = { days, earned: [3], repeats: [] };
    for (const word of ["a", "b", "c"]) store = recordFinishedWord(store, word, AT).store;
    expect(store.repeats).toEqual([3]);
  });
  it.each([300, 395, 410, 1000])("survives %i days away", (away) => {
    expect(parseStreak(stored(), AT + away * DAY).repeats).toEqual([3]);
  });
  it("is kept by a reader whose old days have already gone", () => {
    const raw = JSON.stringify({ days: [], earned: [3], repeats: [3] });
    expect(parseStreak(raw, AT).repeats).toEqual([3]);
  });
  it("survives a return after the days have aged out and a new day is written", () => {
    const later = AT + 500 * DAY;
    let store = parseStreak(stored(), later);
    expect(store.days).toEqual([]);
    for (const word of ["a", "b", "c"]) store = recordFinishedWord(store, word, later).store;
    const next = parseStreak(JSON.stringify(store), later + 500 * DAY);
    expect(next.repeats).toEqual([3]);
  });
  it("ignores a stored value that is not a repeat", () => {
    const raw = JSON.stringify({ days: [], earned: [3], repeats: [3, 4, "7", null] });
    expect(parseStreak(raw, AT).repeats).toEqual([3]);
  });
});
