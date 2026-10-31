/** WordCrawler validation and normalized catalog contract. Exports: schemas/types, normalizeDeck. Depends on: zod. */
import { z } from "zod";
import type { TargetLocale } from "./target-language";
import { GRAMMAR_KEYS, deckGrammarFields, foldGrammar, grammarSchema } from "./grammar";

/** CEFR levels — used by the English (and ko, fr, de, es) vocabulary pages. */
export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
/** HSK 3.0 (2021) proficiency levels — the official Chinese word-frequency standard for the hoa domain. */
export const HSK_LEVELS = [
  "HSK1",
  "HSK2",
  "HSK3",
  "HSK4",
  "HSK5",
  "HSK6",
  "HSK7",
  "HSK8",
  "HSK9",
] as const;
/** JLPT levels, easiest first (N5 is the beginner level) — the nhat (Japanese) domain. */
export const JLPT_LEVELS = ["N5", "N4", "N3", "N2", "N1"] as const;
/** TOPIK levels, easiest first — the han (Korean) domain. */
export const TOPIK_LEVELS = ["TOPIK1", "TOPIK2", "TOPIK3", "TOPIK4", "TOPIK5", "TOPIK6"] as const;
/** Master enum accepted by the word schema; covers every proficiency system, each easiest first. */
export const LEVELS = [...CEFR_LEVELS, ...HSK_LEVELS, ...JLPT_LEVELS, ...TOPIK_LEVELS] as const;
export const STYLE_IDS = ["detective", "speed", "confession", "minimal"] as const;
const optionalText = (max: number) => z.string().trim().max(max).optional().default("");
/** A grouping-axis value: lowercase slug, no spaces, so it is safe in a URL filter. */
const taxonomySlug = (max: number) =>
  z
    .string()
    .trim()
    .toLowerCase()
    .max(max)
    .regex(/^[a-z0-9-]+$/);
// Crawler-produced Vietnamese emphasis annotations (deck field `emphasis`, converted
// from the crawler's internal emphasisVi). Meaningful phrases only: trimmed,
// letter-bearing, short enough to be a compound phrase rather than a sentence.
const emphasisPhrase = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine((phrase) => /\p{L}/u.test(phrase), "Emphasis phrases must contain letters")
  .refine(
    (phrase) => phrase.split(/\s+/).filter(Boolean).length <= 6,
    "Emphasis phrases must be at most 6 words",
  );
const wordSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-zA-Z0-9_-]+$/),
  word: z
    .string()
    .trim()
    .min(1)
    .max(64)
    // A headword in any deck language: Unicode letters (so German äöüß, French
    // accents, Spanish ñ all pass) with inner ', - or spaces for multi-word entries
    // ("sich vorstellen"), or any run of Han, kana or Hangul for the Chinese, Japanese
    // and Korean decks, where one glyph can be a whole word (水, お, 것).
    .regex(
      /^(?:(?=.{2})\p{L}+(?:['’ -]\p{L}+)*|[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー\p{Script=Hangul}]+)$/u,
    ),
  /**
   * The short handle used to share this word as a challenge (`/w/K7F`). Assigned
   * once by scripts/assign-share-codes.ts and then permanent: codes escape into
   * chat threads and must keep meaning the same word forever. Optional on the
   * type so a deck authored before codes existed still parses; check:share-codes
   * is what requires every PUBLISHED word to carry one.
   */
  shareCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[0-9A-HJKMNP-TV-Z]{3}$/)
    .optional(),
  /**
   * The short gloss — what the word MEANS, in a word or two ("tò mò", "kiên nhẫn").
   *
   * This is what the reveal panel shows. `defVi` is a full sentence written to work as a
   * CLUE before the answer is known, which is the wrong register once the reader has the
   * word in front of them: they want the equivalent, not a description of it.
   *
   * Optional because decks authored before the field existed do not carry it, and the
   * panel falls back to `defVi` for those. check:meanings is what requires every
   * PUBLISHED English word to have one — same arrangement as shareCode above.
   */
  meaningVi: optionalText(120),
  defVi: z.string().trim().min(2).max(400),
  leadVi: optionalText(240),
  anticipateVi: optionalText(180),
  emphasis: z.array(emphasisPhrase).max(6).optional(),
  pos: optionalText(40),
  ipa: optionalText(120),
  topic: z
    .string()
    .trim()
    .toLowerCase()
    .max(60)
    .regex(/^[a-z0-9-]*$/)
    .optional()
    .default("general"),
  // The canonical usage axis. `topic` above stays as the first of these, so readers and
  // scripts written against the single-value field keep working.
  topics: z.array(taxonomySlug(60)).max(6).optional(),
  /** Exam and competition targets this word is prepared for. */
  exams: z.array(taxonomySlug(40)).max(8).optional(),
  level: z.enum(LEVELS).optional(),
  style: z.enum(STYLE_IDS).optional(),
  chars: z.number().int().nonnegative().optional(),
  initial: z.string().max(4).optional(),
  usage: z
    .array(
      z.object({
        en: z.string().trim().min(1).max(400),
        vi: optionalText(400),
        /**
         * What fills the blank when it is not the headword itself: a conjugated form
         * (する → します, 行く → 行って). Absent when the headword fits as written.
         */
        fill: z.string().trim().min(1).max(64).optional(),
      }),
    )
    .max(5)
    .optional()
    .default([]),
  /**
   * The word's grammar in its own language (plural, conjugation, governed case,
   * counter, the beginner trap…), behind the meaning panel's "Nâng cao" section. A
   * generated deck writes these fields flat on the card; normalizeDeck folds them in
   * here with every null dropped (lib/grammar.ts). Absent for a word with none.
   */
  grammar: grammarSchema.optional(),
});
/** A word as a deck writes it: the grammar fields may sit flat on the card. */
const deckWordSchema = wordSchema.extend(deckGrammarFields);
const deckSchema = z.object({
  meta: z
    .object({ name: optionalText(160) })
    .passthrough()
    .optional(),
  words: z.array(deckWordSchema).min(1, "The deck must contain at least one word").max(100_000),
});
export type VocabularyWord = z.infer<typeof wordSchema>;
export type VocabularyLevel = (typeof LEVELS)[number];
export type NarrativeStyle = (typeof STYLE_IDS)[number];
export type LevelSystem = "cefr" | "hsk" | "jlpt" | "topik";

