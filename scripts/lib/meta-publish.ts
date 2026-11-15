/**
 * Publish a clip as a Reel on the Facebook Page and on Instagram, through Meta's Graph API.
 *
 * Both platforms take the MP4 from this machine by resumable upload to rupload.facebook.com,
 * so a clip never has to be hosted anywhere public first:
 *
 *   Facebook  POST /{page}/video_reels (start) → upload the bytes → POST …(finish, PUBLISHED)
 *             → poll /{video} until it is ready → its permalink
 *   Instagram POST /{ig-user}/media (REELS, resumable) → upload the bytes → poll the container
 *             until FINISHED → POST /{ig-user}/media_publish → its permalink
 *
 * One Meta app in development mode covers both, since it only posts to accounts its admin
 * manages; no App Review. The Page token (from `npm run tiktok -- meta-setup`) never
 * expires and carries the Instagram permissions too. Credentials live in .env.local, which
 * git ignores, and are never printed.
 *
 * META_DRY_RUN=1 (or `dryRun`) runs every step but the network: what would be sent is logged,
 * ids come back as `dry-…`, and nothing on either platform changes.
 *
 * Exports: MetaConfig, loadMetaConfig, metaReady, publishReel, exchangeForPageToken,
 *   writeEnvLocal, ReelResult
 * Depends on: Node's fetch; the clip on disk
 */
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { MetaPlatform } from "./tiktok-calendar";

const GRAPH = "https://graph.facebook.com";
const RUPLOAD = "https://rupload.facebook.com";

export type MetaConfig = {
  version: string;
  pageId: string | null;
  pageToken: string | null;
  igUserId: string | null;
  appId: string | null;
  appSecret: string | null;
  userToken: string | null;
  dryRun: boolean;
};

/** KEY=VALUE lines of an env file (quotes stripped), or nothing when it is missing. */
function readEnvFile(file: string): Record<string, string> {
  if (!existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) out[match[1]!] = match[2]!.replace(/^(['"])(.*)\1$/, "$2");
  }
  return out;
}

/**
 * Meta settings from the process environment, then .env.local, then .env (first wins),
 * read fresh each call so a setup run is seen without a restart.
 * @param root - the repository root
 */
export function loadMetaConfig(root: string): MetaConfig {
  const files = { ...readEnvFile(join(root, ".env")), ...readEnvFile(join(root, ".env.local")) };
  const get = (key: string) => process.env[key] || files[key] || null;
  return {
    version: get("META_GRAPH_VERSION") ?? "v23.0",
    pageId: get("META_PAGE_ID"),
    pageToken: get("META_PAGE_TOKEN"),
    igUserId: get("META_IG_USER_ID"),
    appId: get("META_APP_ID"),
    appSecret: get("META_APP_SECRET"),
    userToken: get("META_USER_TOKEN"),
    dryRun: get("META_DRY_RUN") === "1",
  };
}

/** What a platform still lacks before it can publish, or null when it is ready. */
export function metaReady(config: MetaConfig, platform: MetaPlatform): string | null {
  if (!config.pageToken) return "no META_PAGE_TOKEN: run `npm run tiktok -- meta-setup`";
  if (platform === "facebook" && !config.pageId) return "no META_PAGE_ID";
  if (platform === "instagram" && !config.igUserId) {
    return "no META_IG_USER_ID: link an Instagram professional account to the Page, then rerun meta-setup";
  }
  return null;
}

export type ReelResult = { id: string; url: string | null };

type Log = (line: string) => void;

/** A Graph error's own message, which says what to fix far better than the status. */
async function graph<T>(
  config: MetaConfig,
  method: "GET" | "POST",
  path: string,
  params: Record<string, string>,
  log: Log,
): Promise<T> {
  const shown = Object.keys(params).filter((k) => k !== "access_token");
  if (config.dryRun) {
    log(`  [dry run] ${method} ${path} ${shown.join(",")}`);
    return {} as T;
  }
  const url = new URL(`${GRAPH}/${config.version}/${path}`);
  const body = new URLSearchParams(params);
  if (method === "GET") url.search = body.toString();
  const response = await fetch(url, {
    method,
    ...(method === "POST" ? { body } : {}),
    signal: AbortSignal.timeout(60_000),
  });
  const json = (await response.json().catch(() => ({}))) as T & { error?: { message?: string; code?: number } };
  if (!response.ok || json.error) {
    throw new Error(`Meta ${method} ${path}: ${json.error?.message ?? `HTTP ${response.status}`}`);
  }
  return json;
}

/** Send the clip's bytes to a resumable upload URL in one request. */
async function upload(config: MetaConfig, uploadUrl: string, file: string, log: Log) {
  const size = statSync(file).size;
  if (config.dryRun) {
    log(`  [dry run] upload ${(size / 1_048_576).toFixed(1)} MB`);
    return;
  }
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `OAuth ${config.pageToken}`,
      offset: "0",
      file_size: String(size),
      "Content-Type": "application/octet-stream",
    },
    body: readFileSync(file),
    signal: AbortSignal.timeout(300_000),
  });
  const json = (await response.json().catch(() => ({}))) as { success?: boolean; debug_info?: { message?: string } };
  if (!response.ok || json.success === false) {
    throw new Error(`Meta upload: ${json.debug_info?.message ?? `HTTP ${response.status}`}`);
  }
}

