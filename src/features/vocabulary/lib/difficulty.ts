/**
 * Difficulty tracks: the learner-facing names shown in the feed's dropdown, and
 * the level bands each one selects.
 *
 * Two sets coexist: CEFR tracks for English words (including the Japanese deck, whose
 * headwords are English), and HSK tracks for the hoa (Chinese) domain. Japanese school
 * levels are a separate reader adaptation, never a title difficulty track. The bands
 * deliberately overlap: ten named intents cannot map one-to-one onto six CEFR (or nine
 * HSK) levels without either collapsing two tracks into the same words or leaving
 * tracks empty, and an empty track is worse than a shared one. Every band is distinct
 * as a set, and every band intersects the levels the bundled deck actually carries, so
 * no track renders an empty stream.
 *
 * Exports: DifficultyTrack, DIFFICULTY_TRACKS, DIFFICULTY_IDS, DIFFICULTY_ALL,
 *          LEVEL_SAMPLE_PRIORITY, tracksFor, CEFR_TRACKS, HSK_TRACKS,
 *          difficultyLevels, formatLevelBand, countTrackWords,
 *          trackCeiling, isTrackAvailable
 * Depends on: ./schema, ./target-language
 */

import { LEVELS, isJapaneseLevel, type VocabularyLevel } from "./schema";
import type { TargetLocale } from "./target-language";

export type DifficultyTrack = {
  /** URL-safe id, sent to the feed endpoint as `difficulty`. */
  id: string;
  /** Vietnamese label shown in the dropdown. */
  label: string;
  /** One-line gloss so a track is more than a name. */
  hint: string;
  /** Emoji that denotes this track's rung on the difficulty ladder. */
  emoji: string;
  /** HSK levels this track admits. */
  levels: VocabularyLevel[];
  /**
   * Which level's sample word is shown in the onboarding picker.
   * Defaults to trackCeiling() (the hardest level) when omitted.
   * Set explicitly on sơ cấp so the first rung shows truly basic HSK1 words
   * rather than the HSK2 business terms in the base catalog.
   */
  sampleLevel?: VocabularyLevel;
};

/** Sentinel for "no track chosen" — the endpoint accepts it alongside a track id. */
export const DIFFICULTY_ALL = "";

/**
 * Words that should appear first in the onboarding sample pool for each level.
 * The base catalog carries business HSK3 words (deadline, feedback…) that would be
 * shown as the first HSK3 samples under the old catalog-order rule; listing specific
 * everyday words here ensures the representative shown for each level is one that
 * a learner would actually recognise at that difficulty. Latin-script samples also start
 * with "a" (see levelTally), so these lists do too.
 */
export const LEVEL_SAMPLE_PRIORITY: Partial<Record<VocabularyLevel, readonly string[]>> = {
  A1: ["angry", "afraid", "amazing", "awesome"],
  A2: ["active", "alive", "attractive", "awful"],
  B2: ["anxiety", "astonishing", "apology", "approval"],
  C1: ["articulate", "anonymous", "assertion", "aspiration"],
  HSK1: ["饥饿", "口渴", "累", "生气"],
  HSK2: ["骄傲", "诚实", "礼貌", "懒"],
};

/** The ten CEFR tracks for the English (and ko) feed. */
export const CEFR_TRACKS: readonly DifficultyTrack[] = [
  {
    id: "vo-long",
    label: "vỡ lòng",
    hint: "Mới bắt đầu, toàn từ rất quen",
    emoji: "🐣",
    levels: ["A1", "A2"],
    sampleLevel: "A1",
  },
  {
    id: "co-ban",
    label: "cơ bản",
    hint: "Vốn từ nền tảng hằng ngày",
    emoji: "🌱",
    levels: ["A2"],
    sampleLevel: "A2",
  },
  {
    id: "du-lich",
    label: "du lịch",
    hint: "Đủ dùng khi đi xa",
    emoji: "🌿",
    levels: ["A2", "B1"],
  },
  {
    id: "giao-tiep",
    label: "giao tiếp",
    hint: "Nói chuyện tự nhiên hơn",
    emoji: "🌾",
    levels: ["A1", "A2", "B1"],
  },
  {
    id: "doc-hieu",
    label: "đọc hiểu",
    hint: "Đọc báo và đọc truyện",
    emoji: "🍃",
    levels: ["B1", "B2"],
  },
  {
    id: "chuyen-sau",
    label: "chuyên sâu",
    hint: "Sắc thái và cách dùng",
    emoji: "🌳",
    levels: ["B2"],
  },
  {
    id: "viet-lach",
    label: "viết lách",
    hint: "Chữ nghĩa dùng khi viết",
    emoji: "🔥",
    levels: ["B1", "C1"],
  },
  {
    id: "du-hoc",
    label: "du học",
    hint: "Tiếng Anh học thuật",
    emoji: "🚀",
    levels: ["B1", "B2", "C1"],
  },
  {
    id: "nang-cao",
    label: "nâng cao",
    hint: "Từ trừu tượng hơn",
    emoji: "⚡",
    levels: ["B2", "C1"],
  },
  {
    id: "van-chuong",
    label: "văn chương",
    hint: "Ngôn từ đẹp và hiếm",
    emoji: "🧠",
    levels: ["B2", "C1", "C2"],
  },
];

