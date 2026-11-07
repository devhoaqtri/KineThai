import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { catalogFor } from "../catalog-source";
import {
  DEMO_WORD_IDS,
  MAX_DEMO_WORDS,
  MIN_DEMO_WORDS,
  loadDemoDeck,
  readDemoPage,
} from "../demo-deck";
import { tracksFor } from "../difficulty";
import { demoDifficulty } from "../first-visit";
import { levelLadderFor } from "../level-ladder";
import type { Catalog } from "../schema";
import { TARGET_LOCALES } from "../target-language";
import { withWordJoiners } from "../word-joiner";

const DEMO_DIR = join(__dirname, "../../demo");
const OUT_OF_DATE = "out of date with its deck: run `npm run demo:decks`";

function demoFile(locale: string): Catalog | null {
  const path = join(DEMO_DIR, `${locale}.json`);
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as Catalog) : null;
}

describe("first-visit demo lists", () => {
  for (const locale of TARGET_LOCALES) {
    const ids = DEMO_WORD_IDS[locale];
    describe(locale, () => {
      it("has a list of a sample's size, or none", () => {
        if (!ids.length) {
          expect(demoFile(locale)).toBeNull();
          return;
        }
        expect(ids.length).toBeGreaterThanOrEqual(MIN_DEMO_WORDS);
        expect(ids.length).toBeLessThanOrEqual(MAX_DEMO_WORDS);
        expect(new Set(ids).size).toBe(ids.length);
      });

      it.runIf(ids.length > 0)("copies its deck's words exactly, in the listed order", () => {
        const file = demoFile(locale);
        expect(file, `demo/${locale}.json is missing: run \`npm run demo:decks\``).not.toBeNull();
        const deck = catalogFor(locale);
        const byId = new Map(deck.words.map((word) => [word.id, word]));
        const joined = withWordJoiners(file!);
        expect(
          joined.words.map((word) => word.id),
          OUT_OF_DATE,
        ).toEqual([...ids]);
        for (const word of joined.words) {
          expect(word, `${word.id} ${OUT_OF_DATE}`).toEqual(byId.get(word.id));
        }
        expect(file!.topics, OUT_OF_DATE).toEqual(deck.topics);
        expect(file!.levels, OUT_OF_DATE).toEqual(deck.levels);
      });

      it.runIf(ids.length > 0)("only holds words from the deck's easiest track", () => {
        const track = tracksFor(locale).find(
          (candidate) => candidate.id === demoDifficulty(locale, levelLadderFor(locale)),
        );
        expect(track).toBeDefined();
        for (const word of demoFile(locale)!.words) {
          expect(track!.levels, `${word.id} (${word.level})`).toContain(word.level);
        }
      });
    });
  }
});

describe("loadDemoDeck", () => {
  it("loads a list with its joins made no-break", async () => {
    const deck = await loadDemoDeck("en");
    expect(deck?.words.map((word) => word.id)).toEqual([...DEMO_WORD_IDS.en]);
    // The fill-in blanks of English examples ("_____") are not joins.
    for (const word of deck!.words) {
      for (const text of [word.meaningVi, word.defVi, word.leadVi, word.anticipateVi]) {
        expect(text ?? "").not.toContain("_");
      }
    }
    expect(deck!.words.some((word) => word.defVi?.includes("\u00a0"))).toBe(true);
  });
});

describe("readDemoPage", () => {
  const locale = "en";
  const request = (position: number) => ({
    seed: "demo-seed-1234",
    topic: "",
    level: "" as const,
    difficulty: demoDifficulty(locale, levelLadderFor(locale)),
    position,
    limit: 12,
  });

  it("streams only the list's words, forever, with no word twice in a row", async () => {
    const deck = (await loadDemoDeck(locale))!;
    const ids = new Set(DEMO_WORD_IDS[locale]);
    const words = [0, 12, 24, 36].flatMap((position) =>
      readDemoPage(deck, locale, request(position)).entries.map((entry) => entry.word.id),
    );
    expect(words).toHaveLength(48);
    for (const id of words) expect(ids.has(id)).toBe(true);
    for (let index = 1; index < words.length; index += 1) {
      expect(words[index]).not.toBe(words[index - 1]);
    }
    expect(readDemoPage(deck, locale, request(36)).nextPosition).toBe(48);
  });

  it("reports the whole deck's level counts, not the list's", async () => {
    const deck = (await loadDemoDeck(locale))!;
    const ladder = levelLadderFor(locale);
    const page = readDemoPage(deck, locale, request(0));
    expect(page.levelCounts).toEqual(ladder.levelCounts);
    expect(page.levels).toEqual(ladder.levels);
    expect(page.topicTotal).toBeGreaterThan(1000);
  });
});
