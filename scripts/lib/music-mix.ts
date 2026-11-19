/**
 * Songs under a post's video. The rendered clips carry a silent audio track, so a Facebook
 * Reel or a YouTube Short goes out mute unless a song is laid in before upload: neither API
 * takes music of its own (Instagram's Audio API does, but Instagram posts carousels here).
 * Each platform has its own library (SOUNDS_DIRS), because the licences differ: Meta's Sound
 * Collection tracks are for Meta's apps only, YouTube's Audio Library tracks for YouTube.
 * This module lists a library and mixes one track into a copy of the clip, leaving the clip
 * itself as rendered.
 *
 * The mix copies the video stream untouched and replaces the audio with the song from
 * `startSec`, looped if it is shorter than the clip, faded in and out, and levelled to
 * -14 LUFS (where Facebook and Instagram play Reels). It is written to a temporary file and
 * renamed, so a half-written mix is never published.
 *
 * Sound Collection hands its tracks out as audio-only .mp4 files, so .mp4 counts as a song.
 *
 * Exports: SOUNDS_DIR, SOUNDS_DIRS, SONG_EXTENSIONS, listSongs, songTitle, mediaDuration, mixArgs, mixSong
 * Depends on: ffmpeg and ffprobe on the PATH
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, renameSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { extname, join } from "node:path";

/** Each platform's library, unless the calendar names another folder (soundsDirFor). */
export const SOUNDS_DIRS = {
  /** Meta's Sound Collection. */
  facebook: "~/KineMedia-tiktok/sounds",
  /** YouTube Studio's Audio Library. */
  youtube: "~/KineMedia-tiktok/sounds-youtube",
} as const;
/** Facebook's library, the default for a call that names none. */
export const SOUNDS_DIR = SOUNDS_DIRS.facebook;
export const SONG_EXTENSIONS = [".mp3", ".mp4", ".m4a", ".aac", ".wav", ".ogg", ".flac"];
/** Seconds of fade at the song's start and end. */
const FADE_IN = 0.3;
const FADE_OUT = 2.5;

const expandHome = (path: string) =>
  path.startsWith("~/") ? join(homedir(), path.slice(2)) : path;

/** The track file names in the sounds folder, sorted; none when the folder is missing. */
export function listSongs(dir: string = SOUNDS_DIR): string[] {
  const folder = expandHome(dir);
  if (!existsSync(folder)) return [];
  return readdirSync(folder)
    .filter((f) => !f.startsWith(".") && SONG_EXTENSIONS.includes(extname(f).toLowerCase()))
    .sort((a, b) => a.localeCompare(b));
}

/** A track's name to show: its file name without the extension. @pure true */
export function songTitle(file: string): string {
  return file.slice(0, file.length - extname(file).length);
}

/** A media file's length in seconds, or null when ffprobe cannot read it. */
export function mediaDuration(file: string): number | null {
  const probe = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      file,
    ],
    { encoding: "utf8" },
  );
  const seconds = Number(probe.stdout.trim());
  return probe.status === 0 && seconds > 0 ? seconds : null;
}

/**
 * ffmpeg's arguments for one mix.
 * @param input.durationSec - the clip's length: the song is cut to it and fades out before it
 * @pure true
 */
export function mixArgs(input: {
  clip: string;
  song: string;
  startSec: number;
  durationSec: number;
  out: string;
  /** Loop the song to cover the clip; off for a streamed song, which cannot be looped. */
  loop?: boolean;
}): string[] {
  const { clip, song, startSec, durationSec, out } = input;
  const loop = input.loop ?? true;
  const fadeOutAt = Math.max(0, durationSec - FADE_OUT).toFixed(2);
  return [
    "-y",
    "-v",
    "error",
    "-i",
    clip,
    // Loop the song from its start, so a short track still covers the clip.
    ...(loop ? ["-stream_loop", "-1"] : []),
    "-ss",
    String(Math.max(0, startSec)),
    "-i",
    song,
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-c:v",
    "copy",
    "-af",
    `loudnorm=I=-14:TP=-1.5:LRA=11,afade=t=in:st=0:d=${FADE_IN},afade=t=out:st=${fadeOutAt}:d=${FADE_OUT}`,
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-ar",
    "48000",
    "-t",
    durationSec.toFixed(3),
    "-movflags",
    "+faststart",
    "-f",
    "mp4",
    out,
  ];
}

/**
 * Mix a song into a copy of a clip: a file from the sounds folder, or a track read straight
 * from its address (`source`, an Openverse track: nothing is stored but the mix).
 * @param input.clip - the rendered clip (absolute path)
 * @param input.song - the track's file name in `soundsDir`, or its calendar name with `source`
 * @param input.source - the song's address, read by ffmpeg instead of a sounds-folder file
 * @param input.out - where the mixed video goes (absolute path); replaced when there
 * @throws When the clip or the song is missing or ffmpeg fails
 */
export function mixSong(input: {
  clip: string;
  song: string;
  startSec: number;
  out: string;
  soundsDir?: string;
  source?: string;
}): void {
  const streamed = !!input.source;
  const song = input.source ?? join(expandHome(input.soundsDir ?? SOUNDS_DIR), input.song);
  if (!existsSync(input.clip)) throw new Error(`no clip at ${input.clip}`);
  if (!streamed && !existsSync(song))
    throw new Error(`no song “${input.song}” in ${input.soundsDir ?? SOUNDS_DIR}`);
  const durationSec = mediaDuration(input.clip);
  if (!durationSec) throw new Error(`ffprobe cannot read ${input.clip}`);
  const songLength = streamed ? null : mediaDuration(song);
  if (songLength && input.startSec >= songLength) {
    throw new Error(`“${input.song}” is ${Math.floor(songLength)}s long; start before that`);
  }
  const partial = `${input.out}.partial`;
  const run = spawnSync(
    "ffmpeg",
    mixArgs({ clip: input.clip, song, startSec: input.startSec, durationSec, out: partial, loop: !streamed }),
    {
      encoding: "utf8",
    },
  );
  if (run.status !== 0) {
    rmSync(partial, { force: true });
    throw new Error(
      `ffmpeg could not mix “${input.song}”: ${(run.stderr || run.error?.message || "").trim().split("\n").pop()}`,
    );
  }
  renameSync(partial, input.out);
}
