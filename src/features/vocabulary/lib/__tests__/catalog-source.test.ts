/**
 * The Korean deck is one file per TOPIK level (data/ko/topik-1.json … topik-6.json),
 * compiled from the 2026-11-11 WordCrawler release: every headword once, in the lowest
 * level that carries it. It used to be a stack of overlapping refresh files that only
 * worked because a newer file sorted before an older one (the merge keeps the first pack
 * on a headword collision), and 895 headwords sat in two files. These tests keep it flat.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { catalogFor } from "../catalog-source";

const ko = catalogFor("ko");
const KO_DIR = join(__dirname, "../../data/ko");

// The release's lead sentences, so a stale file shadowing it would show.
const RELEASE_LEAD_FRAGMENTS: Record<string, string> = {
  것: "Mở tủ",
  길: "Giờ tan",
  컵: "Sáng nào cũng rót",
};

describe("ko deck", () => {
  for (const [word, fragment] of Object.entries(RELEASE_LEAD_FRAGMENTS)) {
    it(`serves the release leadVi for ${word}`, () => {
      const card = ko.words.find((entry) => entry.word === word);
      expect(card, `${word} present in the merged ko catalog`).toBeTruthy();
      expect(card!.leadVi ?? "").toContain(fragment);
    });
  }

  it("holds every headword in exactly one deck file", () => {
    const seen = new Map<string, string>();
    const repeated: string[] = [];
    for (const file of readdirSync(KO_DIR).filter((name) => name.endsWith(".json"))) {
      const { words } = JSON.parse(readFileSync(join(KO_DIR, file), "utf8")) as {
        words: { word: string }[];
      };
      for (const { word } of words) {
        const earlier = seen.get(word);
        if (earlier) repeated.push(`${word} (${earlier}, ${file})`);
        else seen.set(word, file);
      }
    }
    expect(repeated).toEqual([]);
  });

  it("keeps TOPIK1 at 777 words: the release's K1 band, 씨 excluded as sensitive", () => {
    const topik1 = ko.words.filter((entry) => entry.level === "TOPIK1");
    expect(topik1.length).toBe(777);
  });
});
