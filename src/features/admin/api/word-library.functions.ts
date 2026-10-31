/**
 * Server side of the word library: every deck, one language at a time.
 *
 * Words are read from the deck readers are served, so this is the whole vocabulary rather
 * than the workbench's authoring queue. A table is one page of 50 cut here, so a deck of
 * thousands costs one page per request. Decks are server-only, so these handlers load them
 * lazily and a page never imports them.
 *
 * Exports: getWordLibrary, listLibraryWords, getLibraryWord, updateLibraryWord, LibraryDeck,
 *   LibraryFolder, LibraryOverview, LibraryRow, LibraryPage, LibraryWordDetail
 * Depends on: @tanstack/react-start, zod, admin gates, vocabulary catalog and report store
 *   (both lazy), deck-files.server (lazy), ../lib/word-library
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { LEVELS, type VocabularyWord } from "@/features/vocabulary/lib/schema";
import { getBlockedByLocale } from "@/features/vocabulary/lib/word-block";
import { TARGET_LOCALES, type TargetLocale } from "@/features/vocabulary/lib/target-language";
import { requireAdminAccess } from "../lib/admin-access";
import { requireAdminContext } from "../lib/require-admin";
import { pageOf } from "../lib/workbench-filter";
import {
  LIBRARY_PAGE_SIZE,
  NO_LEVEL,
  plainText,
  searchWords,
  sortWords,
} from "../lib/word-library";

export type LibraryFolder = {
  /** A level, or NO_LEVEL. */
  level: string;
  count: number;
  /** Open reader reports against words in this folder. */
  open: number;
  /** Words in this folder hidden from the feed. */
  hidden: number;
  /** The first few words, so a closed folder shows what is inside. */
  samples: string[];
};

export type LibraryDeck = { locale: TargetLocale; total: number; folders: LibraryFolder[] };

export type LibraryOverview = { decks: LibraryDeck[] };

export type LibraryRow = {
  id: string;
  word: string;
  meaning: string;
  ipa: string;
  pos: string;
  level: string;
  topic: string;
  shareCode: string;
  open: number;
  hidden: boolean;
};

export type LibraryPage = { rows: LibraryRow[]; total: number; page: number; pageCount: number };

export type LibraryWordDetail = {
  id: string;
  word: string;
  meaningVi: string;
  defVi: string;
  leadVi: string;
  anticipateVi: string;
  ipa: string;
  pos: string;
  level: string;
  usage: { en: string; vi: string }[];
  shareCode: string;
  open: number;
  hidden: boolean;
  /** The deck file a save changes, or null where this word cannot be written. */
  file: string | null;
};

const localeSchema = z.enum(TARGET_LOCALES as [TargetLocale, ...TargetLocale[]]);
const levelOf = (word: VocabularyWord) => word.level ?? NO_LEVEL;

/** Alphabetical words per loaded deck, so a page does not sort thousands of words again. */
const sortedDecks = new WeakMap<object, VocabularyWord[]>();

async function sortedDeck(locale: TargetLocale): Promise<VocabularyWord[]> {
  const { catalogFor } = await import("@/features/vocabulary/api/catalog.server");
  const deck = catalogFor(locale);
  let words = sortedDecks.get(deck);
  if (!words) {
    words = sortWords(deck.words, locale);
    sortedDecks.set(deck, words);
  }
  return words;
}

/** What readers have said about each word: open reports by deck and the hidden words. */
async function reportState() {
  const { listWordReportSignals } =
    await import("@/features/vocabulary/api/word-report-store.server");
  const signals = await listWordReportSignals();
  const blocked = getBlockedByLocale(signals);
  const open = new Map<string, number>();
  for (const signal of signals) {
    if (signal.status !== "new") continue;
    const key = `${signal.locale}:${signal.wordId}`;
    open.set(key, (open.get(key) ?? 0) + 1);
  }
  return {
    openFor: (locale: TargetLocale, id: string) => open.get(`${locale}:${id}`) ?? 0,
    hiddenIn: (locale: TargetLocale, id: string) => blocked.get(locale)?.has(id) ?? false,
  };
}

/** Every language with its level folders. */
export const getWordLibrary = createServerFn({ method: "GET" })
  .middleware([requireAdminAccess])
  .handler(async ({ context }): Promise<LibraryOverview> => {
    await requireAdminContext({ authUserId: context.userId });
    const { DECK_LOCALES } = await import("@/features/vocabulary/api/catalog.server");
    const { openFor, hiddenIn } = await reportState();
    const decks = await Promise.all(
      DECK_LOCALES.map(async (locale) => {
        const folders = new Map<string, LibraryFolder>();
        const words = await sortedDeck(locale);
        for (const word of words) {
          const level = levelOf(word);
          let folder = folders.get(level);
          if (!folder) {
            folder = { level, count: 0, open: 0, hidden: 0, samples: [] };
            folders.set(level, folder);
          }
          folder.count += 1;
          folder.open += openFor(locale, word.id);
          if (hiddenIn(locale, word.id)) folder.hidden += 1;
          if (folder.samples.length < 3) folder.samples.push(plainText(word.word));
        }
        const order = (level: string) => {
          const index = (LEVELS as readonly string[]).indexOf(level);
          return index < 0 ? LEVELS.length : index;
        };
        return {
          locale,
          total: words.length,
          folders: [...folders.values()].sort((a, b) => order(a.level) - order(b.level)),
        };
      }),
    );
    return { decks };
  });

