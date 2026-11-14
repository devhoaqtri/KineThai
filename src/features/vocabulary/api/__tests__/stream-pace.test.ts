import { afterEach, describe, expect, it, vi } from "vitest";
import { RATE_LIMITS, STREAM_PAGE_BUDGET, checkRateLimit, resetRateLimits } from "@/lib/rate-limit";
import { vocabularyResponse } from "../endpoint.server";

const HOST = "https://anh.chayla.app";
/** One carrier NAT address, shared by every reader below. */
const SHARED_ADDRESS = "100.64.0.1";

function get(params: Record<string, string>): Promise<Response> {
  const query = new URLSearchParams(params).toString();
  return vocabularyResponse(
    new Request(`${HOST}/api/public/vocabulary?${query}`, {
      headers: { host: "anh.chayla.app", "cf-connecting-ip": SHARED_ADDRESS },
    }),
  );
}

/** Open a stream and return what page 1 needs: its cursor. */
async function open(seed: string): Promise<string> {
  const response = await get({ seed, position: "0" });
  expect(response.status).toBe(200);
  const body = (await response.json()) as { cursor: string };
  return body.cursor;
}

const perMinute = (
  Array.isArray(STREAM_PAGE_BUDGET) ? STREAM_PAGE_BUDGET : [STREAM_PAGE_BUDGET]
).find((window) => window.windowMs === 60_000)!.limit;

describe("feed pace on a shared address", () => {
  afterEach(() => {
    resetRateLimits();
    vi.restoreAllMocks();
  });

  it("holds one stream to a reader's pace, without touching other readers on the address", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fast = await open("reader-fast-0001");
    const calm = await open("reader-calm-0001");
    // The same page asked again and again: past the stream's minute budget it is refused.
    const statuses: number[] = [];
    for (let i = 0; i <= perMinute; i++) {
      statuses.push((await get({ seed: "reader-fast-0001", position: "12", token: fast })).status);
    }
    expect(statuses.slice(0, perMinute).every((status) => status === 200)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
    // Another reader on the very same address reads on.
    expect((await get({ seed: "reader-calm-0001", position: "12", token: calm })).status).toBe(200);
  });

  it("lets far more readers share one address than the old per-address caps did", async () => {
    // The old caps: 60 new streams per ten minutes and 30 feed pages a minute per address.
    // 100 readers each opening a stream and reading their next page breaks both.
    for (let reader = 0; reader < 100; reader++) {
      const seed = `reader-${String(reader).padStart(4, "0")}-nat`;
      const cursor = await open(seed);
      expect((await get({ seed, position: "12", token: cursor })).status).toBe(200);
    }
    // The path budget is charged by the request middleware (src/start.ts) through the same
    // limiter: the 200 page requests above all fit one address's minute.
    const path = "/api/public/vocabulary";
    for (let request = 0; request < 200; request++) {
      expect(checkRateLimit(path, SHARED_ADDRESS, RATE_LIMITS[path]!).allowed).toBe(true);
    }
  });
});
