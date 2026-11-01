import { describe, expect, it } from "vitest";
import { getJapaneseMoraTokens } from "@/features/kinetic-text";
import { getMoraDelay, getPageDuration, tempoConfig } from "../playback-timing";

describe("getPageDuration on Japanese pages", () => {
  const shortPage = "頭の 回転が 速い！";

  it("keeps a short page up for every language's minimum", () => {
    expect(getPageDuration(shortPage, "steady", "smooth")).toBe(3200);
    expect(getPageDuration(shortPage, "steady", "stagger")).toBe(3200);
  });

  it("scales that minimum with tempo and rhythm, as other languages do", () => {
    expect(getPageDuration(shortPage, "snappy", "burst")).toBeCloseTo(3200 * 0.78);
    expect(getPageDuration(shortPage, "slow", "poetic")).toBeGreaterThanOrEqual(3200 * 1.22 * 1.18);
  });

  it("never lets the burst rhythm's capped cascade rush a long page", () => {
    const page = "待たされたり、 物事が 進まなかったりして いらいらする 気持ち。";
    expect(getPageDuration(page, "snappy", "burst")).toBeCloseTo(3200 * 0.78);
  });

  it("gives a page longer than the minimum its whole cascade and read-hold", () => {
    const page = "待たされたり、 物事が 進まなかったりして いらいらする 気持ち。".repeat(3);
    const morae = getJapaneseMoraTokens(page).length;
    const duration = getPageDuration(page, "steady", "stagger");
    const lastMoraLands =
      (getMoraDelay(morae - 1, "steady", "stagger") + tempoConfig.steady.wordDuration) * 1000;

    expect(duration).toBeGreaterThan(3200);
    expect(duration - lastMoraLands).toBeGreaterThanOrEqual(800);
    expect(duration - lastMoraLands).toBeLessThan(1000);
  });

  it("leaves non-Japanese pages on the word-count timing", () => {
    expect(getPageDuration("Một trang tiếng Việt rất ngắn gọn.", "steady", "stagger")).toBe(4910);
  });
});
