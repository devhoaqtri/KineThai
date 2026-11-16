/**
 * Record the TikTok lab's clip to an MP4 on the admin's own machine, for the lab's Export
 * button.
 *
 * The lab shows the upload live; scripts/render-export-clip.ts (showcase mode, --frame 4x5)
 * records the same page on a slowed clock for frame-exact motion, about four minutes a
 * word, into exports/tiktok. That is
 * too long to hold a request open, so a POST starts the recording in the background and a
 * GET asks how it is going. The route that calls this answers 404 in a production build,
 * and the build fails if this module reaches one.
 *
 * Exports: tiktokClipResponse
 * Depends on: zod, scripts/render-export-clip.ts, the machine's `npx` and `open` (macOS)
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { z } from "zod";
import { BADGE_ROTATION } from "../lib/badge-variants";
import { isShareCode, normalizeShareCode } from "../lib/share-code";

const EXPORT_ROOT = resolve("exports/tiktok");

type Job = { status: "recording" | "done" | "failed"; out: string; log: string[] };
/** Recordings started from this dev server, by output file. */
const jobs = new Map<string, Job>();

const renderSchema = z.object({
  code: z.string().max(12),
  look: z.enum(BADGE_ROTATION as unknown as [string, ...string[]]),
  fadeFrom: z.number().min(0).max(100),
  fadeTo: z.number().min(0).max(160),
});

/**
 * Handle one lab request: POST starts a recording, GET ?out=… reports on one, and
 * GET ?open=… shows a finished file in Finder.
 * @param request - from the lab page
 * @returns A small JSON reply
 */
export async function tiktokClipResponse(request: Request): Promise<Response> {
  // A page on another site can reach localhost; only the lab itself may start Chrome.
  if (request.headers.get("sec-fetch-site") !== "same-origin") {
    return Response.json({ error: "Only the lab can ask for this." }, { status: 403 });
  }
  const url = new URL(request.url);

  if (request.method === "GET") {
    const opened = url.searchParams.get("open");
    if (opened) {
      const target = resolve(opened);
      if (!target.startsWith(EXPORT_ROOT + sep) || !existsSync(target)) {
        return Response.json({ opened: false });
      }
      spawn("open", ["-R", target], { stdio: "ignore", detached: true }).unref();
      return Response.json({ opened: true });
    }
    const job = jobs.get(url.searchParams.get("out") ?? "");
    if (!job) return Response.json({ error: "No such recording" }, { status: 404 });
    return Response.json({ status: job.status, out: job.out, log: job.log.slice(-6) });
  }

  const parsed = renderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const code = normalizeShareCode(parsed.data.code);
  if (!isShareCode(code)) return Response.json({ error: "Invalid code" }, { status: 400 });

  mkdirSync(EXPORT_ROOT, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const out = join(EXPORT_ROOT, `${code}-${parsed.data.look}-${stamp}.mp4`);
  const job: Job = { status: "recording", out, log: [] };
  jobs.set(out, job);
  const child = spawn(
    "npx",
    [
      "tsx",
      "scripts/render-export-clip.ts",
      code,
      "--mode",
      "showcase",
      "--frame",
      "4x5",
      "--base",
      url.origin,
      "--look",
      parsed.data.look,
      "--fade-from",
      String(parsed.data.fadeFrom),
      "--fade-to",
      String(parsed.data.fadeTo),
      "--out",
      out,
    ],
    { cwd: resolve("."), stdio: ["ignore", "pipe", "pipe"] },
  );
  const keep = (chunk: Buffer) => {
    for (const line of chunk.toString().split("\n")) if (line.trim()) job.log.push(line.trim());
    if (job.log.length > 200) job.log.splice(0, job.log.length - 200);
  };
  child.stdout.on("data", keep);
  child.stderr.on("data", keep);
  child.on("close", (exitCode) => {
    job.status = exitCode === 0 && existsSync(out) ? "done" : "failed";
  });
  return Response.json({ status: job.status, out });
}
