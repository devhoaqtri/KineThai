import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LEVEL_PROGRESS_KEY,
  milestonesReached,
  parseMilestoneKey,
  readProgress,
  recordSeenWord,
  scopeProgress,
  tierProgress,
  type ProgressScope,
  type ProgressStore,
} from "../level-progress";

const ids = (n: number, prefix: string) => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

describe("scopeProgress", () => {
  it("caps each level at its own size and adds levels up", () => {
    const seen = { A1: ids(30, "a"), A2: ids(30, "b") };
    expect(scopeProgress(["A1", "A2"], seen, { A1: 300, A2: 12 })).toEqual({
      seen: 42,
      total: 312,
    });
  });
});

describe("tierProgress", () => {
  it("fills towards the next hundred", () => {
    expect(tierProgress(40, 635)).toEqual({ from: 0, target: 100, ratio: 0.4 });
  });
  it("starts over towards 200 the moment 100 is reached", () => {
    expect(tierProgress(100, 635)).toEqual({ from: 100, target: 200, ratio: 0 });
  });
  it("aims the last stretch at the scope's own size", () => {
    expect(tierProgress(610, 635)).toEqual({ from: 600, target: 635, ratio: 10 / 35 });
  });
  it("is full once the scope is finished", () => {
    expect(tierProgress(635, 635)).toEqual({ from: 635, target: 635, ratio: 1 });
  });
  it("is empty for a scope with no words", () => {
    expect(tierProgress(0, 0).ratio).toBe(0);
  });
});

describe("milestonesReached", () => {
  it("lists every hundred, then the scope's size when finished", () => {
    expect(milestonesReached("all", 250, 635).map((m) => m.words)).toEqual([100, 200]);
    const done = milestonesReached("all", 635, 635);
    expect(done.map((m) => m.words)).toEqual([100, 200, 300, 400, 500, 600, 635]);
    expect(done.at(-1)?.complete).toBe(true);
  });
  it("does not add a duplicate when the size is a round hundred", () => {
    const done = milestonesReached("a2", 200, 200);
    expect(done.map((m) => [m.words, m.complete])).toEqual([
      [100, false],
      [200, true],
    ]);
  });
});

describe("recordSeenWord", () => {
  const scopes: ProgressScope[] = [
    { id: "all", levels: ["A1", "A2"] },
    { id: "vo-long", levels: ["A1"] },
  ];
  const counts = { A1: 150, A2: 125 };

  it("counts a word once and leaves the store untouched on a repeat", () => {
    const first = recordSeenWord({ seen: {}, earned: [] }, "A1", "w", scopes, counts);
    expect(first.store.seen.A1).toEqual(["w"]);
    expect(recordSeenWord(first.store, "A1", "w", scopes, counts).store).toBe(first.store);
  });

  it("keeps every word past the first hundred", () => {
    let store: ProgressStore = { seen: {}, earned: [] };
    for (const id of ids(140, "a")) store = recordSeenWord(store, "A1", id, scopes, counts).store;
    expect(store.seen.A1).toHaveLength(140);
  });

  it("earns each crossed milestone once, for every scope the word is in", () => {
    let store: ProgressStore = { seen: { A1: ids(99, "a") }, earned: [] };
    const crossing = recordSeenWord(store, "A1", "a99", scopes, counts);
    expect(crossing.reached.map((m) => `${m.scope}:${m.words}`)).toEqual([
      "all:100",
      "vo-long:100",
    ]);
    store = crossing.store;
    expect(recordSeenWord(store, "A1", "a100", scopes, counts).reached).toEqual([]);
    // An A2 word moves "all" but not the A1-only track.
    const a2 = recordSeenWord(store, "A2", "b0", scopes, counts);
    expect(a2.reached).toEqual([]);
    expect(a2.store.earned).toEqual(["all:100", "vo-long:100"]);
  });
});

describe("parseMilestoneKey", () => {
  it("splits on the last colon", () => {
    expect(parseMilestoneKey("vo-long:200")).toEqual({ scope: "vo-long", words: 200 });
    expect(parseMilestoneKey("broken")).toBeNull();
  });
});

describe("readProgress", () => {
  // The suite runs in Node, which has no Web Storage: a Map stands in for it.
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("carries the first shape's seen ids over, once", () => {
    localStorage.setItem("kinetic.vocab.level-progress.v1", JSON.stringify({ A1: ["x", "y"] }));
    expect(readProgress()).toEqual({ seen: { A1: ["x", "y"] }, earned: [] });
    expect(localStorage.getItem("kinetic.vocab.level-progress.v1")).toBeNull();
    expect(JSON.parse(localStorage.getItem(LEVEL_PROGRESS_KEY) ?? "null")).toEqual({
      seen: { A1: ["x", "y"] },
      earned: [],
    });
  });
});