/** The ten HSK tracks for the hoa (Chinese) feed. */
export const HSK_TRACKS: readonly DifficultyTrack[] = [
  {
    id: "vo-long",
    label: "sơ cấp",
    hint: "Mới bắt đầu, toàn từ rất quen",
    emoji: "🐣",
    levels: ["HSK1", "HSK2"],
    sampleLevel: "HSK1",
  },
  {
    id: "co-ban",
    label: "căn bản",
    hint: "Vốn từ nền tảng hằng ngày",
    emoji: "🌱",
    levels: ["HSK2"],
    sampleLevel: "HSK2",
  },
  {
    id: "du-lich",
    label: "thực dụng",
    hint: "Đủ dùng khi đi xa",
    emoji: "",
    levels: ["HSK2", "HSK3"],
  },
  {
    id: "giao-tiep",
    label: "giao tiếp",
    hint: "Nói chuyện tự nhiên hơn",
    emoji: "🌾",
    levels: ["HSK1", "HSK2", "HSK3"],
  },
  {
    id: "doc-hieu",
    label: "đọc hiểu",
    hint: "Đọc báo và đọc truyện",
    emoji: "🍃",
    levels: ["HSK3", "HSK4"],
  },
  {
    id: "chuyen-sau",
    label: "chuyên sâu",
    hint: "Sắc thái và cách dùng",
    emoji: "🌳",
    levels: ["HSK4"],
  },
  {
    id: "viet-lach",
    label: "thư diện",
    hint: "Chữ nghĩa dùng khi viết",
    emoji: "🔥",
    levels: ["HSK3", "HSK5"],
  },
  {
    id: "du-hoc",
    label: "học thuật",
    hint: "Tiếng Trung học thuật",
    emoji: "🚀",
    levels: ["HSK3", "HSK4", "HSK5"],
  },
  {
    id: "nang-cao",
    label: "cao cấp",
    hint: "Từ trừu tượng hơn",
    emoji: "",
    levels: ["HSK4", "HSK5"],
  },
  {
    id: "van-chuong",
    label: "văn chương",
    hint: "Ngôn từ đẹp và hiếm",
    emoji: "🧠",
    levels: ["HSK4", "HSK5", "HSK6"],
  },
];

/** Track ids shared by both sets (same id appears in CEFR_TRACKS and HSK_TRACKS). */
const SHARED_TRACK_IDS = CEFR_TRACKS.map((track) => track.id);

/** Default export for consumers that don't branch by locale (the English UI). */
export const DIFFICULTY_TRACKS: readonly DifficultyTrack[] = CEFR_TRACKS;

/** Every track id, for request validation. */
export const DIFFICULTY_IDS = SHARED_TRACK_IDS;

/**
 * Resolve the locale-appropriate difficulty tracks.
 * @param locale Deck locale
 * @returns HSK tracks for zh, CEFR tracks for en/ko/ja
 * @pure true
 */
export function tracksFor(locale: TargetLocale): readonly DifficultyTrack[] {
  if (locale === "zh") return HSK_TRACKS;
  return CEFR_TRACKS;
}

/**
 * The hardest level a track reaches — the level that makes it THAT track.
 * @param track A difficulty track
 * @returns Its highest level in the canonical order
 * @pure true
 */
export function trackCeiling(track: DifficultyTrack): VocabularyLevel {
  const ordered = LEVELS.filter((level) => track.levels.includes(level));
  return ordered[ordered.length - 1] ?? track.levels[0]!;
}

