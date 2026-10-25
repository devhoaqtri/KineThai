import { afterEach, describe, expect, it } from "vitest";
import { checkRateLimitOnce, resetRateLimits } from "../rate-limit";

const budget = { limit: 2, windowMs: 60_000 };

describe("checkRateLimitOnce", () => {
  afterEach(() => resetRateLimits());

  it("charges an item once, however often it is asked for", () => {
    for (let i = 0; i < 10; i++) {
      expect(checkRateLimitOnce("streams", "ip", "seed-a", budget).allowed).toBe(true);
    }
    expect(checkRateLimitOnce("streams", "ip", "seed-b", budget).allowed).toBe(true);
  });

  it("still refuses a new item once the budget is spent", () => {
    checkRateLimitOnce("streams", "ip", "seed-a", budget);
    checkRateLimitOnce("streams", "ip", "seed-b", budget);
    const verdict = checkRateLimitOnce("streams", "ip", "seed-c", budget);
    expect(verdict.allowed).toBe(false);
    expect(verdict.retryAfterSeconds).toBeGreaterThan(0);
    // An item paid for before the budget ran out stays free.
    expect(checkRateLimitOnce("streams", "ip", "seed-a", budget).allowed).toBe(true);
  });

  it("does not remember a refused item as paid", () => {
    checkRateLimitOnce("streams", "ip", "seed-a", budget);
    checkRateLimitOnce("streams", "ip", "seed-b", budget);
    expect(checkRateLimitOnce("streams", "ip", "seed-c", budget).allowed).toBe(false);
    expect(checkRateLimitOnce("streams", "ip", "seed-c", budget).allowed).toBe(false);
  });

  it("keeps callers apart", () => {
    checkRateLimitOnce("streams", "ip-1", "seed-a", budget);
    checkRateLimitOnce("streams", "ip-1", "seed-b", budget);
    expect(checkRateLimitOnce("streams", "ip-2", "seed-c", budget).allowed).toBe(true);
  });
});
