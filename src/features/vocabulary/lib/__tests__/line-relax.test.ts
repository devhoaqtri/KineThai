import { describe, expect, it } from "vitest";
import { RELAX_LINE_RULE_BELOW, relaxBelowFor } from "../line-relax";
import { TARGET_LOCALES } from "../target-language";

describe("per-site line relax thresholds", () => {
  it("gives every site its own threshold, a share of full size", () => {
    for (const locale of TARGET_LOCALES) {
      const value = RELAX_LINE_RULE_BELOW[locale];
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
      expect(relaxBelowFor(locale)).toBe(value);
    }
  });
});