/**
 * Whether the catalog can actually serve a track yet.
 *
 * Bands overlap, so a track whose own top level is missing would still "work" by quietly
 * streaming the easier words it shares with the track below — "nâng cao" (B2–C1) with no
 * C1 words is just "chuyên sâu" (B2) under another name. That is a promise the deck cannot
 * keep, so a track is on offer only once the level that defines it has words; until then
 * it is listed, greyed, at zero.
 * @param track A difficulty track
 * @param catalogLevels Levels the catalog has at least one word for
 * @returns True when the track's ceiling level is populated
 * @pure true
 */
export function isTrackAvailable(
  track: DifficultyTrack,
  catalogLevels: readonly VocabularyLevel[],
): boolean {
  return catalogLevels.includes(trackCeiling(track));
}

/**
 * Resolve a `difficulty` value into the levels it admits. A difficulty is a
 * comma-joined list of track ids (multi-select), so the admitted band is the UNION of
 * every chosen track's levels, ordered by the canonical sequence.
 *
 * Given `catalogLevels`, tracks the catalog cannot serve yet (see isTrackAvailable)
 * contribute nothing — so a selection made only of such tracks admits NO words, rather
 * than falling back to "everything".
 *
 * Searches both CEFR_TRACKS and HSK_TRACKS: the catalog's track levels decide which set
 * provides a match (a CEFR catalog will never find an HSK track available, and vice versa).
 * @param difficulty Comma-joined track ids, or the empty sentinel for "all"
 * @param catalogLevels Levels the catalog has words for; omit to skip the availability rule
 * @returns The union band, an empty band when tracks were chosen but none can be served,
 *   or null when no track is chosen
 * @pure true
 */
export function difficultyLevels(
  difficulty: string,
  catalogLevels?: readonly VocabularyLevel[],
): VocabularyLevel[] | null {
  const ids = difficulty
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (!ids.length) return null;
  const allTracks = [...CEFR_TRACKS, ...HSK_TRACKS];
  const union = new Set<VocabularyLevel>();
  for (const id of ids) {
    // Find the track matching this id whose levels intersect with the catalog's levels.
    // When no catalogLevels provided, prefer the first match (CEFR order).
    const matches = allTracks.filter((entry) => entry.id === id);
    const track = catalogLevels
      ? (matches.find((t) => isTrackAvailable(t, catalogLevels)) ?? matches[0])
      : matches[0];
    if (!track) continue;
    if (catalogLevels && !isTrackAvailable(track, catalogLevels)) continue;
    for (const level of track.levels) union.add(level);
  }
  return LEVELS.filter((level) => union.has(level));
}

/**
 * Human-readable band for a dropdown row, e.g. "A1–A2", "HSK1–3" or "B2".
 * Every HSK level shares the "HSK" prefix, so the upper bound drops it.
 * Japanese school codes are internal ids, never reader copy, so they are omitted.
 * @param levels The track's level band
 * @returns A compact band label
 * @pure true
 */
export function formatLevelBand(levels: readonly VocabularyLevel[]): string {
  const visible: VocabularyLevel[] = levels.filter((level) => !isJapaneseLevel(level));
  if (!visible.length) return "";
  if (visible.length === 1) return visible[0]!;
  // Order by the canonical sequence, not by declaration order.
  const ordered = LEVELS.filter((level) => visible.includes(level));
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  if (!first || !last || first === last) return first ?? "";
  const hskTop = /^HSK(\d+)$/.exec(last)?.[1];
  return first.startsWith("HSK") && hskTop ? `${first}–${hskTop}` : `${first}–${last}`;
}

/**
 * How many words a set of tracks streams, given the catalog's per-level counts.
 *
 * Tracks overlap on purpose (see the header), so the size of a multi-track selection is
 * the count over the UNION of their levels — adding the tracks' own sizes would count a
 * shared level once per track. This is the same union `difficultyLevels` hands the feed
 * endpoint, availability rule included, so the figure shown is the pack that is served.
 * @param ids Track ids (order and duplicates do not matter)
 * @param levelCounts Words per level, as reported by the feed endpoint
 * @param catalogLevels Levels the catalog has words for
 * @returns The number of distinct words the selection admits (0 for no tracks)
 * @pure true
 */
export function countTrackWords(
  ids: Iterable<string>,
  levelCounts: Partial<Record<VocabularyLevel, number>>,
  catalogLevels: readonly VocabularyLevel[],
): number {
  const levels = difficultyLevels([...ids].join(","), catalogLevels);
  if (!levels) return 0;
  return levels.reduce((sum, level) => sum + (levelCounts[level] ?? 0), 0);
}
