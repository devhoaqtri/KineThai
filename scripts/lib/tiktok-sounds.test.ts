import { describe, expect, it } from "vitest";
import {
  isUsedSound,
  MAX_PICKS,
  ROWS_PER_QUERY,
  type SoundUse,
  soundCandidates,
  UPBEAT_QUERIES,
} from "./tiktok-sounds";

const use = (title: string, artist: string, query: string, drafted = true): SoundUse => ({
  title,
  artist,
  query,
  row: 0,
  day: 5,
  code: "ABC",
  at: "2026-11-16T00:00:00.000Z",
  clip: "clip.mp4",
  drafted,
});

describe("soundCandidates", () => {
  it("starts on the first search's top row and walks its rows before the next search", () => {
    const list = soundCandidates({ used: [] });
    expect(list[0]).toEqual({ query: UPBEAT_QUERIES[0], row: 0 });
    expect(list.slice(0, ROWS_PER_QUERY).every((c) => c.query === UPBEAT_QUERIES[0])).toBe(true);
    expect(list[ROWS_PER_QUERY]).toEqual({ query: UPBEAT_QUERIES[1], row: 0 });
    expect(list).toHaveLength(MAX_PICKS);
  });

  it("rotates the first search per draft and starts a search below rows it already gave", () => {
    const used = UPBEAT_QUERIES.map((q) => use(`t-${q}`, "a", q));
    expect(soundCandidates({ used: used.slice(0, 1) })[0]!.query).toBe(UPBEAT_QUERIES[1]);
    expect(soundCandidates({ used })[0]).toEqual({ query: UPBEAT_QUERIES[0], row: 1 });
  });

  it("ignores --no-draft runs", () => {
    expect(soundCandidates({ used: [use("x", "a", "upbeat", false)] })[0]).toEqual({ query: UPBEAT_QUERIES[0], row: 0 });
  });

  it("walks only a forced search", () => {
    const list = soundCandidates({ used: [use("a", "b", "lofi")] }, "lofi");
    expect(list.every((c) => c.query === "lofi")).toBe(true);
    expect(list[0]!.row).toBe(1);
    expect(list).toHaveLength(ROWS_PER_QUERY);
  });
});

describe("isUsedSound", () => {
  it("matches title and artist case-blind across every draft, however old", () => {
    const used = [use("Upbeat Funk", "FASSounds", "upbeat"), ...Array.from({ length: 50 }, (_, i) => use(`n${i}`, "x", "upbeat"))];
    expect(isUsedSound({ used }, "upbeat funk ", "fassounds")).toBe(true);
  });

  it("keeps the same title by another artist and ignores --no-draft runs", () => {
    const ledger = { used: [use("Upbeat Funk", "FASSounds", "upbeat"), use("Other", "A", "upbeat", false)] };
    expect(isUsedSound(ledger, "Upbeat Funk", "Someone Else")).toBe(false);
    expect(isUsedSound(ledger, "Other", "A")).toBe(false);
  });
});
