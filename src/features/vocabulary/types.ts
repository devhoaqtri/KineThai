/** Public vocabulary transport/UI types; contains no catalog data. Exports: feed contracts. Depends on: schema types, target language. */
import type { NarrativeStyle, VocabularyLevel, VocabularyWord } from "./lib/schema";

export type { TargetLocale } from "./lib/target-language";

export type VocabularyFilters = {
  topic: string;
  level: VocabularyLevel | "";
  /** Difficulty track id, or "" for every level. Resolved to a CEFR (or HSK) band. */
  difficulty: string;
};
export type FeedRequest = VocabularyFilters & {
  seed: string;
  position: number;
  revision?: string;
  limit: number;
};
export type FeedEntry = {
  occurrenceId: string;
  position: number;
  cycle: number;
  word: VocabularyWord;
};
export type FeedPage = {
  entries: FeedEntry[];
  seed: string;
  revision: string;
  position: number;
  previousPosition: number | null;
  nextPosition: number | null;
  total: number;
  matching: number;
  name: string;
  topics: string[];
  /** Exact reader levels in the deck (CEFR, HSK, or Japanese school levels). */
  levels: VocabularyLevel[];
  /** Levels the difficulty tracks filter on: English CEFR for Japanese decks. */
  trackLevels: VocabularyLevel[];
  /** Words per track level under the page's topic filter; sizes the difficulty picker. */
  levelCounts: Partial<Record<VocabularyLevel, number>>;
  /** A few representative words per level, for the onboarding picker's samples. */
  levelSamples: Partial<Record<VocabularyLevel, { word: string; defVi: string }[]>>;
  /** Total words under the page's topic filter, unlevelled words included. */
  topicTotal: number;
  /** Signed cursor the next (or previous) page request must echo back. Server pages only. */
  cursor?: string;
  /**
   * Client-only: the filters that actually served this page when a fallback widened them
   * (lib/feed-fallback). Absent when the stream's own filters did.
   */
  scope?: VocabularyFilters;
};
/**
   * Where the next request goes. `seed` and `scope` are set only after a recovery restarted
   * the stream on a derived seed or widened its filters; later pages must keep them.
   */
export type FeedCursor = {
  position: number;
  revision?: string;
  token?: string;
  seed?: string;
  scope?: VocabularyFilters;
};
/**
 * Which visual dialect dresses the stream. "douyin" swaps in the mainland-flavored
 * palettes, motion presets and highlight reskin; it is only ever offered on the
 * Chinese (hoa.*) host and only when the reader turns the default visuals off.
 */
export type VisualDialect = "default" | "douyin";
/**
 * `theme` is an allow-list: "mix" lets every theme rotate, one id locks the look,
 * and a comma-joined id list (the picker's unselect model) rotates within just those.
 * `dialect` picks the pool that allow-list is read against.
 */
/** How long each clue page stays up; "fast" is the stream's native timing. */
export type ReadingPace = "slow" | "normal" | "fast";
/**
 * `autoplay` is play/pause. `advance` decides what a finished word does: move on to the
 * next one (default), or replay itself from the first clue until the reader moves on.
 * `expandGrammar` opens the answer's "Nâng cao" section on every word that has one and
 * gives that answer page twice the time.
 */
export type Presentation = {
  theme: string;
  style: NarrativeStyle | "mix";
  autoplay: boolean;
  advance?: boolean;
  pace?: ReadingPace;
  dialect?: VisualDialect;
  expandGrammar?: boolean;
};
