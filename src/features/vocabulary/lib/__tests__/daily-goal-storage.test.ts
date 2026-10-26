import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DAILY_GOALS,
  DAILY_GOAL_EVENT,
  DAILY_GOAL_KEY,
  emptyDailyGoal,
  parseDailyGoal,
  readDailyGoal,
  recordDailyWord,
  wordsToday,
  writeDailyGoal,
  type DailyGoalStore,
} from "../daily-goal";
import { startOfDay } from "../day";

const NOW = Date.now();
const TODAY = startOfDay(NOW);
const noon = (dayStart: number) => dayStart + 12 * 60 * 60 * 1000;
const back = (n: number) => {
  let t = TODAY;
  for (let i = 0; i < n; i += 1) {
    const d = new Date(t);
    d.setDate(d.getDate() - 1);
    d.setHours(0, 0, 0, 0);
    t = d.getTime();
  }
  return t;
};
const DAY = (n: number) => back(n);
const AT = noon(TODAY);
const words = (n: number, prefix: string) => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

function makeStorage(init: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(init));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
}

function stubStorage(init: Record<string, string> = {}) {
  const ls = makeStorage(init);
  vi.stubGlobal("window", { localStorage: ls, dispatchEvent: vi.fn() });
  vi.stubGlobal("localStorage", ls);
  return ls;
}

afterEach(() => vi.unstubAllGlobals());

describe("daily-goal constants", () => {
  it("the goals are 10, 25 and 50 ascending", () => expect(DAILY_GOALS).toEqual([10, 25, 50]));
  it("the storage key is namespaced", () =>
    expect(DAILY_GOAL_KEY).toBe("kinetic.vocab.daily-goal"));
  it("the same-tab event is namespaced", () =>
    expect(DAILY_GOAL_EVENT).toBe("kinetic:vocab-daily-goal"));
});

describe("recordDailyWord ceiling and repeats", () => {
  it("returns the identical store once every goal is met for the day", () => {
    let store: DailyGoalStore = emptyDailyGoal();
    for (const id of words(50, "a")) store = recordDailyWord(store, id, AT).store;
    expect(wordsToday(store, AT)).toBe(50);
    expect(recordDailyWord(store, "extra", AT).store).toBe(store);
  });
  it("does not recount a word already finished today", () => {
    const first = recordDailyWord(emptyDailyGoal(), "a", AT).store;
    expect(recordDailyWord(first, "a", AT).store).toBe(first);
  });
  it("reaches nothing between goal rungs", () => {
    let store: DailyGoalStore = emptyDailyGoal();
    for (const id of words(14, "a")) store = recordDailyWord(store, id, AT).store;
    expect(store.times).toEqual({ 10: 1, 25: 0, 50: 0 });
  });
});

describe("parseDailyGoal defensive reads", () => {
  it("drops a non-integer count", () => {
    const raw = JSON.stringify({ times: { 10: 2.5, 25: 1, 50: 0 } });
    expect(parseDailyGoal(raw, AT).times[10]).toBe(0);
  });
  it("drops a zero or negative count", () => {
    const raw = JSON.stringify({ times: { 10: 0, 25: -3, 50: 4 } });
    const times = parseDailyGoal(raw, AT).times;
    expect(times[10]).toBe(0);
    expect(times[25]).toBe(0);
    expect(times[50]).toBe(4);
  });
  it("ignores an unknown times key", () => {
    const raw = JSON.stringify({ times: { 10: 3, 99: 7 } });
    expect(parseDailyGoal(raw, AT).times).toEqual({ 10: 3, 25: 0, 50: 0 });
  });
  it("keeps only a pending day that is today", () => {
    const today = JSON.stringify({ times: { 10: 0, 25: 0, 50: 0 }, pending: { day: DAY(0), words: ["a"] } });
    expect(parseDailyGoal(today, AT).pending?.words).toEqual(["a"]);
    const stale = JSON.stringify({ pending: { day: DAY(2), words: ["a"] } });
    expect(parseDailyGoal(stale, AT).pending).toBeUndefined();
  });
  it("drops a pending entry with non-string words", () => {
    const raw = JSON.stringify({ pending: { day: DAY(0), words: [1, 2] } });
    expect(parseDailyGoal(raw, AT).pending).toBeUndefined();
  });
  it("caps the pending words at the largest goal", () => {
    const many = words(80, "w");
    const raw = JSON.stringify({ pending: { day: DAY(0), words: many } });
    expect(parseDailyGoal(raw, AT).pending?.words).toHaveLength(50);
  });
});

describe("readDailyGoal", () => {
  it("returns an empty store when there is no window", () => {
    expect(readDailyGoal(AT)).toEqual(emptyDailyGoal());
  });
  it("returns an empty store when nothing is stored", () => {
    stubStorage();
    expect(readDailyGoal(AT)).toEqual(emptyDailyGoal());
  });
  it("reads back a stored value", () => {
    stubStorage({ [DAILY_GOAL_KEY]: JSON.stringify({ times: { 10: 4, 25: 1, 50: 0 } }) });
    expect(readDailyGoal(AT).times[10]).toBe(4);
  });
  it("degrades to empty on corrupt JSON", () => {
    stubStorage({ [DAILY_GOAL_KEY]: "{oops" });
    expect(readDailyGoal(AT)).toEqual(emptyDailyGoal());
  });
});

describe("writeDailyGoal", () => {
  it("persists the store and signals this tab", () => {
    const ls = stubStorage();
    const store: DailyGoalStore = { times: { 10: 2, 25: 0, 50: 0 } };
    writeDailyGoal(store);
    expect(ls.getItem(DAILY_GOAL_KEY)).toBe(JSON.stringify(store));
    expect(window.dispatchEvent).toHaveBeenCalledWith(new Event(DAILY_GOAL_EVENT));
  });
  it("still dispatches when the write throws", () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal("window", {
      dispatchEvent,
      localStorage: {
        setItem: () => {
          throw new Error("quota");
        },
        getItem: () => null,
      },
    });
    vi.stubGlobal("localStorage", {
      setItem: () => {
        throw new Error("quota");
      },
      getItem: () => null,
    });
    writeDailyGoal(emptyDailyGoal());
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
  });
  it("throws on the server where there is no window", () => {
    // writeDailyGoal dispatches unconditionally; without a window it cannot.
    expect(() => writeDailyGoal(emptyDailyGoal())).toThrow();
  });
});
