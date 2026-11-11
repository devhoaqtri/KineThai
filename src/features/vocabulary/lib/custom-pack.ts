/**
 * Reader-imported vocabulary packs, kept only in this browser (localStorage) — never uploaded.
 *
 * A reader can keep several packs; at most one is ACTIVE, and while one is the feed pages
 * through it locally instead of the server deck. The library is one localStorage entry
 * holding the packs and the active id. It replaced a single-pack key, which is migrated on
 * first read.
 *
 * Two change signals, because they ask different things of a listener: CUSTOM_PACK_EVENT
 * fires when the ACTIVE pack changes (the feed restarts its stream on it), and
 * CUSTOM_PACKS_EVENT whenever the list does (a pack added or removed, or the active one
 * switching), for lists that only need to redraw.
 *
 * Exports: CustomPack, PackLibrary, parseCustomPack, loadCustomPackFromUrl, readPackLibrary,
 *   readCustomPack, addCustomPack, activateCustomPack, writeCustomPack, clearCustomPack,
 *   removeCustomPack, readCustomPage, packLevelCounts, CUSTOM_PACK_EVENT, CUSTOM_PACKS_EVENT,
 *   MAX_PACK_BYTES, packSizeError
 * Depends on: ./crawler-shared (markPhrase), ./schema (normalizeDeck), ./word-joiner, ./paging
 */
import { markPhrase } from "./crawler-shared";
import { normalizeDeck, type Catalog } from "./schema";
import { withWordJoiners } from "./word-joiner";
import { readCatalogPage } from "./paging";
import type { FeedPage, FeedRequest } from "../types";

/** The single active pack, before packs were kept as a library. Migrated, then removed. */
const LEGACY_KEY = "vocab.customPack.v1";
const LIBRARY_KEY = "vocab.customPacks.v2";
/** The active pack changed (a pack was played, stopped, or the active one removed). */
export const CUSTOM_PACK_EVENT = "vocab-custom-pack-change";
/** The list of packs changed in any way, the active one included. */
export const CUSTOM_PACKS_EVENT = "vocab-custom-packs-change";
/**
 * The largest pack file a reader may import, in bytes as a file manager shows them. Packs
 * live in localStorage (about 5 MB a site, shared with everything else the app keeps), and
 * 4 MB of word data is already about 5,800 cards in the app's own format (en-a1.json is
 * 530 KB for 778 words), so a bigger file is a deck to split, not a limit to raise.
 */
export const MAX_PACK_BYTES = 4 * 1024 * 1024;

/**
 * The reader-facing refusal for a pack over MAX_PACK_BYTES, or null when it fits: one
 * short line naming the limit, nothing more.
 * @param bytes - the file's size in bytes
 * @pure true
 */
export function packSizeError(bytes: number): string | null {
  return bytes > MAX_PACK_BYTES ? "Gói vượt quá giới hạn 4 MB." : null;
}

/** `id` is the catalog's content hash, so importing the same pack twice keeps one copy. */
export type CustomPack = { id: string; catalog: Catalog; source: string; importedAt: number };
export type PackLibrary = { packs: CustomPack[]; active: string | null };

function hash(text: string): string {
  let h = 0x811c9dc5;
  let out = "";
  for (let round = 0; round < 3; round++) {
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i) + round;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    out += h.toString(16).padStart(8, "0");
  }
  return out;
}

type RawWord = Record<string, unknown>;

/** Level named in a file name or URL (deck-v3-A1.json, hsk2.json, jlpt-n5.json, topik1.json), if any. */
function levelFromSource(source: string): string | undefined {
  const m = source.match(
    /(?:^|[^a-z0-9])(a1|a2|b1|b2|c1|c2|hsk[1-9]|n[1-5]|topik[1-6])(?=[^a-z0-9]|$)/i,
  );
  return m?.[1]?.toUpperCase();
}

const MARKED_FIELDS = ["defVi", "leadVi", "anticipateVi"] as const;
type MarkedField = (typeof MARKED_FIELDS)[number];

/**
 * Write a flat batch's highlight phrases into its clue text, because the feed glows only
 * inline `/…/` marks. Each phrase takes the first unmarked clue field holding it as a word.
 * @param clues The word's clue fields
 * @param phrases The batch's `emphasisVi`
 * @returns The clue fields that gained a mark
 * @pure true
 */
function markedClues(clues: Partial<Record<MarkedField, unknown>>, phrases: unknown) {
  const marked: Partial<Record<MarkedField, string>> = {};
  if (!Array.isArray(phrases)) return marked;
  for (const phrase of phrases) {
    if (typeof phrase !== "string") continue;
    for (const field of MARKED_FIELDS) {
      const text = marked[field] ?? clues[field];
      if (typeof text !== "string" || text.includes("/")) continue;
      const next = markPhrase(text, phrase);
      if (!next) continue;
      marked[field] = next;
      break;
    }
  }
  return marked;
}

