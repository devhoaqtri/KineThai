import { describe, expect, it } from "vitest";
import { LOAD_FAILURE_CASES } from "../load-failure-catalog";

const STAGE_ORDER = ["network", "support", "app"] as const;
const FREQUENCY_ORDER = ["common", "occasional", "rare"] as const;

describe("LOAD_FAILURE_CASES", () => {
  it("gives every case a unique id", () => {
    const ids = LOAD_FAILURE_CASES.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("lists cases in check order, most common first within a stage", () => {
    const rank = LOAD_FAILURE_CASES.map(
      (entry) => STAGE_ORDER.indexOf(entry.stage) * 10 + FREQUENCY_ORDER.indexOf(entry.frequency),
    );
    expect(rank).toEqual([...rank].sort((a, b) => a - b));
  });

  it("names where existing handling lives whenever a case is not 'none'", () => {
    for (const entry of LOAD_FAILURE_CASES) {
      if (entry.coverage !== "none") expect(entry.existing, entry.id).toBeTruthy();
    }
  });
});
