/**
 * One frame of a clip as a JPEG: the cover a platform shows before the video plays. The
 * clips open on an empty gradient (the hook text enters a beat later), so a platform left to
 * pick its own cover shows a blank wash; every publisher sets this frame instead, taken at
 * the clip's letter hint (tiktok.ts coverMsOf), the same moment TikTok's cover uses.
 *
 * Exports: extractFrameJpeg
 * Depends on: ffmpeg on the PATH
 */
import { spawnSync } from "node:child_process";

/**
 * @param file - the clip
 * @param coverMs - how far into it, in milliseconds
 * @returns The frame as JPEG bytes, full size
 * @throws When ffmpeg cannot read a frame there
 */
export function extractFrameJpeg(file: string, coverMs: number): Buffer {
  const sec = Math.max(0, coverMs / 1000).toFixed(3);
  const run = spawnSync(
    "ffmpeg",
    ["-y", "-ss", sec, "-i", file, "-frames:v", "1", "-q:v", "2", "-f", "image2pipe", "-vcodec", "mjpeg", "pipe:1"],
    { maxBuffer: 10 * 1024 * 1024 },
  );
  if (run.status !== 0 || !run.stdout?.length) {
    throw new Error(`ffmpeg could not extract cover frame at ${sec}s from ${file}`);
  }
  return run.stdout;
}
