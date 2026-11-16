/**
 * The upbeat-song choice for TikTok drafts: which search to run and which tracks are too
 * recent to use again. Pure, so the rotation is testable; scripts/post-to-tiktok.ts does
 * the tapping and keeps the ledger at scripts/data/tiktok-sounds.json.
 *
 * TikTok's sound search shows a list of tracks whose titles are drawn, not exposed to
 * uiautomator, so a track's name is only known once it is picked (the sheet and the
 * editor's top bar name it). The rotation therefore moves through queries and result rows,
 * and a pick that turns out to be recent is put back and the next row tried.
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

/** How many of the latest drafted songs a new draft must not repeat. */
export const RECENT_WINDOW = 20;

export interface SoundUse {
  /** The track's title as TikTok names it. */
  title: string;
  /** The search that found it. */
  query: string;
  /** Which result row it was (0 = top). */
  row: number;
  /** ISO time of the run. */
  at: string;
  /** The clip it went on (file name). */
  clip: string;
  /** False for a --no-draft run, which does not count towards the rotation or repeats. */
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

/**
 * The search and starting row for the next draft: queries rotate one per draft, and each
 * query's starting row moves down one every time that query comes round again.
 * @param ledger - songs used so far
 * @param forced - a query given with --sound, used as is
 */
export function nextSoundPick(ledger: SoundLedger, forced?: string): { query: string; row: number } {
  const drafted = ledger.used.filter((u) => u.drafted);
  const query = forced?.trim() || UPBEAT_QUERIES[drafted.length % UPBEAT_QUERIES.length]!;
  const row = drafted.filter((u) => u.query === query).length;
  return { query, row };
}

/**
 * Whether a track went on one of the last RECENT_WINDOW drafts.
 * @param ledger - songs used so far
 * @param title - the picked track's title
 */
export function isRecentSound(ledger: SoundLedger, title: string): boolean {
  const key = title.trim().toLowerCase();
  return ledger.used
    .filter((u) => u.drafted)
    .slice(-RECENT_WINDOW)
    .some((u) => u.title.trim().toLowerCase() === key);
}
