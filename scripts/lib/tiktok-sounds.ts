/**
 * The upbeat-song choice for TikTok drafts: which searches and result rows to try, and
 * which tracks are already taken. Pure, so the order is testable; scripts/post-to-tiktok.ts
 * does the tapping and keeps the ledger at scripts/data/tiktok-sounds.json.
 *
 * No track is used twice: every song that went on a draft is in the ledger (title and
 * artist, with the post's day, share code and date), and a pick that matches one is put
 * back for the next candidate. A repeat happens only when every candidate is taken, and the
 * poster says so.
 *
 * TikTok's sound search draws its result titles rather than exposing them to uiautomator,
 * so a track's name is only known once it is picked (the sheet then names it and its
 * artist). The candidates are therefore positions: a search and a result row.
 *
 * Depends on: node:fs
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

/** Searches that come back upbeat in TikTok's (commercial) sound library. */
export const UPBEAT_QUERIES = [
  "upbeat",
  "happy upbeat",
  "upbeat pop",
  "feel good",
  "upbeat funk",
  "energetic",
  "happy ukulele",
  "positive vibes",
] as const;

/** Result rows a search shows on screen at once (no scrolling) on the TikTokPoster AVD. */
export const ROWS_PER_QUERY = 5;

/** Picks to try before giving up on a fresh track; each costs a search, about 6 s. */
export const MAX_PICKS = 12;

export interface SoundUse {
  /** The track's title as TikTok names it. */
  title: string;
  /** Its artist, as the sound sheet names it. */
  artist: string;
  /** The search that found it. */
  query: string;
  /** Which result row it was (0 = top). */
  row: number;
  /** The calendar day it went on, when the poster was told (tiktok.ts passes it). */
  day: number | null;
  /** The word's share code. */
  code: string | null;
  /** ISO time of the run. */
  at: string;
  /** The clip it went on (file name). */
  clip: string;
  /** False for a --no-draft run, which takes no track and moves no rotation. */
  drafted: boolean;
}

export interface SoundLedger {
  used: SoundUse[];
}

/**
 * The ledger on disk, or an empty one.
 * @param file - path to the JSON ledger
 */
export function loadSoundLedger(file: string): SoundLedger {
  if (!existsSync(file)) return { used: [] };
  const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<SoundLedger>;
  return { used: Array.isArray(parsed.used) ? parsed.used : [] };
}

/**
 * Append one use and write the ledger back.
 * @param file - path to the JSON ledger
 * @param use - the song just put on a clip
 */
export function recordSoundUse(file: string, use: SoundUse): void {
  const ledger = loadSoundLedger(file);
  ledger.used.push(use);
  writeFileSync(file, `${JSON.stringify(ledger, null, 2)}\n`);
}

const key = (title: string, artist: string) =>
  `${title.normalize("NFC").trim().toLowerCase()}\u0000${artist.normalize("NFC").trim().toLowerCase()}`;

/**
 * Whether a track already went on a draft (title and artist, case-blind; --no-draft runs
 * do not count).
 * @param ledger - songs used so far
 * @param title - the picked track's title
 * @param artist - its artist
 */
export function isUsedSound(ledger: SoundLedger, title: string, artist: string): boolean {
  const wanted = key(title, artist);
  // An artist the sheet did not show (read back empty) cannot tell two tracks apart, so
  // the title alone decides; a used “Upbeat Funk” once went on a second draft this way.
  const titleOnly = title.normalize("NFC").trim().toLowerCase();
  return ledger.used.some(
    (u) =>
      u.drafted &&
      (artist.trim()
        ? key(u.title, u.artist ?? "") === wanted
        : u.title.normalize("NFC").trim().toLowerCase() === titleOnly),
  );
}

/**
 * The positions to try, in order, at most MAX_PICKS. The first search rotates one step per
 * draft so neighbouring posts lean on different searches, and each search starts below the
 * rows it has already given, then walks its remaining rows before the next search.
 * @param ledger - songs used so far
 * @param forced - a query given with --sound: only that search is walked
 */
export function soundCandidates(ledger: SoundLedger, forced?: string): { query: string; row: number }[] {
  const drafted = ledger.used.filter((u) => u.drafted);
  const queries = forced?.trim()
    ? [forced.trim()]
    : UPBEAT_QUERIES.map((_, i) => UPBEAT_QUERIES[(drafted.length + i) % UPBEAT_QUERIES.length]!);
  const out: { query: string; row: number }[] = [];
  for (const query of queries) {
    const start = drafted.filter((u) => u.query === query).length;
    for (let i = 0; i < ROWS_PER_QUERY && out.length < MAX_PICKS; i += 1) {
      out.push({ query, row: (start + i) % ROWS_PER_QUERY });
    }
  }
  return out;
}
