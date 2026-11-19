import { describe, expect, it } from "vitest";
import { findLiveAfterError } from "./live-after-error";

const noWait = async () => {};

describe("findLiveAfterError", () => {
  it("finds a post that is listed only on a later lookup", async () => {
    let calls = 0;
    const live = await findLiveAfterError(
      async () => (++calls === 2 ? { id: "Df6Pa35kqiu" } : undefined),
      { sleep: noWait },
    );
    expect(live).toEqual({ id: "Df6Pa35kqiu" });
    expect(calls).toBe(2);
  });

  it("gives up after its tries when the post never shows", async () => {
    let calls = 0;
    const live = await findLiveAfterError(
      async () => {
        calls += 1;
        return undefined;
      },
      { tries: 3, sleep: noWait },
    );
    expect(live).toBeUndefined();
    expect(calls).toBe(3);
  });

  it("stops at a lookup that fails, so the failure stands", async () => {
    let calls = 0;
    const live = await findLiveAfterError(
      async () => {
        calls += 1;
        throw new Error("Application request limit reached");
      },
      { tries: 3, sleep: noWait },
    );
    expect(live).toBeUndefined();
    expect(calls).toBe(1);
  });

  it("waits before each lookup", async () => {
    const waits: number[] = [];
    await findLiveAfterError(async () => undefined, {
      tries: 2,
      waitMs: 500,
      sleep: async (ms) => void waits.push(ms),
    });
    expect(waits).toEqual([500, 500]);
  });
});
