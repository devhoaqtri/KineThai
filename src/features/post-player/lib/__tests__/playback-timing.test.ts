import { describe, expect, it } from "vitest";
import { getJapaneseMoraTokens } from "@/features/kinetic-text";
import { getMoraDelay, getPageDuration, tempoConfig } from "../playback-timing";

describe("getPageDuration on Japanese pages", () => {
  const clue = "朝、 友達と しゃべりながら 坂を 上った。";

  it("keeps a very short page up for every language's minimum", () => {
    expect(getPageDuration("速い！", "steady", "smooth")).toBe(3200);
  });

  it("times a clue by its morae, not its handful of 文節", () => {
    const morae = getJapaneseMoraTokens(clue).length;
    expect(clue.trim().split(/\s+/)).toHaveLength(5);
    expect(getPageDuration(clue, "steady", "smooth")).toBeCloseTo(
      Math.min(5200, 1900 + (morae / 1.5) * 430),
    );
  });

  it("gives a typical clue about what its Vietnamese equivalent gets", () => {
    const vietnamese = "Buổi sáng, vừa đi vừa nói chuyện với bạn, mình leo lên con dốc.";
    expect(getPageDuration(clue, "steady", "stagger")).toBe(
      getPageDuration(vietnamese, "steady", "stagger"),
    );
  });

  it("applies the same reading time however fast the style reveals", () => {
    expect(getPageDuration(clue, "snappy", "burst")).toBeCloseTo(
      getPageDuration(clue, "steady", "smooth") * 0.78,
    );
    expect(getPageDuration(clue, "slow", "poetic")).toBeGreaterThanOrEqual(
      getPageDuration(clue, "steady", "smooth") * 1.22 * 1.18,
    );
  });

  it("gives a page of 20 characters or more half as long again", () => {
    const full = "祭りの 名前で 検索すると、 青い チェックマークの アカウントが 一番 上に 出た。";
    expect(getJapaneseMoraTokens(full).length).toBeGreaterThanOrEqual(20);
    expect(getPageDuration(full, "steady", "smooth")).toBe(5200 * 1.5);
    expect(getPageDuration(full, "snappy", "burst")).toBeCloseTo(5200 * 1.5 * 0.78);
  });

  it("keeps a page just under 20 characters on the plain time", () => {
    const page = "あいうえおかきくけこさしすせそたちつて";
    expect(getJapaneseMoraTokens(page).length).toBe(19);
    expect(getPageDuration(page, "steady", "smooth")).toBe(5200);
  });

  it("gives a page whose cascade outruns that time its whole cascade and read-hold", () => {
    const page = "待たされたり、 物事が 進まなかったりして いらいらする 気持ち。".repeat(5);
    const morae = getJapaneseMoraTokens(page).length;
    const duration = getPageDuration(page, "steady", "stagger");
    const lastMoraLands =
      (getMoraDelay(morae - 1, "steady", "stagger") + tempoConfig.steady.wordDuration) * 1000;

    expect(duration).toBeGreaterThan(5200);
    expect(duration - lastMoraLands).toBeGreaterThanOrEqual(800);
    expect(duration - lastMoraLands).toBeLessThan(1000);
  });

  it("leaves non-Japanese pages on the word-count timing", () => {
    expect(getPageDuration("Một trang tiếng Việt rất ngắn gọn.", "steady", "stagger")).toBe(4910);
  });
});
