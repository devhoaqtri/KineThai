import { describe, expect, it } from "vitest";
import { isRecentSound, nextSoundPick, RECENT_WINDOW, type SoundUse, UPBEAT_QUERIES } from "./tiktok-sounds";

const use = (title: string, query: string, drafted = true): SoundUse => ({
  title,
  query,
  row: 0,
  at: "2026-11-16T00:00:00.000Z",
  clip: "clip.mp4",
  drafted,
});

describe("nextSoundPick", () => {
  it("starts on the first query, top row", () => {
    expect(nextSoundPick({ used: [] })).toEqual({ query: UPBEAT_QUERIES[0], row: 0 });
  });

  it("rotates one query per draft and moves a returning query down a row", () => {
    const used = UPBEAT_QUERIES.map((q) => use(`t-${q}`, q));
    expect(nextSoundPick({ used: used.slice(0, 1) }).query).toBe(UPBEAT_QUERIES[1]);
    expect(nextSoundPick({ used })).toEqual({ query: UPBEAT_QUERIES[0], row: 1 });
  });

  it("ignores --no-draft runs", () => {
    expect(nextSoundPick({ used: [use("x", "upbeat", false)] })).toEqual({ query: UPBEAT_QUERIES[0], row: 0 });
  });

  it("takes a forced query as is", () => {
    expect(nextSoundPick({ used: [use("a", "lofi")] }, "lofi")).toEqual({ query: "lofi", row: 1 });
  });
});

describe("isRecentSound", () => {
  it("matches titles case-blind within the window, drafts only", () => {
    const ledger = { used: [use("Upbeat Funk", "upbeat"), use("Other", "upbeat", false)] };
    expect(isRecentSound(ledger, "upbeat funk ")).toBe(true);
    expect(isRecentSound(ledger, "Other")).toBe(false);
  });

  it("forgets a track once it falls out of the window", () => {
    const used = [use("Old", "upbeat"), ...Array.from({ length: RECENT_WINDOW }, (_, i) => use(`n${i}`, "upbeat"))];
    expect(isRecentSound({ used }, "Old")).toBe(false);
  });
});