/** Which proficiency standard applies to a deck locale. */
export function levelSystemFor(locale: TargetLocale): LevelSystem {
  if (locale === "zh") return "hsk";
  if (locale === "ja") return "jlpt";
  if (locale === "ko") return "topik";
  return "cefr";
}

/** @returns Every level of a deck locale's proficiency system, easiest first. */
export function levelsFor(locale: TargetLocale): readonly VocabularyLevel[] {
  const system = levelSystemFor(locale);
  if (system === "hsk") return HSK_LEVELS;
  if (system === "jlpt") return JLPT_LEVELS;
  if (system === "topik") return TOPIK_LEVELS;
  return CEFR_LEVELS;
}
export type Catalog = {
  revision: string;
  name: string;
  count: number;
  topics: string[];
  levels: VocabularyLevel[];
  words: VocabularyWord[];
};

/** Match a target as a whole word, preserving Unicode boundaries. @param word English target. @returns Global regex. */
export function answerPattern(word: string): RegExp {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\p{L}])${escaped}(?![\\p{L}])`, "giu");
}

/**
 * Normalize emphasis annotations: NFC + whitespace collapse, deduplicated by a
 * case-insensitive key that keeps diacritics (so "những"/"nhưng" stay distinct).
 * The first occurrence wins and is kept verbatim for exact downstream matching.
 * @param phrases Raw deck annotations.
 * @returns Normalized deduplicated phrases, or undefined when none survive.
 */
function normalizeEmphasisPhrases(phrases?: string[]): string[] | undefined {
  if (!phrases?.length) return undefined;
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const phrase of phrases) {
    const value = phrase.normalize("NFC").trim().replace(/\s+/g, " ");
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(value);
  }
  return normalized.length ? normalized : undefined;
}

/** Validate the complete deck before allowing any output. @param input Untrusted JSON. @returns Normalized content without a revision. */
export function normalizeDeck(input: unknown): Omit<Catalog, "revision"> {
  const parsed = deckSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(
      parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("\n"),
    );
  }
  const ids = new Set<string>();
  const targets = new Set<string>();
  const errors: string[] = [];
  const words = parsed.data.words.map((deckEntry, index) => {
    const entry = Object.fromEntries(
      Object.entries(deckEntry).filter(([key]) => !(GRAMMAR_KEYS as string[]).includes(key)),
    ) as VocabularyWord;
    const grammar = foldGrammar(deckEntry);
    // The headword keeps the case it was written in: a German noun is capitalised
    // (der Kollege), and every answer check already compares without case. Duplicates
    // are still caught case-insensitively.
    const word = entry.word.normalize("NFC").replaceAll("’", "'");
    const id = entry.id.toLowerCase();
    const target = word.toLowerCase();
    if (ids.has(id)) errors.push(`words.${index}.id: Duplicate ID ${id}`);
    if (targets.has(target)) errors.push(`words.${index}.word: Duplicate word ${word}`);
    if (answerPattern(word).test(entry.anticipateVi)) {
      errors.push(`words.${index}.anticipateVi: Contains the English answer`);
    }
    ids.add(id);
    targets.add(target);
    // The multi-valued axis is canonical. A deck carrying only the legacy single
    // `topic` is lifted into it, and `topic` is always restated as the first entry so
    // the two can never disagree.
    const topics = [...new Set(entry.topics?.length ? entry.topics : [entry.topic || "general"])];
    return {
      ...entry,
      id,
      word,
      topic: topics[0]!,
      topics,
      exams: entry.exams?.length ? [...new Set(entry.exams)] : undefined,
      chars: (word.match(/\p{L}/gu) ?? []).length,
      initial: word[0].toUpperCase(),
      emphasis: normalizeEmphasisPhrases(entry.emphasis),
      grammar,
    };
  });
  if (errors.length) throw new Error(errors.join("\n"));
  return {
    name: parsed.data.meta?.name || "WordCrawler vocabulary",
    count: words.length,
    topics: [...new Set(words.flatMap((word) => word.topics))].sort(),
    levels: LEVELS.filter((level) => words.some((word) => word.level === level)),
    words,
  };
}

/**
 * Compact, stable FNV-1a hash rendered as hex. Used to derive one revision for a
 * merged catalog so pagination stays deterministic for a given set of inputs without
 * pulling in node:crypto on the client.
 *
 * One FNV-1a pass is only 32 bits, so a wider digest is built by re-running the pass
 * over a round-salted copy of the input and concatenating the blocks: the merged
 * revision then has the same shape as every stored one (`scripts/import-vocabulary.ts`
 * writes a 24-hex sha256 slice, and the feed endpoint validates that shape), which
 * matters because the server echoes this value back as the pagination cursor and a
 * short revision there rejects every page after the first.
 * @param input Any string
 * @param hexChars Digest width, in hex characters (8 per FNV-1a round)
 * @returns Lowercase hex digest of the requested width
 * @pure true
 */
function stableHash(input: string, hexChars = 24): string {
  let digest = "";
  for (let round = 0; digest.length < hexChars; round += 1) {
    const stream = `${round}:${input}`;
    let hash = 0x811c9dc5;
    for (let index = 0; index < stream.length; index += 1) {
      hash ^= stream.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    digest += hash.toString(16).padStart(8, "0");
  }
  return digest.slice(0, hexChars);
}

/**
 * Merge compiled catalogs — the admin-editable base plus any number of read-only
 * third-party packs — into the single catalog the feed serves. Words are de-duplicated
 * by id and by headword with the FIRST catalog winning, so the base always overrides a
 * provider pack that ships the same word. `count`, `topics`, `levels`, `revision` and
 * `name` are recomputed from the merged words so filters and deterministic pagination
 * reflect the union rather than any one input.
 * @param catalogs - base catalog first, then packs in a stable (sorted-by-path) order
 * @returns One merged Catalog
 * @pure true
 */
export function mergeCatalogs(...catalogs: Catalog[]): Catalog {
  const seenIds = new Set<string>();
  const seenWords = new Set<string>();
  const words: VocabularyWord[] = [];
  for (const source of catalogs) {
    for (const word of source.words) {
      const id = word.id.toLowerCase();
      const head = word.word.toLowerCase();
      // First pack wins: a duplicate id or headword from a later pack is dropped so the
      // feed never shows the same word twice and reaction/storage keys stay unambiguous.
      if (seenIds.has(id) || seenWords.has(head)) continue;
      seenIds.add(id);
      seenWords.add(head);
      words.push(word);
    }
  }
  const base = catalogs[0];
  const revision = stableHash(
    catalogs.map((catalog) => `${catalog.revision}:${catalog.count}`).join("|"),
  );
  const name =
    catalogs.length > 1
      ? `${base?.name ?? "WordCrawler vocabulary"} + ${catalogs.length - 1} pack${
          catalogs.length > 2 ? "s" : ""
        }`
      : (base?.name ?? "WordCrawler vocabulary");
  return {
    revision,
    name,
    count: words.length,
    topics: [
      ...new Set(words.flatMap((word) => (word.topics?.length ? word.topics : [word.topic]))),
    ].sort(),
    levels: LEVELS.filter((level) => words.some((word) => word.level === level)),
    words,
  };
}