/**
 * Accept the word packs this app already uses: the WordCrawler batch decks
 * (docs/Batches/<locale>/*.json — a bare array with usageEn/usageVi/emphasisVi, no ids) and the
 * compiled packs (data/packs/*.json — { revision, words: [...] }). Both become the
 * schema's word shape before validation.
 */
export function toDeck(
  json: unknown,
  source: string,
): { meta?: { name: string }; words: RawWord[] } {
  const list = (Array.isArray(json) ? json : (json as { words?: unknown })?.words) as unknown;
  if (!Array.isArray(list)) throw new Error("Không tìm thấy danh sách từ trong gói.");
  const root = Array.isArray(json) ? {} : (json as { name?: unknown; meta?: { name?: unknown } });
  const named = [root.meta?.name, root.name].find(
    (n): n is string => typeof n === "string" && n.trim() !== "",
  );
  const name =
    named?.trim() ||
    source
      .split(/[/\\]/)
      .pop()
      ?.replace(/\.json$/i, "") ||
    "Gói của bạn";
  const fallbackLevel = levelFromSource(source);
  const seen = new Set<string>();
  const usedIds = new Set<string>();
  const words: RawWord[] = [];
  for (const item of list as RawWord[]) {
    if (!item || typeof item !== "object" || typeof item.word !== "string") continue;
    const head = item.word.trim().toLowerCase();
    if (!head || seen.has(head)) continue;
    seen.add(head);
    const {
      usageEn,
      usageVi,
      emphasisVi,
      chars: _c,
      initial: _i,
      ...rest
    } = item as RawWord & { usageEn?: string; usageVi?: string; emphasisVi?: string[] };
    const usage =
      Array.isArray(rest.usage) && rest.usage.length
        ? rest.usage
        : usageEn
          ? [{ en: usageEn, vi: usageVi ?? "" }]
          : [];
    const exams = Array.isArray(rest.exams) && rest.exams.length ? rest.exams : undefined;
    // Accents are stripped before slugging (schützen → schutzen); when two words
    // still collide (schützen/schätzen), the later one gets a numeric suffix.
    let id =
      typeof rest.id === "string" && rest.id
        ? rest.id
        : head
            .normalize("NFD")
            .replace(/[̀-ͯ]/g, "")
            .replace(/[^a-z0-9_-]+/g, "-")
            .replace(/^-+|-+$/g, "") || `w${words.length}`;
    while (usedIds.has(id)) id = `${id.replace(/-\d+$/, "")}-${words.length}`;
    usedIds.add(id);
    words.push({
      ...rest,
      ...markedClues(rest, emphasisVi),
      id,
      usage,
      exams,
      emphasis: rest.emphasis ?? emphasisVi,
      level: rest.level ?? fallbackLevel,
    });
  }
  return { meta: { name }, words };
}

/** Validate raw JSON text against the app's pack formats. Throws a readable message on failure. */
export function parseCustomPack(text: string, source: string): CustomPack {
  // Bytes, not characters: a Vietnamese letter is two or three bytes in the file, and the
  // reader judges the limit by the size their file manager shows.
  const tooBig = packSizeError(new TextEncoder().encode(text).length);
  if (tooBig) throw new Error(tooBig);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("Tệp không phải JSON hợp lệ.");
  }
  const deck = normalizeDeck(toDeck(json, source));
  if (!deck.count) throw new Error("Gói không có từ nào.");
  const revision = hash(JSON.stringify(deck));
  return {
    id: revision,
    catalog: { revision, ...deck },
    source,
    importedAt: Date.now(),
  };
}

/** Fetch a pack straight from a public URL (the host must allow cross-origin reads). */
export async function loadCustomPackFromUrl(url: string): Promise<CustomPack> {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    throw new Error("Đường dẫn không hợp lệ.");
  }
  if (!/^https?:$/.test(parsed.protocol)) throw new Error("Chỉ hỗ trợ liên kết http/https.");
  let response: Response;
  try {
    response = await fetch(parsed.toString(), { credentials: "omit" });
  } catch {
    throw new Error("Không tải được liên kết (máy chủ có thể chặn truy cập chéo).");
  }
  if (!response.ok) throw new Error(`Liên kết trả về lỗi ${response.status}.`);
  return parseCustomPack(await response.text(), parsed.toString());
}

const EMPTY: PackLibrary = { packs: [], active: null };

function isPack(value: unknown): value is CustomPack {
  const pack = value as Partial<CustomPack> | null;
  return (
    !!pack &&
    typeof pack.source === "string" &&
    typeof pack.importedAt === "number" &&
    Array.isArray(pack.catalog?.words)
  );
}

