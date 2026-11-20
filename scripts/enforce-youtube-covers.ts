/**
 * Enforce the hint-page cover thumbnail on posted YouTube Shorts in scripts/data/tiktok-calendar.json.
 *
 * Uses each clip's `<clip>.meta.json` `hintFraction` (falling back to 0.38 of duration if
 * an older clip has no `hintFraction`), extracts that frame as a high-quality JPEG, and
 * uploads it via YouTube Data API v3 `thumbnails.set`.
 *
 * Usage:
 *   npx tsx scripts/enforce-youtube-covers.ts              # all posted YouTube Shorts
 *   npx tsx scripts/enforce-youtube-covers.ts --day 15     # only post 15
 *   npx tsx scripts/enforce-youtube-covers.ts --dry-run    # preview without network calls
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadYouTubeConfig, setShortThumbnail } from "./lib/youtube-publish";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CALENDAR_PATH = join(ROOT, "scripts/data/tiktok-calendar.json");

const argv = process.argv.slice(2);
function flag(name: string): string | undefined {
  const at = argv.indexOf(`--${name}`);
  return at !== -1 ? argv[at + 1] : undefined;
}
const onlyDay = flag("day") ? Number(flag("day")) : null;
const dryRun = argv.includes("--dry-run");
const fallbackFraction = flag("fraction") ? Number(flag("fraction")) : 0.38;

function expandHome(p: string): string {
  return p.startsWith("~/") ? join(homedir(), p.slice(2)) : p;
}

function probeDurationSec(file: string): number | null {
  const run = spawnSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file],
    { encoding: "utf8" },
  );
  const sec = Number(run.stdout?.trim());
  return Number.isFinite(sec) && sec > 0 ? sec : null;
}

interface CalendarDay {
  day: number;
  word: string;
  clip?: string | null;
  durationSec?: number | null;
  platforms?: {
    youtube?: {
      status?: string;
      id?: string;
      url?: string;
    };
  };
}

async function main() {
  const config = { ...loadYouTubeConfig(ROOT), ...(dryRun ? { dryRun: true } : {}) };
  const calendar = JSON.parse(readFileSync(CALENDAR_PATH, "utf8")) as { days: CalendarDay[] };
  const targets = calendar.days.filter(
    (d) =>
      d.platforms?.youtube?.status === "posted" &&
      d.platforms.youtube.id &&
      (onlyDay === null || d.day === onlyDay),
  );

  if (targets.length === 0) {
    console.log("No posted YouTube Shorts matched.");
    return;
  }

  let ok = 0;
  let failed = 0;

  for (const day of targets) {
    const videoId = day.platforms!.youtube!.id!;
    const rawClip = day.clip ? expandHome(day.clip) : null;
    if (!rawClip) {
      console.log(`! post ${day.day} (${day.word}): no clip path on calendar`);
      failed += 1;
      continue;
    }
    const ytClip = rawClip.replace(/\.mp4$/, ".youtube.mp4");
    const file = existsSync(ytClip) ? ytClip : rawClip;
    if (!existsSync(file)) {
      console.log(`! post ${day.day} (${day.word}): missing file ${file}`);
      failed += 1;
      continue;
    }

    const metaPath = `${rawClip}.meta.json`;
    let fraction: number | null = null;
    if (existsSync(metaPath)) {
      try {
        const meta = JSON.parse(readFileSync(metaPath, "utf8")) as { hintFraction?: number | null };
        if (typeof meta.hintFraction === "number" && Number.isFinite(meta.hintFraction)) {
          fraction = meta.hintFraction;
        }
      } catch {
        // ignore
      }
    }
    const usedFallback = fraction === null;
    const effectiveFraction = fraction ?? fallbackFraction;
    const durationSec = day.durationSec || probeDurationSec(file);
    if (!durationSec) {
      console.log(`! post ${day.day} (${day.word}): could not determine duration`);
      failed += 1;
      continue;
    }

    const coverMs = Math.round(effectiveFraction * durationSec * 1000);
    console.log(
      `→ post ${day.day} “${day.word}” (${videoId}) · ${(coverMs / 1000).toFixed(2)}s (${Math.round(effectiveFraction * 100)}%${usedFallback ? " fallback" : ""})`,
    );
    try {
      await setShortThumbnail({ config, videoId, file, coverMs });
      ok += 1;
    } catch (err) {
      console.error(`  ✗ ${err instanceof Error ? err.message : String(err)}`);
      failed += 1;
    }
  }

  console.log(`\nDone: ${ok} updated, ${failed} failed.`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(`\n✗ ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
