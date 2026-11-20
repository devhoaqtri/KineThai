/**
 * The /posting page's server side, on the admin's own machine: the post calendar read and
 * edited in place (scripts/data/tiktok-calendar.json), clips streamed for preview, and
 * publishing handed to the same command the scheduled job runs
 * (`npx tsx scripts/tiktok.ts publish <post> --platform …`), in the background, since a
 * Reel takes a minute or two to upload and process. A Facebook post's song (scripts/lib/
 * music-mix.ts) is mixed through `tiktok.ts music`, waited on, since it takes seconds; accepting
 * it publishes at once a post whose time has passed. The route that calls this answers 404
 * in a production build, and the build fails if this module reaches one.
 *
 * Exports: postingResponse
 * Depends on: zod, scripts/lib/tiktok-calendar, scripts/lib/meta-publish, scripts/lib/music-mix,
 * the machine's `npx`
 */
import { spawn, spawnSync } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, openSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { Readable } from "node:stream";
import { z } from "zod";
import { updateJsonFile } from "../../../../scripts/lib/locked-file";
import { loadMetaConfig, metaReady } from "../../../../scripts/lib/meta-publish";
import { SOUNDS_DIRS, listSongs } from "../../../../scripts/lib/music-mix";
import {
  MUSIC_PLATFORMS,
  PUBLISH_PLATFORMS,
  dateOfDay,
  mixedClipPath,
  postsToPublish,
  soundsDirFor,
  todayInVietnam,
  type Calendar,
  type CalendarDay,
  type PublishPlatform,
} from "../../../../scripts/lib/tiktok-calendar";
import { loadYouTubeConfig, youtubeReady } from "../../../../scripts/lib/youtube-publish";
import { loadThreadsConfig, threadsReady } from "../../../../scripts/lib/threads-publish";

const ROOT = resolve(".");
const CALENDAR_FILE = join(ROOT, "scripts/data/tiktok-calendar.json");
const LOG_DIR = join(ROOT, "logs/tiktok-auto");

const expandHome = (path: string) => (path.startsWith("~/") ? join(homedir(), path.slice(2)) : path);
const loadCalendar = () => JSON.parse(readFileSync(CALENDAR_FILE, "utf8")) as Calendar;
/**
 * Change one post on the calendar as it is now, under the lock the posting jobs take too
 * (scripts/lib/locked-file.ts), so a page edit and a job's record never undo each other.
 * Nothing is saved when `change` returns false.
 */
const updatePost = <R>(dayNumber: number, change: (day: CalendarDay) => R): R =>
  updateJsonFile(
    CALENDAR_FILE,
    loadCalendar,
    (calendar: Calendar) => `${JSON.stringify(calendar, null, 2)}\n`,
    (calendar) => {
      const day = calendar.days.find((d) => d.day === dayNumber);
      if (!day) throw new Error(`There is no post ${dayNumber}.`);
      return change(day);
    },
  );

const platformSchema = z.enum(PUBLISH_PLATFORMS);
const musicPlatformSchema = z.enum(MUSIC_PLATFORMS);

/** What a platform still lacks before it can publish, or null when it is connected. */
const platformReady = (platform: PublishPlatform) => {
  if (platform === "youtube") return youtubeReady(loadYouTubeConfig(ROOT));
  if (platform === "threads") return threadsReady(loadThreadsConfig(ROOT), loadMetaConfig(ROOT));
  return metaReady(loadMetaConfig(ROOT), platform);
};
const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("caption"),
    day: z.number().int().positive(),
    /** Absent: the calendar's caption, used by every platform without its own. */
    platform: platformSchema.optional(),
    caption: z.string().max(2200),
  }),
  z.object({ action: z.literal("skip"), day: z.number().int().positive(), platform: platformSchema, skip: z.boolean() }),
  z.object({ action: z.literal("publish"), day: z.number().int().positive(), platform: platformSchema }),
  z.object({ action: z.literal("tiktok-posted"), day: z.number().int().positive(), url: z.string().url().max(500) }),
  z.object({
    action: z.literal("song"),
    day: z.number().int().positive(),
    platform: musicPlatformSchema,
    /** A file in the sounds folder, or null for no music. */
    song: z.string().min(1).max(300).nullable(),
    startSec: z.number().min(0).max(3600),
  }),
  z.object({ action: z.literal("song-accept"), day: z.number().int().positive(), platform: musicPlatformSchema }),
]);

/** What the page lists: from a week back to three weeks ahead, by post. */
function listing() {
  const calendar = loadCalendar();
  const today = todayInVietnam(Date.now());
  const from = dateOfDay(today, -6);
  const to = dateOfDay(today, 22);
  const libraries = Object.fromEntries(
    MUSIC_PLATFORMS.map((p) => {
      const dir = soundsDirFor(calendar, p, SOUNDS_DIRS);
      return [p, { dir, songs: listSongs(dir) }];
    }),
  );
  return {
    today,
    libraries,
    connection: Object.fromEntries(PUBLISH_PLATFORMS.map((p) => [p, platformReady(p)])),
    posts: calendar.days
      .filter((d) => d.date >= from && d.date <= to)
      .map((d) => ({
        day: d.day,
        date: d.date,
        time: d.time ?? calendar.postTime,
        word: d.word,
        code: d.code,
        level: d.level,
        status: d.status,
        url: d.url,
        caption: d.caption,
        hasClip: !!d.clip && existsSync(expandHome(d.clip)),
        mixes: Object.fromEntries(
          MUSIC_PLATFORMS.map((p) => [p, !!d.clip && existsSync(mixedClipPath(expandHome(d.clip), p))]),
        ),
        durationSec: d.durationSec,
        platforms: d.platforms ?? {},
      })),
  };
}