/** One page of a language: a folder's words, or what a search found. */
export const listLibraryWords = createServerFn({ method: "GET" })
  .middleware([requireAdminAccess])
  .inputValidator((input: unknown) =>
    z
      .object({
        locale: localeSchema,
        level: z.string().max(8).optional(),
        q: z.string().trim().max(64).default(""),
        page: z.coerce.number().int().min(0).max(100_000).default(0),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<LibraryPage> => {
    await requireAdminContext({ authUserId: context.userId });
    const { locale, level, q } = data;
    const words = await sortedDeck(locale);
    const inFolder = level ? words.filter((word) => levelOf(word) === level) : words;
    const found = searchWords(inFolder, q);
    const { slice, page, pageCount } = pageOf(found, data.page, LIBRARY_PAGE_SIZE);
    const { openFor, hiddenIn } = await reportState();
    return {
      rows: slice.map((word) => ({
        id: word.id,
        word: word.word,
        meaning: plainText(word.meaningVi ?? ""),
        ipa: word.ipa ?? "",
        pos: word.pos ?? "",
        level: levelOf(word),
        topic: word.topic ?? "",
        shareCode: word.shareCode ?? "",
        open: openFor(locale, word.id),
        hidden: hiddenIn(locale, word.id),
      })),
      total: found.length,
      page,
      pageCount,
    };
  });

/** One word for the editor, with its text exactly as stored where the deck file can be read. */
export const getLibraryWord = createServerFn({ method: "GET" })
  .middleware([requireAdminAccess])
  .inputValidator((input: unknown) =>
    z.object({ locale: localeSchema, id: z.string().min(1).max(80) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<LibraryWordDetail | null> => {
    await requireAdminContext({ authUserId: context.userId });
    const { locale, id } = data;
    const { deckFilesWritable, readDeckWord } =
      await import("@/features/vocabulary/api/deck-files.server");
    const served = (await sortedDeck(locale)).find((word) => word.id === id);
    const stored = (await deckFilesWritable(locale)) ? await readDeckWord(locale, id) : null;
    const word = stored?.word ?? served;
    if (!word) return null;
    const { openFor, hiddenIn } = await reportState();
    return {
      id,
      word: word.word ?? "",
      meaningVi: word.meaningVi ?? "",
      defVi: word.defVi ?? "",
      leadVi: word.leadVi ?? "",
      anticipateVi: word.anticipateVi ?? "",
      ipa: word.ipa ?? "",
      pos: word.pos ?? "",
      level: word.level ?? "",
      usage: (word.usage ?? []).map((line) => ({ en: line.en, vi: line.vi ?? "" })),
      shareCode: served?.shareCode ?? "",
      open: openFor(locale, id),
      hidden: hiddenIn(locale, id),
      file: stored?.file ?? null,
    };
  });

const usageSchema = z.array(
  z.object({ en: z.string().trim().min(1).max(400), vi: z.string().trim().max(400) }),
);

/** The fields a save can change, each one only when the editor sends it. */
const editSchema = z
  .object({
    word: z.string().trim().min(1).max(64),
    meaningVi: z.string().trim().max(120),
    defVi: z.string().trim().max(400),
    leadVi: z.string().trim().max(240),
    anticipateVi: z.string().trim().max(180),
    ipa: z.string().trim().max(120),
    pos: z.string().trim().max(40),
    level: z.enum(LEVELS),
    usage: usageSchema,
  })
  .partial();

/** Save one word to its deck file. Local only: a deployment has none to write. */
export const updateLibraryWord = createServerFn({ method: "POST" })
  .middleware([requireAdminAccess])
  .inputValidator((input: unknown) =>
    z
      .object({
        locale: localeSchema,
        id: z.string().min(1).max(80),
        edit: editSchema,
        expected: editSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ file: string }> => {
    await requireAdminContext({ authUserId: context.userId });
    const { locale, id, edit, expected } = data;
    const { deckFilesWritable, updateDeckWord } =
      await import("@/features/vocabulary/api/deck-files.server");
    if (!(await deckFilesWritable(locale))) {
      throw new Error("This server cannot write decks. Edit words with `npm run dev` locally.");
    }
    const { file } = await updateDeckWord(locale, id, edit, expected);
    return { file };
  });
