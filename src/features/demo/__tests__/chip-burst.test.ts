import { describe, expect, it } from "vitest";
// Initialise the seed barrel first so comments.ts fully evaluates the chip-burst
// generator before this file pulls chip-burst in directly (avoids a load-order TDZ).
import "../seed";
import { buildChipBurstComments } from "../seed/chip-burst";

describe("buildChipBurstComments (isolated)", () => {
  const burst = buildChipBurstComments();

  it("returns a dense five-post, twenty-six-per-post block", () => {
    expect(burst).toHaveLength(5 * 26);
  });
  it("spreads across exactly five distinct posts", () => {
    expect(new Set(burst.map((row) => row.post_id)).size).toBe(5);
  });
  it("cycles the burst across six author ids", () => {
    expect(new Set(burst.map((row) => row.user_id)).size).toBe(6);
  });
  it("rotates through the chip palette", () => {
    expect(new Set(burst.map((row) => row.chip_id)).size).toBeGreaterThan(1);
  });
  it("assigns unique ids in ascending sequence", () => {
    const ids = burst.map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0].startsWith("b0000001")).toBe(true);
  });
  it("stamps every created_at in June 2026", () => {
    for (const row of burst) expect(row.created_at.startsWith("2026-06-22T")).toBe(true);
  });
  it("is deterministic across calls", () => {
    expect(buildChipBurstComments()).toEqual(burst);
  });
});
