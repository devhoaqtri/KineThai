import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { classifyField } from "../../../../../scripts/lib/highlight-scan";
import { buildStages } from "../stages";
import { normalizeDeck } from "../schema";
import { getWords } from "@/features/kinetic-text";
import { getEmphasizedWordIndexes } from "@/features/post-player/lib/feed-emphasis";

type Fix = { file: string; id: string; field: "defVi" | "leadVi" | "anticipateVi" };
const review = JSON.parse(readFileSync(resolve("scripts/data/highlight-review-fixes.json"), "utf8")) as { fixes: Fix[] };
const stagePrefix = { defVi: "definition-", leadVi: "lead-", anticipateVi: "anticipation-" };

describe("reviewed English highlight rules", () => {
  for (const fix of review.fixes) {
    it(`${fix.id} ${fix.field} has one valid mark that reaches the reader`, () => {
      const raw = JSON.parse(readFileSync(resolve("src/features/vocabulary/data/packs", fix.file), "utf8"));
      const deck = normalizeDeck({ meta: { name: raw.name }, words: raw.words });
      const word = deck.words.find((entry) => entry.id === fix.id);
      if (!word) throw new Error(`Missing reviewed word ${fix.id}`);
      expect(classifyField(word[fix.field])).toBe("ok");
      const stages = buildStages(word, "detective").filter((stage) => stage.id.startsWith(stagePrefix[fix.field]));
      expect(stages.length).toBeGreaterThan(0);
      const picked = stages.flatMap((stage) => {
        const tokens = getWords(stage.text);
        return [...getEmphasizedWordIndexes(tokens, stage.dataEmphasis, stage.boundPhrases)];
      });
      expect(picked).toHaveLength(2);
    });
  }
});