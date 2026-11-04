import { describe, expect, it } from "vitest";
import {
  RETRY_DELAYS_MS,
  backgroundRetryDelay,
  classifyFeedFailure,
  deriveSeed,
  loadFeedPageWithFallbacks,
  widenFilters,
} from "../feed-fallback";
import { readCatalogPage } from "../paging";
import type { FeedCursor, FeedPage, VocabularyFilters } from "../../types";
import { makeCatalog, makeWord } from "./helpers";

const fail = (code: string, retryAfterMs: number | null = null) =>
  Object.assign(new Error(code), { code, retryAfterMs });

// Five A1 food words, five B1 travel words: enough to tell the filters apart.
const catalog = makeCatalog([
  ...Array.from({ length: 5 }, (_, index) =>
    makeWord({ word: `food${index}`, level: "A1", topic: "food", topics: ["food"] }),
  ),
  ...Array.from({ length: 5 }, (_, index) =>
    makeWord({ word: `trip${index}`, level: "B1", topic: "travel", topics: ["travel"] }),
  ),
]);

const ALL: VocabularyFilters = { topic: "", level: "", difficulty: "" };

type Call = { seed: string; filters: VocabularyFilters; cursor: FeedCursor };

/**
 * A fake server: answers from the catalog, except that the scripted failures are thrown
 * first, one per call, in order.
 */
function harness(script: (Error | null)[] = []) {
  const calls: Call[] = [];
  const sleeps: number[] = [];
  const logs: string[] = [];
  const deps = {
    fetchPage: async (request: Call & { signal: AbortSignal }): Promise<FeedPage> => {
      calls.push({ seed: request.seed, filters: request.filters, cursor: request.cursor });
      const failure = script.shift();
      if (failure) throw failure;
      return readCatalogPage(catalog, {
        seed: request.seed,
        ...request.filters,
        position: request.cursor.position,
        limit: 4,
      });
    },
    sleep: async (ms: number) => {
      sleeps.push(ms);
    },
    now: () => 1_700_000_000_000,
    log: (cause: string) => {
      logs.push(cause);
    },
  };
  return { calls, sleeps, logs, deps };
}

const load = (
  deps: ReturnType<typeof harness>["deps"],
  cursor: FeedCursor = { position: 0 },
  filters: VocabularyFilters = ALL,
) =>
  loadFeedPageWithFallbacks(
    { seed: "seed0001", filters, cursor, signal: new AbortController().signal },
    deps,
  );

describe("classifyFeedFailure", () => {
  it.each([
    ["RATE_LIMITED", 12, "rate-limited"],
    ["CATALOG_CHANGED", 12, "stale-stream"],
    ["STREAM_EXPIRED", 12, "stale-stream"],
    ["INVALID_REQUEST", 12, "stale-stream"],
    ["INVALID_REQUEST", 0, "refused"],
    ["FORBIDDEN", 12, "refused"],
    ["UNAVAILABLE", 12, "transient"],
  ])("%s at position %i is %s", (code, position, kind) =>
    expect(classifyFeedFailure(fail(code), position)).toBe(kind),
  );

  it("treats a network error with no code as transient", () =>
    expect(classifyFeedFailure(new TypeError("Failed to fetch"), 12)).toBe("transient"));
});

describe("widenFilters", () => {
  it("drops the level, then the topic, then the track", () =>
    expect(widenFilters({ topic: "food", level: "B1", difficulty: "easy" })).toEqual([
      { topic: "food", level: "", difficulty: "easy" },
      { topic: "", level: "", difficulty: "easy" },
      { topic: "", level: "", difficulty: "" },
    ]));

  it("skips steps that change nothing", () =>
    expect(widenFilters({ topic: "food", level: "", difficulty: "" })).toEqual([ALL]));

  it("has nothing to offer an unfiltered stream", () => expect(widenFilters(ALL)).toEqual([]));
});

describe("deriveSeed", () => {
  it("stays inside the endpoint's seed pattern and does not stack suffixes", () => {
    const once = deriveSeed("a".repeat(64), 1_700_000_000_000);
    const twice = deriveSeed(once, 1_700_000_000_999);
    for (const seed of [once, twice]) expect(seed).toMatch(/^[a-zA-Z0-9_-]{8,64}$/);
    expect(twice.match(/-r/g)).toHaveLength(1);
  });
});

describe("backgroundRetryDelay", () => {
  it("backs off from 15 s and never waits past 5 min", () => {
    expect(backgroundRetryDelay("transient", 0, null)).toBe(15_000);
    expect(backgroundRetryDelay("transient", 2, null)).toBe(60_000);
    expect(backgroundRetryDelay("transient", 20, null)).toBe(300_000);
  });

  it("waits out a rate refusal exactly as the server asked", () =>
    expect(backgroundRetryDelay("rate-limited", 0, 42_000)).toBe(42_000));

  it("does not retry a refusal", () => expect(backgroundRetryDelay("refused", 0, null)).toBeNull());
});

