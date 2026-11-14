import { afterEach, describe, expect, it, vi } from "vitest";
import {
  NEW_STREAM_BUDGET,
  RATE_LIMITS,
  STREAM_PAGE_BUDGET,
  checkRateLimit,
  checkRateLimitOnce,
  resetRateLimits,
  type RateBudget,
} from "../rate-limit";

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

describe("budgets on a shared carrier address", () => {
  const perWindow = (budget: RateBudget, windowMs: number) =>
    (Array.isArray(budget) ? budget : [budget]).find((w) => w.windowMs === windowMs)?.limit ?? 0;

  it("leaves room for hundreds of readers behind one address", () => {
    // About a page a minute each: 200 readers paging at once must fit the feed's minute.
    expect(perWindow(RATE_LIMITS["/api/public/vocabulary"]!, 60_000)).toBeGreaterThanOrEqual(200);
    // A few dozen pages a day each, for a few hundred readers.
    expect(perWindow(RATE_LIMITS["/api/public/vocabulary"]!, 86_400_000)).toBeGreaterThanOrEqual(
      10_000,
    );
    // A handful of new streams each in ten minutes.
    expect(perWindow(NEW_STREAM_BUDGET, 600_000)).toBeGreaterThanOrEqual(300);
  });

  it("still holds one stream to a reader's pace", () => {
    expect(perWindow(STREAM_PAGE_BUDGET, 60_000)).toBeLessThanOrEqual(30);
    expect(perWindow(STREAM_PAGE_BUDGET, 3_600_000)).toBeLessThanOrEqual(300);
  });
});

describe("refusal log", () => {
  afterEach(() => {
    resetRateLimits();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("logs the first refusal, then at most one line a minute per bucket, never the address", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const one = { limit: 1, windowMs: 3_600_000 };
    checkRateLimit("bucket-a", "203.0.113.7", one);
    for (let i = 0; i < 5; i++) checkRateLimit("bucket-a", "203.0.113.7", one);
    expect(warn).toHaveBeenCalledTimes(1);
    vi.setSystemTime(61_000);
    checkRateLimit("bucket-a", "203.0.113.7", one);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[1]![0]).toContain("refused 5 in the last 61 s");
    for (const [line] of warn.mock.calls) expect(String(line)).not.toContain("203.0.113.7");
  });
});