/** Ask until `done` says so, every few seconds, for up to `limitMs`. */
async function poll<T>(ask: () => Promise<T>, done: (value: T) => boolean | Error, limitMs: number): Promise<T> {
  const deadline = Date.now() + limitMs;
  for (;;) {
    const value = await ask();
    const verdict = done(value);
    if (verdict instanceof Error) throw verdict;
    if (verdict) return value;
    if (Date.now() > deadline) throw new Error("Meta did not finish processing the clip in time");
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}

async function publishFacebook(config: MetaConfig, file: string, caption: string, log: Log): Promise<ReelResult> {
  const page = config.pageId!;
  const token = config.pageToken!;
  const start = await graph<{ video_id?: string; upload_url?: string }>(
    config, "POST", `${page}/video_reels`, { upload_phase: "start", access_token: token }, log,
  );
  const videoId = config.dryRun ? "dry-facebook" : start.video_id;
  if (!videoId) throw new Error("Meta did not return a video id for the Reel");
  await upload(config, start.upload_url ?? `${RUPLOAD}/video-upload/${config.version}/${videoId}`, file, log);
  await graph(config, "POST", `${page}/video_reels`, {
    upload_phase: "finish",
    video_id: videoId,
    video_state: "PUBLISHED",
    description: caption,
    access_token: token,
  }, log);
  if (config.dryRun) return { id: videoId, url: null };
  await poll(
    () => graph<{ status?: { video_status?: string; publishing_phase?: { status?: string } } }>(
      config, "GET", videoId, { fields: "status", access_token: token }, log,
    ),
    (r) =>
      r.status?.video_status === "error"
        ? new Error("Facebook could not process the Reel")
        : r.status?.video_status === "ready" || r.status?.publishing_phase?.status === "complete",
    10 * 60_000,
  );
  const link = await graph<{ permalink_url?: string }>(
    config, "GET", videoId, { fields: "permalink_url", access_token: token }, log,
  ).catch(() => ({}) as { permalink_url?: string });
  const url = link.permalink_url ? new URL(link.permalink_url, "https://www.facebook.com").href : null;
  return { id: videoId, url };
}

async function publishInstagram(
  config: MetaConfig,
  file: string,
  caption: string,
  coverMs: number | null,
  log: Log,
): Promise<ReelResult> {
  const user = config.igUserId!;
  const token = config.pageToken!;
  const container = await graph<{ id?: string; uri?: string }>(config, "POST", `${user}/media`, {
    media_type: "REELS",
    upload_type: "resumable",
    caption,
    share_to_feed: "true",
    ...(coverMs !== null ? { thumb_offset: String(Math.round(coverMs)) } : {}),
    access_token: token,
  }, log);
  const containerId = config.dryRun ? "dry-instagram" : container.id;
  if (!containerId) throw new Error("Meta did not return an Instagram media container");
  await upload(config, container.uri ?? `${RUPLOAD}/ig-api-upload/${config.version}/${containerId}`, file, log);
  if (!config.dryRun) {
    await poll(
      () => graph<{ status_code?: string; status?: string }>(
        config, "GET", containerId, { fields: "status_code,status", access_token: token }, log,
      ),
      (r) =>
        r.status_code === "ERROR" || r.status_code === "EXPIRED"
          ? new Error(`Instagram could not process the Reel: ${r.status ?? r.status_code}`)
          : r.status_code === "FINISHED",
      10 * 60_000,
    );
  }
  const published = await graph<{ id?: string }>(
    config, "POST", `${user}/media_publish`, { creation_id: containerId, access_token: token }, log,
  );
  const mediaId = config.dryRun ? "dry-instagram-media" : published.id;
  if (!mediaId) throw new Error("Instagram did not return the published media id");
  if (config.dryRun) return { id: mediaId, url: null };
  const link = await graph<{ permalink?: string }>(
    config, "GET", mediaId, { fields: "permalink", access_token: token }, log,
  ).catch(() => ({}) as { permalink?: string });
  return { id: mediaId, url: link.permalink ?? null };
}

/**
 * Publish one clip as a Reel.
 * @param input.coverMs - Instagram's cover frame, in ms into the clip (Facebook picks its own)
 * @throws with Meta's own message when a step is refused or processing fails
 */
export async function publishReel(input: {
  config: MetaConfig;
  platform: MetaPlatform;
  file: string;
  caption: string;
  coverMs?: number | null;
  log?: Log;
}): Promise<ReelResult> {
  const log = input.log ?? ((line: string) => console.log(line));
  const missing = metaReady(input.config, input.platform);
  if (missing && !input.config.dryRun) throw new Error(missing);
  if (!existsSync(input.file)) throw new Error(`no clip at ${input.file}`);
  return input.platform === "facebook"
    ? publishFacebook(input.config, input.file, input.caption, log)
    : publishInstagram(input.config, input.file, input.caption, input.coverMs ?? null, log);
}

/**
 * Turn a short-lived user token (from Graph API Explorer) into the Page's never-expiring
 * token and the Instagram account linked to that Page.
 * @param pick - a Page id or name, when the user manages more than one
 * @returns The Page and Instagram ids and the Page token, plus every Page seen
 */
export async function exchangeForPageToken(
  config: MetaConfig,
  pick: string | null,
): Promise<{ pageId: string; pageName: string; pageToken: string; igUserId: string | null; pages: string[] }> {
  if (!config.appId || !config.appSecret || !config.userToken) {
    throw new Error("meta-setup needs META_APP_ID, META_APP_SECRET and META_USER_TOKEN in .env.local");
  }
  const live = { ...config, dryRun: false };
  const quiet = () => {};
  const longLived = await graph<{ access_token?: string }>(live, "GET", "oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: config.appId,
    client_secret: config.appSecret,
    fb_exchange_token: config.userToken,
  }, quiet);
  if (!longLived.access_token) throw new Error("Meta did not return a long-lived user token");
  // A Page token fetched with a long-lived user token does not expire.
  const accounts = await graph<{
    data?: { id: string; name: string; access_token: string; instagram_business_account?: { id: string } }[];
  }>(live, "GET", "me/accounts", {
    fields: "id,name,access_token,instagram_business_account",
    access_token: longLived.access_token,
  }, quiet);
  const pages = accounts.data ?? [];
  if (!pages.length) throw new Error("this Facebook user manages no Pages (or the token lacks pages_show_list)");
  const chosen = pick
    ? pages.find((p) => p.id === pick || p.name.toLowerCase() === pick.toLowerCase())
    : pages.length === 1
      ? pages[0]
      : undefined;
  if (!chosen) {
    throw new Error(`pick a Page with --page: ${pages.map((p) => `${p.name} (${p.id})`).join(", ")}`);
  }
  return {
    pageId: chosen.id,
    pageName: chosen.name,
    pageToken: chosen.access_token,
    igUserId: chosen.instagram_business_account?.id ?? null,
    pages: pages.map((p) => `${p.name} (${p.id})`),
  };
}

/**
 * Set keys in .env.local, keeping every other line; a null value removes the key.
 * @param root - the repository root
 */
export function writeEnvLocal(root: string, values: Record<string, string | null>) {
  const file = join(root, ".env.local");
  const lines = existsSync(file) ? readFileSync(file, "utf8").split("\n") : [];
  const left = new Set(Object.keys(values));
  const out = lines
    .map((line) => {
      const key = /^\s*([A-Z0-9_]+)\s*=/.exec(line)?.[1];
      if (!key || !(key in values)) return line;
      left.delete(key);
      return values[key] === null ? null : `${key}=${values[key]}`;
    })
    .filter((line): line is string => line !== null);
  for (const key of left) if (values[key] !== null) out.push(`${key}=${values[key]}`);
  writeFileSync(file, `${out.join("\n").replace(/\n+$/, "")}\n`, { mode: 0o600 });
}
