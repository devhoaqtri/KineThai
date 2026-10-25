import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SKIP_BURST_LIMIT,
  SKIP_COOLDOWN_MS,
  SKIP_STREAK_GAP_MS,
  createSkipLimiter,
} from "../skip-limiter";

const T0 = 1_000_000;

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("constants", () => {
  it("allows three skips in a burst", () => expect(SKIP_BURST_LIMIT).toBe(3));
  it("breaks the streak after four seconds", () => expect(SKIP_STREAK_GAP_MS).toBe(4000));
  it("cools down for fifteen seconds", () => expect(SKIP_COOLDOWN_MS).toBe(15_000));
});

describe("createSkipLimiter with an injected clock", () => {
  it("allows the first skip", () => expect(createSkipLimiter().tryConsume(T0)).toBe(true));
  it("allows a full burst", () => {
    const limiter = createSkipLimiter();
    expect(limiter.tryConsume(T0)).toBe(true);
    expect(limiter.tryConsume(T0 + 500)).toBe(true);
    expect(limiter.tryConsume(T0 + 900)).toBe(true); // third is allowed, then cooldown starts
    expect(limiter.tryConsume(T0 + 1000)).toBe(false);
  });
  it("the third skip of a burst is allowed and starts the cooldown", () => {
    const limiter = createSkipLimiter();
    expect(limiter.tryConsume(T0)).toBe(true);
    expect(limiter.tryConsume(T0 + 100)).toBe(true);
    expect(limiter.tryConsume(T0 + 200)).toBe(true);
    expect(limiter.tryConsume(T0 + 300)).toBe(false);
  });
  it("blocks for exactly the cooldown, then recovers", () => {
    const limiter = createSkipLimiter();
    limiter.tryConsume(T0);
    limiter.tryConsume(T0 + 100);
    limiter.tryConsume(T0 + 200); // burst consumed at T0+200
    expect(limiter.tryConsume(T0 + 200 + SKIP_COOLDOWN_MS - 1)).toBe(false);
    expect(limiter.tryConsume(T0 + 200 + SKIP_COOLDOWN_MS)).toBe(true);
  });
  it("ignored attempts do not extend the cooldown", () => {
    const limiter = createSkipLimiter();
    limiter.tryConsume(T0);
    limiter.tryConsume(T0 + 100);
    limiter.tryConsume(T0 + 200);
    for (let step = 0; step < 20; step += 1)
      expect(limiter.tryConsume(T0 + 300 + step * 500)).toBe(false);
    // Cooldown measured from the LAST ALLOWED skip (T0+200), not the ignored taps.
    expect(limiter.tryConsume(T0 + 200 + SKIP_COOLDOWN_MS)).toBe(true);
  });
  it("a gap longer than the streak gap resets the burst", () => {
    const limiter = createSkipLimiter();
    limiter.tryConsume(T0);
    limiter.tryConsume(T0 + 100);
    // Long pause breaks the streak, so the counter restarts.
    expect(limiter.tryConsume(T0 + 100 + SKIP_STREAK_GAP_MS + 1)).toBe(true);
    expect(limiter.tryConsume(T0 + 5000)).toBe(true);
    expect(limiter.tryConsume(T0 + 5100)).toBe(true); // third of the new burst
    expect(limiter.tryConsume(T0 + 5200)).toBe(false);
  });
  it("a gap exactly at the streak gap does not reset", () => {
    const limiter = createSkipLimiter();
    limiter.tryConsume(T0);
    limiter.tryConsume(T0 + SKIP_STREAK_GAP_MS); // not > gapMs, streak continues
    expect(limiter.tryConsume(T0 + SKIP_STREAK_GAP_MS + 10)).toBe(true); // third
    expect(limiter.tryConsume(T0 + SKIP_STREAK_GAP_MS + 20)).toBe(false);
  });
  it("honours a custom burst limit", () => {
    const limiter = createSkipLimiter({ limit: 1, cooldownMs: 1000 });
    expect(limiter.tryConsume(T0)).toBe(true);
    expect(limiter.tryConsume(T0 + 10)).toBe(false);
    expect(limiter.tryConsume(T0 + 1000)).toBe(true);
  });
  it("honours a custom cooldown", () => {
    const limiter = createSkipLimiter({ limit: 1, cooldownMs: 5000 });
    limiter.tryConsume(T0);
    expect(limiter.tryConsume(T0 + 4999)).toBe(false);
    expect(limiter.tryConsume(T0 + 5000)).toBe(true);
  });
  it("two limiters keep independent state", () => {
    const a = createSkipLimiter({ limit: 1 });
    const b = createSkipLimiter({ limit: 1 });
    expect(a.tryConsume(T0)).toBe(true);
    expect(a.tryConsume(T0 + 1)).toBe(false);
    expect(b.tryConsume(T0 + 1)).toBe(true);
  });
});

describe("createSkipLimiter with the wall clock", () => {
  it("defaults to Date.now when no stamp is passed", () => {
    vi.setSystemTime(new Date(2026, 9, 26, 12, 0, 0));
    const limiter = createSkipLimiter({ limit: 1, cooldownMs: 10_000 });
    expect(limiter.tryConsume()).toBe(true);
    expect(limiter.tryConsume()).toBe(false);
  });
  it("recovers once the wall clock passes the cooldown", () => {
    vi.setSystemTime(new Date(2026, 9, 26, 12, 0, 0));
    const limiter = createSkipLimiter({ limit: 1, cooldownMs: 10_000 });
    expect(limiter.tryConsume()).toBe(true);
    expect(limiter.tryConsume()).toBe(false);
    vi.setSystemTime(new Date(2026, 9, 26, 12, 0, 10));
    expect(limiter.tryConsume()).toBe(true);
  });
  it("a long real pause resets the burst", () => {
    vi.setSystemTime(new Date(2026, 9, 26, 12, 0, 0));
    const limiter = createSkipLimiter();
    expect(limiter.tryConsume()).toBe(true);
    expect(limiter.tryConsume()).toBe(true);
    vi.setSystemTime(new Date(2026, 9, 26, 12, 1, 0)); // 60 s later
    expect(limiter.tryConsume()).toBe(true);
    expect(limiter.tryConsume()).toBe(true);
    expect(limiter.tryConsume()).toBe(true); // still a fresh burst
  });
});
