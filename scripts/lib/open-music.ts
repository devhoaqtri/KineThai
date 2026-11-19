/**
 * Songs for YouTube Shorts picked from Openverse (api.openverse.org) when a post needs one,
 * so no library has to be downloaded first. The track is never stored: ffmpeg reads it
 * straight from its address while mixing (music-mix.ts mixSong `source`), and only the mixed
 * clip is written.
 *
 * Why Openverse: YouTube's API cannot attach Audio Library music to an upload, and Audio
 * Library tracks have no public address; Meta's Sound Collection is licensed for Meta's apps
 * only. Openverse indexes openly licensed audio (mostly Jamendo), needs no key, and says each
 * track's licence. Only CC BY and CC0 are asked for: both allow setting the music to a video
 * on any platform; CC BY needs the credit line (creditLine), which captionForPlatform appends
 * to the YouTube description. Openverse has had no CC0 music, so in practice every pick is
 * CC BY and is credited.
 *
 * Exports: OpenTrack, OPEN_MUSIC_QUERIES, OPEN_SONG_PREFIX, isOpenSong, openSongId,
 *   searchOpenTracks, pickOpenTrack, creditLine
 */

/** A track Openverse lists, reduced to what a mix and its credit need. */
export type OpenTrack = {
  /** Openverse's id for the track. */
  id: string;
  title: string;
  creator: string;
  /** `by` or `cc0`. */
  license: string;
  durationSec: number;
  /** The audio file itself, read by ffmpeg. */
  audioUrl: string;
  /** The track's own page at its source (Jamendo, …). */
  landingUrl: string;
  /** Openverse's attribution sentence: title, creator, licence and its address. */
  attribution: string;
};

/** Searches tried in turn by post number, so neighbouring posts draw from different moods. */
export const OPEN_MUSIC_QUERIES = [
  "upbeat",
  "happy",
  "cheerful",
  "acoustic",
  "positive",
  "playful",
  "bright",
  "energetic",
] as const;

/** How a calendar song names an Openverse track (a sounds-folder song is a file name). */
export const OPEN_SONG_PREFIX = "openverse:";
/** Whether a calendar song is an Openverse track. @pure true */
export const isOpenSong = (song: string | null | undefined): song is string =>
  !!song && song.startsWith(OPEN_SONG_PREFIX);
/** The calendar song for an Openverse track. @pure true */
export const openSongId = (track: Pick<OpenTrack, "id">) => `${OPEN_SONG_PREFIX}${track.id}`;

const API = "https://api.openverse.org/v1/audio/";

type ApiResult = {
  id?: string;
  title?: string;
  creator?: string;
  license?: string;
  duration?: number | null;
  url?: string;
  foreign_landing_url?: string;
  attribution?: string;
  mature?: boolean;
};

/**
 * Openly licensed music for one search, CC BY or CC0 only.
 * @throws When Openverse cannot be reached or answers with an error
 */
// Openverse refuses (401) a page over 20 results from a caller without an API key.
export async function searchOpenTracks(query: string, pageSize = 20): Promise<OpenTrack[]> {
  const params = new URLSearchParams({
    q: query,
    license: "by,cc0",
    category: "music",
    mature: "false",
    page_size: String(pageSize),
  });
  const response = await fetch(`${API}?${params}`, {
    headers: { "User-Agent": "music-picker/1.0" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Openverse answered ${response.status} for “${query}”`);
  const body = (await response.json()) as { results?: ApiResult[] };
  return (body.results ?? []).flatMap((r) => {
    if (!r.id || !r.url || !r.title || !r.attribution || r.mature) return [];
    if (r.license !== "by" && r.license !== "cc0") return [];
    if (!r.duration || r.duration <= 0) return [];
    return [
      {
        id: r.id,
        title: r.title.trim(),
        creator: (r.creator ?? "").trim(),
        license: r.license,
        durationSec: r.duration / 1000,
        audioUrl: r.url,
        landingUrl: r.foreign_landing_url ?? r.url,
        attribution: r.attribution.trim(),
      },
    ];
  });
}

/**
 * One track for a post: long enough to cover the clip without looping (a streamed song
 * cannot be looped), at most 8 minutes, never one used before, chosen by post number so a
 * second run picks the same one.
 * @returns The track, or undefined when none fits
 * @pure true
 */
export function pickOpenTrack(
  tracks: OpenTrack[],
  input: { clipSec: number; usedIds: ReadonlySet<string>; dayNumber: number },
): OpenTrack | undefined {
  const fits = tracks
    .filter((t) => !input.usedIds.has(openSongId(t)))
    .filter((t) => t.durationSec >= input.clipSec + 3 && t.durationSec <= 8 * 60)
    .sort((a, b) => a.id.localeCompare(b.id));
  if (!fits.length) return undefined;
  return fits[(input.dayNumber * 7919) % fits.length];
}

/** The line a CC BY track needs under the video, with where it was found. @pure true */
export function creditLine(track: Pick<OpenTrack, "attribution" | "landingUrl">): string {
  return `🎵 ${track.attribution} Nguồn: ${track.landingUrl}`;
}
