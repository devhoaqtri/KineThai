import { describe, expect, it } from "vitest";
import { getJapaneseMoraTokens } from "@/features/kinetic-text";
import { paginateJapaneseChunks, parseJapaneseMarkup } from "../ja-text";

const pagesOf = (text: string) => {
  const { chunks } = parseJapaneseMarkup(text);
  return paginateJapaneseChunks(chunks, 7);
};
const size = (text: string) => getJapaneseMoraTokens(text).length;

describe("paginateJapaneseChunks with a long page", () => {
  const long =
    "祭りの 名前で | 検索すると、 青い | チェックマークの アカウントが | 一番 上に 出た。";

  it("splits a page of 20 characters or more in two at a marked phrase", () => {
    expect(pagesOf(long)).toHaveLength(2);
  });

  it("picks the phrase break that leaves the two sides most even", () => {
    const [head, tail] = pagesOf(long).map((page) => size(page.text));
    const options = [
      [
        size("祭りの 名前で"),
        size("検索すると、 青い チェックマークの アカウントが 一番 上に 出た。"),
      ],
      [
        size("祭りの 名前で 検索すると、 青い"),
        size("チェックマークの アカウントが 一番 上に 出た。"),
      ],
      [
        size("祭りの 名前で 検索すると、 青い チェックマークの アカウントが"),
        size("一番 上に 出た。"),
      ],
    ];
    const bestGap = Math.min(...options.map(([a, b]) => Math.abs(a! - b!)));
    expect(Math.abs(head! - tail!)).toBe(bestGap);
  });

  it("keeps every character, in order", () => {
    const joined = pagesOf(long)
      .map((page) => page.text)
      .join(" ");
    expect(joined).toBe(parseJapaneseMarkup(long).text);
  });

  it("restarts phrase edges on each page", () => {
    const [first, second] = pagesOf(
      "あいうえお かきくけこ | さしすせそ | たちつてと なにぬねの | はひふへほ",
    );
    expect(first!.phraseEdges).toEqual([2]);
    expect(second!.phraseEdges).toEqual([2]);
  });

  it("falls back to a clause end when no phrase is marked", () => {
    const pages = pagesOf("あいうえおかきくけこ、 さしすせそたちつてと なにぬ");
    expect(pages.map((page) => page.text)).toEqual([
      "あいうえおかきくけこ、",
      "さしすせそたちつてと なにぬ",
    ]);
  });

  it("leaves a long page whole rather than strand a tiny side", () => {
    const text = "あいうえおかきくけこさしすせそたちつてと | なに";
    expect(pagesOf(text)).toHaveLength(1);
  });

  it("leaves a long page with nowhere to break whole", () => {
    expect(pagesOf("あいうえおかきくけこ さしすせそたちつてと")).toHaveLength(1);
  });

  it("leaves a page under 20 characters alone", () => {
    expect(pagesOf("あいうえお かきくけこ | さしすせそ たちつて")).toHaveLength(1);
  });
});