/** The clip itself (or its mix with a song), with byte ranges so the page's player can seek. */
function clipResponse(request: Request, day: CalendarDay | undefined, mix: PublishPlatform | null): Response {
  const clip = day?.clip ? expandHome(day.clip) : null;
  const file = clip && mix ? mixedClipPath(clip, mix) : clip;
  if (!file || !existsSync(file)) return new Response("No clip", { status: 404 });
  const size = statSync(file).size;
  const range = /bytes=(\d*)-(\d*)/.exec(request.headers.get("range") ?? "");
  const start = range?.[1] ? Number(range[1]) : 0;
  const end = range?.[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
  const body = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream;
  return new Response(body, {
    status: range ? 206 : 200,
    headers: {
      "content-type": "video/mp4",
      "accept-ranges": "bytes",
      "content-length": String(end - start + 1),
      ...(range ? { "content-range": `bytes ${start}-${end}/${size}` } : {}),
    },
  });
}

/** Start `tiktok.ts publish` for one post and platform, logging beside the scheduled runs. */
function startPublish(day: number, platform: string) {
  mkdirSync(LOG_DIR, { recursive: true });
  const log = openSync(join(LOG_DIR, `${todayInVietnam(Date.now())}-publish-manual.log`), "a");
  spawn("npx", ["tsx", join(ROOT, "scripts/tiktok.ts"), "publish", String(day), "--platform", platform], {
    cwd: ROOT,
    detached: true,
    stdio: ["ignore", log, log],
  }).unref();
}

/**
 * Handle one /posting request: GET lists posts (or streams `?clip=<post>`), POST applies
 * one action.
 */
export async function postingResponse(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "GET") {
    const clip = url.searchParams.get("clip");
    if (clip) {
      const mix = musicPlatformSchema.safeParse(url.searchParams.get("mix"));
      return clipResponse(request, loadCalendar().days.find((d) => d.day === Number(clip)), mix.success ? mix.data : null);
    }
    return Response.json(listing());
  }
  // A page on another site can reach localhost; only the posting page may change anything.
  if (request.headers.get("sec-fetch-site") !== "same-origin") {
    return Response.json({ error: "Only the posting page can ask for this." }, { status: 403 });
  }
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Bad request" }, { status: 400 });
  const action = parsed.data;
  const calendar = loadCalendar();
  const day = calendar.days.find((d) => d.day === action.day);
  if (!day) return Response.json({ error: `There is no post ${action.day}.` }, { status: 404 });

  if (action.action === "publish") {
    const missing = platformReady(action.platform);
    if (missing) return Response.json({ error: missing }, { status: 409 });
    if (!day.clip) return Response.json({ error: "This post has no clip yet." }, { status: 409 });
    if (day.platforms?.[action.platform]?.status === "posted") {
      return Response.json({ error: "Already posted there." }, { status: 409 });
    }
    if (day.platforms?.[action.platform]?.music?.status === "proposed") {
      return Response.json({ error: "Accept the song first (or choose no music)." }, { status: 409 });
    }
    startPublish(day.day, action.platform);
    return Response.json({ ok: true });
  }
  if (action.action === "song") {
    // The CLI owns the mix and the proposal, so the page and the morning job agree.
    const run = spawnSync(
      "npx",
      [
        "tsx",
        join(ROOT, "scripts/tiktok.ts"),
        "music",
        String(day.day),
        "--platform",
        action.platform,
        "--song",
        action.song ?? "none",
        "--start",
        String(action.startSec),
      ],
      { cwd: ROOT, encoding: "utf8", timeout: 120_000 },
    );
    if (run.status !== 0) {
      const reason = /✗ (.*)/.exec(run.stderr)?.[1] ?? (run.stderr.trim() || "the mix did not finish");
      return Response.json({ error: reason }, { status: 409 });
    }
    return Response.json({ ok: true });
  }
  if (action.action === "song-accept") {
    const accepted = updatePost(day.day, (fresh) => {
      const track = fresh.platforms?.[action.platform];
      if (!track?.music) return false;
      track.music = { ...track.music, status: "accepted", at: new Date().toISOString() };
      return true;
    });
    if (!accepted) return Response.json({ error: "This post has no song to accept." }, { status: 409 });
    // Its time has passed while it waited: out it goes now, as the job would have sent it.
    const late = postsToPublish(loadCalendar(), Date.now(), action.platform).some((d) => d.day === day.day);
    if (late && !platformReady(action.platform)) startPublish(day.day, action.platform);
    return Response.json({ ok: true, publishing: late });
  }
  let refusal: string | null = null;
  updatePost(day.day, (day) => {
    if (action.action === "caption") {
      if (action.platform) {
        day.platforms ??= {};
        const track = (day.platforms[action.platform] ??= { status: "pending" });
        track.caption = action.caption.trim() && action.caption.trim() !== day.caption.trim() ? action.caption : null;
      } else {
        day.caption = action.caption;
      }
    } else if (action.action === "skip") {
      const status = day.platforms?.[action.platform]?.status;
      if (status === "posted" || status === "publishing") {
        refusal = `It is ${status} there.`;
        return false;
      }
      day.platforms ??= {};
      const track = (day.platforms[action.platform] ??= { status: "pending" });
      track.status = action.skip ? "skipped" : "pending";
      if (!action.skip) track.attempts = 0;
    } else if (action.action === "tiktok-posted") {
      day.status = "posted";
      day.postedAt = new Date().toISOString();
      day.url = action.url;
    }
    return true;
  });
  if (refusal) return Response.json({ error: refusal }, { status: 409 });
  return Response.json({ ok: true });
}
