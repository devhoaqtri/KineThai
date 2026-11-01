/**
 * How verified words from Word Refinery join the English deck.
 *
 * The refinery exports its verified catalogue in this repo's own deck shape with a
 * stamped header (docs/word-refinery-import.md). What it cannot know is what this
 * deck already holds: which headwords are here, under which ids, carrying which
 * share codes. That is decided here, by one rule per case:
 *
 *   in catalog.json      the admin's base wins; the refinery card is left out
 *   in the refinery pack updated in place, same id and share code
 *   in another pack      MOVED: the verified card inherits the id and share code and
 *                        the older copy leaves its pack, because the deck may carry a
 *                        headword (and a code) only once
 *   in the ledger only   a word that left and comes back gets its old code again
 *   nowhere              new; scripts/assign-share-codes.ts gives it a code
 *
 * A refinery pack word that is not in the export is kept: an export may come from a
 * catalogue that never held it, and dropping it would take a moved word off the feed.
 *
 * Exports: REFINERY_FORMAT, REFINERY_FORMAT_VERSION, REFINERY_PACK, readRefineryExport,
 *          planRefineryImport, RefineryPlan
 * Depends on: ./schema (types only)
 */
import type { VocabularyWord } from "./schema";

export const REFINERY_FORMAT = "word-refinery.kinemedia-deck";
export const REFINERY_FORMAT_VERSION = 1;
/** The pack the refinery's words live in: data/packs/<REFINERY_PACK>.json. */
export const REFINERY_PACK = "refinery-en";

/** A deck word as it arrives or as a compiled pack holds it; only these keys are read. */
type DeckWord = Record<string, unknown> & { id: string; word: string; shareCode?: string };

/**
 * Check the header and hand back the words.
 * @param raw - the parsed export file
 * @throws when the file is not a refinery export this version reads, or is glossed in
 *   a language this app does not explain words in
 */
export function readRefineryExport(raw: unknown): { name: string; words: DeckWord[] } {
  const file = raw as { meta?: Record<string, unknown>; words?: unknown };
  const meta = file?.meta;
  if (meta?.format !== REFINERY_FORMAT) {
    throw new Error(`Not a Word Refinery export (meta.format should be "${REFINERY_FORMAT}")`);
  }
  if (meta.formatVersion !== REFINERY_FORMAT_VERSION) {
    throw new Error(
      `Export format version ${String(meta.formatVersion)}; this importer reads ${REFINERY_FORMAT_VERSION}. Update KineMedia first.`,
    );
  }
  // Every deck here explains words in Vietnamese; a Japanese-glossed card has no page.
  if (meta.gloss !== "vi") {
    throw new Error(
      `Glossed in "${String(meta.gloss)}"; KineMedia explains words in Vietnamese only (gloss "vi").`,
    );
  }
  if (!Array.isArray(file.words) || file.words.length === 0)
    throw new Error("The export has no words");
  return {
    name: typeof meta.name === "string" ? meta.name : "Word Refinery verified",
    words: file.words as DeckWord[],
  };
}

export interface RefineryPlan {
  /** The refinery pack's new contents, uncompiled. */
  words: DeckWord[];
  /** Packs that lost words to the move, by file name, with what remains. */
  trimmed: Map<string, DeckWord[]>;
  report: {
    added: string[];
    updated: string[];
    moved: Array<{ word: string; from: string }>;
    restoredCode: string[];
    keptBase: string[];
    keptPrevious: number;
  };
}

const head = (word: { word: string }) => word.word.trim().toLowerCase();

/**
 * Decide where every incoming word goes.
 * @param input.incoming - the export's words
 * @param input.base - catalog.json's words
 * @param input.packs - every other English pack by file name, refinery pack excluded
 * @param input.previous - the refinery pack's current words (empty on the first import)
 * @param input.ledger - the English share-code ledger, code → id
 * @pure true
 */
export function planRefineryImport(input: {
  incoming: readonly DeckWord[];
  base: readonly VocabularyWord[];
  packs: ReadonlyMap<string, readonly DeckWord[]>;
  previous: readonly DeckWord[];
  ledger: Readonly<Record<string, string>>;
}): RefineryPlan {
  const report: RefineryPlan["report"] = {
    added: [],
    updated: [],
    moved: [],
    restoredCode: [],
    keptBase: [],
    keptPrevious: 0,
  };
  const baseHeads = new Set(input.base.map(head));
  const previousByHead = new Map(input.previous.map((word) => [head(word), word]));
  const packOf = new Map<string, { pack: string; word: DeckWord }>();
  for (const [pack, words] of input.packs) {
    for (const word of words) if (!packOf.has(head(word))) packOf.set(head(word), { pack, word });
  }
  const codeOf = new Map(Object.entries(input.ledger).map(([code, id]) => [id, code]));
  const usedIds = new Set<string>([
    ...input.base.map((word) => word.id),
    ...[...input.packs.values()].flat().map((word) => word.id),
  ]);

  const removed = new Map<string, Set<string>>();
  const words: DeckWord[] = [];
  const placed = new Set<string>();
  for (const incoming of input.incoming) {
    const key = head(incoming);
    if (placed.has(key)) continue;
    if (baseHeads.has(key)) {
      report.keptBase.push(incoming.word);
      continue;
    }
    placed.add(key);
    const previous = previousByHead.get(key);
    const older = packOf.get(key);
    let id = incoming.id;
    let shareCode: string | undefined;
    if (previous) {
      ({ id, shareCode } = previous);
      report.updated.push(incoming.word);
    } else if (older) {
      ({ id, shareCode } = older.word);
      (removed.get(older.pack) ?? removed.set(older.pack, new Set()).get(older.pack)!).add(key);
      report.moved.push({ word: incoming.word, from: older.pack });
    } else {
      for (let n = 2; usedIds.has(id); n += 1) id = `${incoming.id}-${n}`;
      shareCode = codeOf.get(id);
      if (shareCode) report.restoredCode.push(incoming.word);
      report.added.push(incoming.word);
    }
    usedIds.add(id);
    words.push({ ...incoming, id, ...(shareCode ? { shareCode } : {}) });
  }

  for (const word of input.previous) {
    if (placed.has(head(word))) continue;
    words.push(word);
    report.keptPrevious += 1;
  }

  const trimmed = new Map<string, DeckWord[]>();
  for (const [pack, heads] of removed) {
    trimmed.set(
      pack,
      input.packs.get(pack)!.filter((word) => !heads.has(head(word))),
    );
  }
  return { words, trimmed, report };
}
