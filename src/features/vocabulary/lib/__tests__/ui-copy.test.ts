/**
 * Guard: an internal key or id never reaches a reader.
 *
 * `t()` and the label helpers fall back to whatever they were given, so a missing entry
 * does not fail anywhere: the reader just sees `difficulty.vo-long.label` or `general`.
 * These walk everything a reader can be shown, against the decks actually shipped.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { catalogFor } from "../catalog-source";
import { CEFR_TRACKS, HSK_TRACKS } from "../difficulty";
import { posLabel, styleLabel, themeLabel, topicLabel } from "../i18n";
import type { Locale } from "../locale";
import { DOUYIN_THEMES, STYLES, THEMES } from "../presets";
import type { VocabularyWord } from "../schema";
import { COPY_KEYS, difficultyCopy, t } from "../ui-copy";
import { REPORT_REASONS } from "../word-report";

const READER_LOCALES: readonly Locale[] = ["vi", "ja", "th"];
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

const deckWords: VocabularyWord[] = (["ja", "zh", "en"] as const).flatMap(
  (locale) => catalogFor(locale).words,
);

describe.each(READER_LOCALES)("reader copy in %s", (ui) => {
  it("resolves every key to text, never the key itself", () => {
    for (const key of COPY_KEYS) expect(t(ui, key), key).not.toBe(key);
  });

  it("keeps the same {placeholders} as the Vietnamese base", () => {
    for (const key of COPY_KEYS) {
      expect(placeholders(t(ui, key)), key).toEqual(placeholders(t("vi", key)));
    }
  });

  it("names every report reason", () => {
    for (const { id } of REPORT_REASONS) {
      expect(t(ui, `report.reason.${id}`)).not.toContain("report.reason");
    }
  });

  it("names every difficulty track", () => {
    for (const { id } of [...CEFR_TRACKS, ...HSK_TRACKS]) {
      expect(difficultyCopy(ui, id).label, id).not.toBe(id);
    }
  });

  it("names every topic a shipped deck uses", () => {
    const topics = new Set(deckWords.flatMap((word) => [word.topic, ...(word.topics ?? [])]));
    for (const topic of topics) {
      if (topic) expect(topicLabel(topic, ui), topic).not.toBe(topic);
    }
  });

  it("names every part of speech a shipped deck uses", () => {
    for (const pos of new Set(deckWords.map((word) => word.pos))) {
      if (pos) expect(posLabel(pos, ui), pos).not.toBe(pos);
    }
  });

  it("has its own name for every palette and style", () => {
    const missing = "\u0000";
    for (const { id } of [...THEMES, ...DOUYIN_THEMES]) {
      expect(themeLabel(id, missing, ui), id).not.toBe(missing);
    }
    for (const { id } of STYLES) expect(styleLabel(id, missing, ui), id).not.toBe(missing);
  });
});

describe("copy keys in source", () => {
  it("never casts past the key type, which is what lets a wrong key compile", () => {
    const sources = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return entry.name === "__tests__" ? [] : sources(path);
        return /\.tsx?$/.test(entry.name) ? [path] : [];
      });
    const offenders = sources("src").filter((path) =>
      /as CopyKey\b(?!\[\])/.test(readFileSync(path, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
