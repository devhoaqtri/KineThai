import { describe, expect, it } from "vitest";
import { byReportPriority, isSevereReason, wordReportSchema } from "../word-report";

describe("severe report reasons", () => {
  it("are 'nhạy cảm' and 'không ổn', and a reader can send them", () => {
    expect(isSevereReason("sensitive")).toBe(true);
    expect(isSevereReason("not-ok")).toBe(true);
    expect(isSevereReason("typo")).toBe(false);
    expect(
      wordReportSchema.safeParse({ id: "apple", reasons: ["sensitive", "not-ok"] }).success,
    ).toBe(true);
  });

  it("lead a tally however often the others were named", () => {
    const tally = [
      { id: "typo", count: 9 },
      { id: "not-ok", count: 1 },
      { id: "meaning-wrong", count: 4 },
      { id: "sensitive", count: 2 },
    ].sort(byReportPriority);
    expect(tally.map((reason) => reason.id)).toEqual([
      "sensitive",
      "not-ok",
      "typo",
      "meaning-wrong",
    ]);
  });
});