describe("loadFeedPageWithFallbacks order", () => {
  it("serves the page as asked when nothing fails", async () => {
    const { calls, logs, deps } = harness();
    const page = await load(deps);
    expect(page.entries).toHaveLength(4);
    expect(calls).toHaveLength(1);
    expect(logs).toEqual([]);
    expect(page.scope).toBeUndefined();
  });

  it("1. retries a passing failure with backoff before anything else", async () => {
    const { calls, sleeps, logs, deps } = harness([fail("UNAVAILABLE"), new TypeError("offline")]);
    const page = await load(deps);
    expect(page.entries).toHaveLength(4);
    expect(sleeps).toEqual(RETRY_DELAYS_MS.slice(0, 2));
    expect(logs).toEqual(["retry", "retry"]);
    expect(calls.map((call) => call.seed)).toEqual(["seed0001", "seed0001", "seed0001"]);
  });

  it("gives up on a passing failure only after every backoff step", async () => {
    const script = Array.from({ length: RETRY_DELAYS_MS.length + 1 }, () => fail("UNAVAILABLE"));
    const { calls, sleeps, logs, deps } = harness(script);
    await expect(load(deps, { position: 12, revision: "ab12cd34", token: "t" })).rejects.toThrow(
      "UNAVAILABLE",
    );
    expect(sleeps).toEqual(RETRY_DELAYS_MS);
    expect(calls).toHaveLength(RETRY_DELAYS_MS.length + 1);
    expect(logs.at(-1)).toBe("failed");
  });

  it("2. drops a stale cursor and restarts the stream on a derived seed", async () => {
    const { calls, logs, deps } = harness([fail("CATALOG_CHANGED")]);
    const page = await load(deps, { position: 48, revision: "ab12cd34", token: "t" });
    expect(logs).toEqual(["restart"]);
    expect(calls[1].cursor).toEqual({ position: 0 });
    expect(calls[1].seed).not.toBe("seed0001");
    // The next page must ask with the derived seed, or it would hit the stale stream again.
    expect(page.seed).toBe(calls[1].seed);
    expect(page.entries).toHaveLength(4);
  });

  it("restarts an expired or unparsable cursor the same way", async () => {
    for (const code of ["STREAM_EXPIRED", "INVALID_REQUEST"]) {
      const { logs, deps } = harness([fail(code)]);
      await load(deps, { position: 12, revision: "zz", token: "t" });
      expect(logs).toEqual(["restart"]);
    }
  });

  it("retries the restarted stream with backoff too", async () => {
    const { sleeps, logs, deps } = harness([fail("STREAM_EXPIRED"), fail("UNAVAILABLE")]);
    const page = await load(deps, { position: 12, revision: "ab12cd34", token: "t" });
    expect(logs).toEqual(["restart", "retry"]);
    expect(sleeps).toEqual([RETRY_DELAYS_MS[0]]);
    expect(page.entries).toHaveLength(4);
  });

  it("3. widens filters that match nothing, narrowest first", async () => {
    const { calls, logs, deps } = harness();
    // Food words are all A1: food at B1 matches nothing, food at any level does.
    const page = await load(deps, { position: 0 }, { topic: "food", level: "B1", difficulty: "" });
    expect(logs).toEqual(["widen"]);
    expect(calls.map((call) => call.filters)).toEqual([
      { topic: "food", level: "B1", difficulty: "" },
      { topic: "food", level: "", difficulty: "" },
    ]);
    expect(page.scope).toEqual({ topic: "food", level: "", difficulty: "" });
    expect(page.entries.every((entry) => entry.word.topics?.includes("food"))).toBe(true);
  });

  it("widens to the whole deck when the topic itself is empty", async () => {
    const { logs, deps } = harness();
    const page = await load(deps, { position: 0 }, { topic: "nope", level: "C2", difficulty: "" });
    expect(logs).toEqual(["widen", "widen"]);
    expect(page.scope).toEqual(ALL);
    expect(page.entries).toHaveLength(4);
  });

  it("keeps a recovered stream's seed and filters on later pages", async () => {
    const { calls, logs, deps } = harness();
    const scope: VocabularyFilters = { topic: "travel", level: "", difficulty: "" };
    const page = await load(deps, { position: 4, seed: "seed0001-rabc", scope }, ALL);
    expect(logs).toEqual([]);
    expect(calls[0]).toMatchObject({ seed: "seed0001-rabc", filters: scope });
    expect(page.scope).toEqual(scope);
    expect(page.seed).toBe("seed0001-rabc");
  });

  it("throws a rate refusal at once: waiting it out belongs to the stream", async () => {
    const { calls, sleeps, logs, deps } = harness([fail("RATE_LIMITED", 30_000)]);
    await expect(load(deps, { position: 12, revision: "ab12cd34", token: "t" })).rejects.toThrow(
      "RATE_LIMITED",
    );
    expect(calls).toHaveLength(1);
    expect(sleeps).toEqual([]);
    expect(logs).toEqual(["failed"]);
  });

  it("throws a gate refusal without retrying", async () => {
    const { calls, deps } = harness([fail("FORBIDDEN")]);
    await expect(load(deps)).rejects.toThrow("FORBIDDEN");
    expect(calls).toHaveLength(1);
  });

  it("stops at once when the query is dropped", async () => {
    const { calls, deps } = harness([fail("UNAVAILABLE"), fail("UNAVAILABLE")]);
    const controller = new AbortController();
    controller.abort();
    await expect(
      loadFeedPageWithFallbacks(
        { seed: "seed0001", filters: ALL, cursor: { position: 0 }, signal: controller.signal },
        deps,
      ),
    ).rejects.toThrow();
    expect(calls).toHaveLength(1);
  });
});