/** Give a stored pack its id: packs saved before ids existed use their catalog revision. */
function withId(pack: CustomPack): CustomPack {
  return pack.id ? pack : { ...pack, id: pack.catalog.revision };
}

let libraryCache: { raw: string | null; library: PackLibrary } | null = null;

/** The library as stored, migrating the single-pack key the first time. Browser-only. */
export function readPackLibrary(): PackLibrary {
  if (typeof window === "undefined") return EMPTY;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(LIBRARY_KEY);
    if (raw === null) {
      const legacy = window.localStorage.getItem(LEGACY_KEY);
      if (legacy) {
        const pack: unknown = JSON.parse(legacy);
        if (isPack(pack)) {
          const migrated = withId(pack);
          storeLibrary({ packs: [migrated], active: migrated.id });
          raw = window.localStorage.getItem(LIBRARY_KEY);
        }
        window.localStorage.removeItem(LEGACY_KEY);
      }
    }
  } catch {
    return EMPTY;
  }
  if (libraryCache && libraryCache.raw === raw) return libraryCache.library;
  let library = EMPTY;
  try {
    const parsed = raw ? (JSON.parse(raw) as Partial<PackLibrary>) : null;
    const packs = Array.isArray(parsed?.packs) ? parsed.packs.filter(isPack).map(withId) : [];
    const active = packs.some((pack) => pack.id === parsed?.active) ? parsed!.active! : null;
    library = { packs, active };
  } catch {
    library = EMPTY;
  }
  libraryCache = { raw, library };
  return library;
}

function storeLibrary(library: PackLibrary): void {
  try {
    window.localStorage.setItem(LIBRARY_KEY, JSON.stringify(library));
  } catch {
    throw new Error("Trình duyệt không đủ chỗ lưu gói này. Hãy xóa bớt gói cũ rồi thử lại.");
  }
}

/** Write the library and tell listeners; the feed hears about it only if the active pack moved. */
function commit(next: PackLibrary, previousActive: string | null): void {
  storeLibrary(next);
  window.dispatchEvent(new Event(CUSTOM_PACKS_EVENT));
  if (next.active !== previousActive) window.dispatchEvent(new Event(CUSTOM_PACK_EVENT));
}

let activeCache: { pack: CustomPack; ready: CustomPack } | null = null;

/** @returns The active imported pack, ready to page (word joiners applied), or null. Browser-only. */
export function readCustomPack(): CustomPack | null {
  const library = readPackLibrary();
  const pack = library.packs.find((entry) => entry.id === library.active);
  if (!pack) return null;
  if (activeCache?.pack !== pack) {
    activeCache = { pack, ready: { ...pack, catalog: withWordJoiners(pack.catalog) } };
  }
  return activeCache.ready;
}

/**
 * Keep a pack in the library without playing it. Importing the same content again moves it
 * to the top instead of keeping a second copy.
 * @returns The stored pack
 */
export function addCustomPack(pack: CustomPack): CustomPack {
  const library = readPackLibrary();
  const stored = withId(pack);
  commit(
    {
      packs: [stored, ...library.packs.filter((entry) => entry.id !== stored.id)],
      active: library.active,
    },
    library.active,
  );
  return stored;
}

/** Play a kept pack, or return the feed to the built-in deck with null. */
export function activateCustomPack(id: string | null): void {
  const library = readPackLibrary();
  const active = id && library.packs.some((pack) => pack.id === id) ? id : null;
  if (active === library.active) return;
  commit({ ...library, active }, library.active);
}

/** Keep a pack and make it the active feed source. */
export function writeCustomPack(pack: CustomPack): void {
  activateCustomPack(addCustomPack(pack).id);
}

/** Return the feed to the built-in deck; the pack stays in the library. */
export function clearCustomPack(): void {
  activateCustomPack(null);
}

/** Delete a pack from this browser, stopping it first if it is the one playing. */
export function removeCustomPack(id: string): void {
  const library = readPackLibrary();
  commit(
    {
      packs: library.packs.filter((pack) => pack.id !== id),
      active: library.active === id ? null : library.active,
    },
    library.active,
  );
}

/** @returns Words per level in a pack, in the catalog's level order; unlevelled words under "". */
export function packLevelCounts(pack: CustomPack): { level: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const word of pack.catalog.words) {
    const level = word.level ?? "";
    counts.set(level, (counts.get(level) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)))
    .map(([level, count]) => ({ level, count }));
}

/** Page the active pack locally, or null when none is active. */
export function readCustomPage(input: FeedRequest): FeedPage | null {
  const pack = readCustomPack();
  return pack ? readCatalogPage(pack.catalog, input) : null;
}
