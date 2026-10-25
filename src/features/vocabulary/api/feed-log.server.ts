/**
 * Appends the feed's diagnostic log (lib/feed-log) to logs/feed-<date>.ndjson, one JSON
 * object per line, each carrying its session id. Development only — the route checks.
 *
 * Exports: appendFeedLog
 * Depends on: node:fs/promises, node:path
 */

import { appendFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const LOG_DIR = resolve(process.cwd(), "logs");
/** One batch is a couple of seconds of events; anything larger is not from the feed. */
const MAX_BODY = 512 * 1024;
const MAX_ENTRIES = 500;

/** @param request - POST { session, entries[] } @returns 204, or 400 for a malformed batch */
export async function appendFeedLog(request: Request): Promise<Response> {
  const text = await request.text();
  if (text.length > MAX_BODY) return new Response("Too large", { status: 413 });
  let batch: { session?: unknown; entries?: unknown };
  try {
    batch = JSON.parse(text) as typeof batch;
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }
  if (typeof batch.session !== "string" || !Array.isArray(batch.entries)) {
    return new Response("Bad batch", { status: 400 });
  }
  const session = batch.session.slice(0, 80);
  const lines = batch.entries
    .slice(0, MAX_ENTRIES)
    .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object")
    .map((entry) => JSON.stringify({ session, ...entry }))
    .join("\n");
  if (!lines) return new Response(null, { status: 204 });
  // The machine's own calendar day, so a session logged late in the evening is filed under
  // the day it was run, not the UTC one.
  const day = new Date().toLocaleDateString("sv-SE");
  await mkdir(LOG_DIR, { recursive: true });
  await appendFile(resolve(LOG_DIR, `feed-${day}.ndjson`), `${lines}\n`, "utf8");
  return new Response(null, { status: 204 });
}
