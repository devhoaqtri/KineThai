import { describe, expect, it } from "vitest";
import {
  CEFR_TRACKS,
  DIFFICULTY_ALL,
  DIFFICULTY_IDS,
  DIFFICULTY_TRACKS,
  HSK_TRACKS,
  LEVEL_SAMPLE_PRIORITY,
  countTrackWords,
  difficultyLevels,
  formatLevelBand,
  isTrackAvailable,
  trackCeiling,
  tracksFor,
  type DifficultyTrack,
} from "../difficulty";
import type { VocabularyLevel } from "../schema";

const cefr = (id: string): DifficultyTrack => CEFR_TRACKS.find((t) => t.id === id)!;

describe("track catalogues", () => {
  it("ships ten CEFR tracks", () => expect(CEFR_TRACKS).toHaveLength(10));
  it("ships ten HSK tracks", () => expect(HSK_TRACKS).toHaveLength(10));
  it("both sets share the same ids in the same order", () =>
    expect(HSK_TRACKS.map((t) => t.id)).toEqual(CEFR_TRACKS.map((t) => t.id)));
  it("the default export is the CEFR set", () => expect(DIFFICULTY_TRACKS).toBe(CEFR_TRACKS));
  it("DIFFICULTY_ALL is the empty sentinel", () => expect(DIFFICULTY_ALL).toBe(""));
  it("DIFFICULTY_IDS lists the ten shared ids", () => {
    expect(DIFFICULTY_IDS).toHaveLength(10);
    expect(DIFFICULTY_IDS).toEqual(CEFR_TRACKS.map((t) => t.id));
  });
  it("every CEFR track has a label, hint and non-empty band", () => {
    for (const track of CEFR_TRACKS) {
      expect(track.label.length).toBeGreaterThan(0);
      expect(track.hint.length).toBeGreaterThan(0);
      expect(track.levels.length).toBeGreaterThan(0);
    }
  });
  it("every CEFR track draws only CEFR levels", () => {
    for (const track of CEFR_TRACKS)
      for (const level of track.levels) expect(level).toMatch(/^[ABC][12]$/);
  });
  it("every HSK track draws only HSK levels", () => {
    for (const track of HSK_TRACKS)
      for (const level of track.levels) expect(level).toMatch(/^HSK\d$/);
  });
  it("every CEFR band is a distinct set", () => {
    const keys = CEFR_TRACKS.map((t) => [...t.levels].sort().join("+"));
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("tracksFor", () => {
  it("gives Chinese the HSK set", () => expect(tracksFor("zh")).toBe(HSK_TRACKS));
  it("gives English the CEFR set", () => expect(tracksFor("en")).toBe(CEFR_TRACKS));
  it("gives Korean the CEFR set", () => expect(tracksFor("ko")).toBe(CEFR_TRACKS));
  it("gives Japanese the CEFR set", () => expect(tracksFor("ja")).toBe(CEFR_TRACKS));
});

describe("trackCeiling", () => {
  it("vỡ lòng tops out at A2", () => expect(trackCeiling(cefr("vo-long"))).toBe("A2"));
  it("cơ bản tops out at A2", () => expect(trackCeiling(cefr("co-ban"))).toBe("A2"));
  it("đọc hiểu tops out at B2", () => expect(trackCeiling(cefr("doc-hieu"))).toBe("B2"));
  it("văn chương tops out at C2", () => expect(trackCeiling(cefr("van-chuong"))).toBe("C2"));
  it("uses canonical order, not declaration order", () => {
    const scrambled: DifficultyTrack = { ...cefr("co-ban"), levels: ["B1", "A2"] };
    expect(trackCeiling(scrambled)).toBe("B1");
  });
  it("HSK sơ cấp tops out at HSK2", () =>
    expect(trackCeiling(HSK_TRACKS.find((t) => t.id === "vo-long")!)).toBe("HSK2"));
});

describe("isTrackAvailable", () => {
  it("is true once the ceiling level is populated", () =>
    expect(isTrackAvailable(cefr("co-ban"), ["A1", "A2"])).toBe(true));
  it("is false when the ceiling level is missing", () =>
    expect(isTrackAvailable(cefr("co-ban"), ["A1"])).toBe(false));
  it("is false against an empty catalog", () =>
    expect(isTrackAvailable(cefr("van-chuong"), [])).toBe(false));
  it("is true for the hardest track only when C2 exists", () => {
    expect(isTrackAvailable(cefr("van-chuong"), ["B2", "C1"])).toBe(false);
    expect(isTrackAvailable(cefr("van-chuong"), ["B2", "C1", "C2"])).toBe(true);
  });
  it("a shared lower level does not make a track available", () =>
    // nâng cao needs C1; having only B2 is not enough.
    expect(isTrackAvailable(cefr("nang-cao"), ["B2"])).toBe(false));
});

describe("difficultyLevels", () => {
  it("returns null for the empty sentinel", () => expect(difficultyLevels("")).toBeNull());
  it("returns null for whitespace only", () => expect(difficultyLevels("   ")).toBeNull());
  it("resolves a single track to its band in canonical order", () =>
    expect(difficultyLevels("vo-long")).toEqual(["A1", "A2"]));
  it("unions a multi-select and keeps canonical order", () =>
    expect(difficultyLevels("co-ban,van-chuong")).toEqual(["A2", "B2", "C1", "C2"]));
  it("deduplicates shared levels across tracks", () => {
    const levels = difficultyLevels("doc-hieu,chuyen-sau")!;
    expect(new Set(levels).size).toBe(levels.length);
    expect(levels).toEqual(["B1", "B2"]);
  });
  it("ignores an unknown id alongside a known one", () =>
    expect(difficultyLevels("co-ban,ghost")).toEqual(["A2"]));
  it("returns an empty band when only unknown ids are given", () =>
    expect(difficultyLevels("ghost1,ghost2")).toEqual([]));
  it("trims whitespace around ids", () =>
    expect(difficultyLevels(" co-ban , du-lich ")).toEqual(["A2", "B1"]));
  it("an unavailable track contributes nothing", () =>
    expect(difficultyLevels("van-chuong", ["A1", "A2"])).toEqual([]));
  it("an available track resolves through its own level system", () =>
    // The same id picks the HSK band when only HSK levels exist in the catalog.
    expect(difficultyLevels("co-ban", ["HSK1", "HSK2", "HSK3"])).toEqual(["HSK2"]));
  it("prefers the CEFR track when no catalog levels are given", () =>
    expect(difficultyLevels("co-ban")).toEqual(["A2"]));
  it("mixes available tracks and drops unavailable ones", () =>
    expect(difficultyLevels("co-ban,van-chuong", ["A2", "B2"])).toEqual(["A2"]));
});

describe("formatLevelBand", () => {
  it("renders a single level bare", () => expect(formatLevelBand(["B2"])).toBe("B2"));
  it("renders a CEFR range with an en dash", () =>
    expect(formatLevelBand(["A1", "A2"])).toBe("A1–A2"));
  it("drops the shared HSK prefix on the upper bound", () =>
    expect(formatLevelBand(["HSK1", "HSK3"])).toBe("HSK1–3"));
  it("orders by the canonical sequence, not declaration", () =>
    expect(formatLevelBand(["C1", "B1"])).toBe("B1–C1"));
  it("renders a wide HSK band", () =>
    expect(formatLevelBand(["HSK4", "HSK5", "HSK6"])).toBe("HSK4–6"));
  it("returns empty for no levels", () => expect(formatLevelBand([])).toBe(""));
});

describe("countTrackWords", () => {
  const counts: Partial<Record<VocabularyLevel, number>> = { A1: 5, A2: 10, B1: 8 };
  const levels: VocabularyLevel[] = ["A1", "A2", "B1"];
  it("counts a single track's band", () =>
    expect(countTrackWords(["vo-long"], counts, levels)).toBe(15));
  it("counts the union without double-counting a shared level", () =>
    // co-ban (A2) + du-lich (A2,B1) → union A2,B1 = 18, not 10 + 18.
    expect(countTrackWords(["co-ban", "du-lich"], counts, levels)).toBe(18));
  it("returns zero for no tracks", () => expect(countTrackWords([], counts, levels)).toBe(0));
  it("treats a missing level count as zero", () =>
    expect(countTrackWords(["doc-hieu"], { B1: 4 }, ["B1", "B2"])).toBe(4));
  it("ignores duplicate ids", () =>
    expect(countTrackWords(["co-ban", "co-ban"], counts, levels)).toBe(10));
});

describe("LEVEL_SAMPLE_PRIORITY", () => {
  it("prioritises everyday A1 words", () =>
    expect(LEVEL_SAMPLE_PRIORITY.A1).toEqual(["angry", "afraid", "amazing", "awesome"]));
  it("prioritises Han glyphs for HSK1", () => {
    for (const word of LEVEL_SAMPLE_PRIORITY.HSK1 ?? []) expect(word).toMatch(/^\p{Script=Han}+$/u);
  });
  it("lists at most four samples per level", () => {
    for (const words of Object.values(LEVEL_SAMPLE_PRIORITY))
      expect(words!.length).toBeLessThanOrEqual(4);
  });
});
