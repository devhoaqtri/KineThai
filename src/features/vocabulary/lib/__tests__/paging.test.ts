import { describe, expect, it } from "vitest";
import { MAX_POSITION, readCatalogPage } from "../paging";
import type { FeedRequest } from "../../types";
import { makeCatalog, makeWord } from "./helpers";

const request = (overrides: Partial<FeedRequest> = {}): FeedRequest => ({
  seed: "seed-01",
  position: 0,
  topic: "",
  level: "",
  difficulty: "",
  limit: 5,
  ...overrides,
});

// A small leveled catalog: three A1 words, two B2 words.
const catalog = makeCatalog([
  makeWord({ word: "alpha", level: "A1" }),
  makeWord({ word: "bravo", level: "A1" }),
  makeWord({ word: "delta", level: "A1" }),
  makeWord({ word: "echo", level: "B2" }),
  makeWord({ word: "foxtrot", level: "B2" }),
]);

describe("MAX_POSITION", () => {
  it("is one trillion", () => expect(MAX_POSITION).toBe(1_000_000_000_000));
});

describe("readCatalogPage basics", () => {
  it("returns the requested number of entries", () =>
    expect(readCatalogPage(catalog, request({ limit: 3 })).entries).toHaveLength(3));
  it("echoes the seed, position and revision", () => {
    const page = readCatalogPage(catalog, request({ seed: "abc", position: 0 }));
    expect(page.seed).toBe("abc");
    expect(page.position).toBe(0);
    expect(page.revision).toBe(catalog.revision);
  });
  it("reports the total catalog size and the matching pool size", () => {
    const page = readCatalogPage(catalog, request());
    expect(page.total).toBe(5);
    expect(page.matching).toBe(5);
  });
  it("gives every entry a stable occurrence id and cycle", () => {
    const [entry] = readCatalogPage(catalog, request({ limit: 1 })).entries;
    expect(entry!.occurrenceId).toContain(catalog.revision);
    expect(entry!.cycle).toBe(0);
    expect(entry!.position).toBe(0);
  });
  it("carries catalog metadata through the page", () => {
    const page = readCatalogPage(catalog, request());
    expect(page.name).toBe(catalog.name);
    expect(page.levels).toEqual(catalog.levels);
  });
});

describe("determinism and pagination cursors", () => {
  it("returns identical words for identical requests", () => {
    const a = readCatalogPage(catalog, request({ seed: "fixed" }));
    const b = readCatalogPage(catalog, request({ seed: "fixed" }));
    expect(a.entries.map((e) => e.word.word)).toEqual(b.entries.map((e) => e.word.word));
  });
  it("returns a different order for a different seed", () => {
    const a = readCatalogPage(catalog, request({ seed: "one", limit: 5 }));
    const b = readCatalogPage(catalog, request({ seed: "two", limit: 5 }));
    expect(a.entries.map((e) => e.word.word)).not.toEqual(b.entries.map((e) => e.word.word));
  });
  it("advances nextPosition by the limit", () =>
    expect(readCatalogPage(catalog, request({ position: 0, limit: 5 })).nextPosition).toBe(5));
  it("reports no previous position at the start", () =>
    expect(readCatalogPage(catalog, request({ position: 0 })).previousPosition).toBeNull());
  it("reports a previous position once past the start", () =>
    expect(readCatalogPage(catalog, request({ position: 10, limit: 5 })).previousPosition).toBe(5));
  it("clamps the previous position at zero", () =>
    expect(readCatalogPage(catalog, request({ position: 3, limit: 5 })).previousPosition).toBe(0));
  it("walks consecutive pages without repeating a word within one cycle", () => {
    const seen: string[] = [];
    for (let position = 0; position < 5; position += 5) {
      const page = readCatalogPage(catalog, request({ seed: "walk", position, limit: 5 }));
      seen.push(...page.entries.map((e) => e.word.word));
    }
    expect(new Set(seen).size).toBe(5);
  });
  it("increments the cycle as the position passes the pool size", () => {
    const page = readCatalogPage(catalog, request({ position: 5, limit: 5 }));
    expect(page.entries.every((entry) => entry.cycle === 1)).toBe(true);
  });
  it("stops advancing nextPosition at MAX_POSITION", () => {
    const page = readCatalogPage(catalog, request({ position: MAX_POSITION, limit: 5 }));
    expect(page.nextPosition).toBeNull();
  });
});

describe("level and topic filters", () => {
  it("restricts the pool to an exact level", () => {
    const page = readCatalogPage(catalog, request({ level: "A1", limit: 10 }));
    expect(page.matching).toBe(3);
    expect(page.entries.every((entry) => entry.word.level === "A1")).toBe(true);
  });
  it("restricts the pool to a difficulty track band", () => {
    const page = readCatalogPage(catalog, request({ difficulty: "chuyen-sau", limit: 10 }));
    expect(page.entries.every((entry) => entry.word.level === "B2")).toBe(true);
  });
  it("returns an empty page for a topic nothing carries", () => {
    const page = readCatalogPage(catalog, request({ topic: "nope", limit: 5 }));
    expect(page.entries).toEqual([]);
    expect(page.matching).toBe(0);
    expect(page.nextPosition).toBeNull();
  });
  it("counts words per level in levelCounts", () => {
    const page = readCatalogPage(catalog, request());
    expect(page.levelCounts.A1).toBe(3);
    expect(page.levelCounts.B2).toBe(2);
  });
  it("reports the topic total including unlevelled words", () =>
    expect(readCatalogPage(catalog, request()).topicTotal).toBe(5));
});

describe("empty and edge catalogs", () => {
  it("serves nothing from an empty pool without throwing", () => {
    const empty = makeCatalog([], { revision: "empty-revision-000000000" });
    const page = readCatalogPage(empty, request({ limit: 5 }));
    expect(page.entries).toEqual([]);
    expect(page.matching).toBe(0);
  });
  it("honours a limit of zero", () =>
    expect(readCatalogPage(catalog, request({ limit: 0 })).entries).toEqual([]));
  it("provides level samples for the picker", () => {
    const page = readCatalogPage(catalog, request());
    expect(page.levelSamples).toBeDefined();
  });
});
