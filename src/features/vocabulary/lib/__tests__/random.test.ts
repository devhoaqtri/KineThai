import { describe, expect, it } from "vitest";
import { hash, randomGenerator } from "../random";

describe("hash", () => {
  it("is deterministic", () => expect(hash("seed")).toBe(hash("seed")));
  it("gives different texts different hashes", () =>
    expect(hash("seed-a")).not.toBe(hash("seed-b")));
  it("returns an unsigned 32-bit integer", () => {
    const value = hash("anything");
    expect(Number.isInteger(value)).toBe(true);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(0xffffffff);
  });
  it("is order-sensitive", () => expect(hash("ab")).not.toBe(hash("ba")));
  it("handles the empty string", () => expect(hash("")).toBeGreaterThanOrEqual(0));
  it("handles unicode consistently", () => {
    expect(hash("诚实")).toBe(hash("诚实"));
    expect(hash("诚实")).not.toBe(hash(" honesty"));
  });
});

describe("randomGenerator", () => {
  it("produces values in the unit range", () => {
    const random = randomGenerator("range");
    for (let index = 0; index < 500; index += 1) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
  it("is reproducible for the same seed", () => {
    const a = randomGenerator("same");
    const b = randomGenerator("same");
    for (let index = 0; index < 20; index += 1) expect(a()).toBe(b());
  });
  it("diverges for different seeds", () => {
    const a = randomGenerator("one");
    const b = randomGenerator("two");
    const sequenceA = Array.from({ length: 5 }, () => a());
    const sequenceB = Array.from({ length: 5 }, () => b());
    expect(sequenceA).not.toEqual(sequenceB);
  });
  it("does not repeat the same value every draw", () => {
    const random = randomGenerator("varied");
    const values = new Set(Array.from({ length: 100 }, () => random()));
    expect(values.size).toBe(100);
  });
  it("spreads draws across the range", () => {
    const random = randomGenerator("spread");
    let low = 0;
    let high = 0;
    for (let index = 0; index < 1000; index += 1) {
      const value = random();
      if (value < 0.5) low += 1;
      else high += 1;
    }
    expect(low).toBeGreaterThan(350);
    expect(high).toBeGreaterThan(350);
  });
  it("independent generators do not share state", () => {
    const a = randomGenerator("shared-seed");
    const b = randomGenerator("shared-seed");
    a();
    a();
    expect(b()).toBe(randomGenerator("shared-seed")());
  });
});
