/**
 * Publish a post on the Facebook Page (a Reel of the clip) and on Instagram (a carousel of
 * the word's finished pages, the user's rule since 2026-11-16), through Meta's Graph API.
 *
 *   Facebook  POST /{page}/video_reels (start) → upload the MP4 by resumable upload to
 *             rupload.facebook.com → POST …(finish, PUBLISHED) → poll /{video} until it is
 *             ready → its permalink
 *   Instagram each page: POST /{page}/photos (published=false), so Meta hosts it at a public
 *             address without it showing on the Page → POST /{ig-user}/media
 *             (image_url, is_carousel_item) → POST /{ig-user}/media (CAROUSEL, children,
 *             caption) → poll until FINISHED → POST /{ig-user}/media_publish → its permalink,
 *             then the hosted photos are deleted. Instagram fetches carousel images by URL
 *             only (no upload for images), so they have to be somewhere public first; the
 *             Page's unpublished photos keep that inside Meta with no other host or key.
 *             publishInstagramReel stays for a video, which the calendar no longer sends.
 *
 * One Meta app in development mode covers both, since it only posts to accounts its admin
 * manages; no App Review. The Page token (from `npm run tiktok -- meta-setup`) never
 * expires and carries the Instagram permissions too. Credentials live in .env.local, which
 * git ignores, and are never printed.
 *
 * META_DRY_RUN=1 (or `dryRun`) runs every step but the network: what would be sent is logged,
 * ids come back as `dry-…`, and nothing on either platform changes.
 *
 * Exports: MetaConfig, loadMetaConfig, metaReady, publishReel, publishCarousel, setFacebookCover,
 *   largestImage, MAX_CAROUSEL_ITEMS, exchangeForPageToken, writeEnvLocal, ReelResult,
 *   LiveUpload, recentUploads, updateReelDescription
 * Depends on: Node's fetch, FormData and Blob; the clip and the page images on disk
 */
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { MetaPlatform } from "./tiktok-calendar";
import { extractFrameJpeg } from "./cover-frame";

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
export function readEnvFile(file: string): Record<string, string> {
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

/**
 * Ask until `done` says so, every few seconds, for up to `limitMs`. A question that fails (a
 * timeout, a dropped connection) is asked again: by then the post has been sent, and one slow
 * answer once had a live Reel recorded as failed and sent a second time.
 */
async function poll<T>(ask: () => Promise<T>, done: (value: T) => boolean | Error, limitMs: number): Promise<T> {
  const deadline = Date.now() + limitMs;
  for (;;) {
    let value: T | undefined;
    let failure: unknown = null;
    try {
      value = await ask();
    } catch (error) {
      failure = error;
    }
    if (!failure) {
      const verdict = done(value as T);
      if (verdict instanceof Error) throw verdict;
      if (verdict) return value as T;
    }
    if (Date.now() > deadline) {
      throw failure instanceof Error ? failure : new Error("Meta did not finish processing the clip in time");
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}

/**
 * Make a frame of the clip a Facebook video's cover: POST /{video}/thumbnails with the JPEG as
 * `source` and `is_preferred`. Without it Facebook shows the clip's first frame, an empty
 * gradient. Returns quietly in a dry run.
 */
export async function setFacebookCover(input: {
  config: MetaConfig;
  videoId: string;
  file: string;
  coverMs: number;
  log?: Log;
}): Promise<void> {
  const log = input.log ?? ((line: string) => console.log(line));
  const jpeg = extractFrameJpeg(input.file, input.coverMs);
  const at = `${(input.coverMs / 1000).toFixed(2)}s`;
  if (input.config.dryRun) {
    log(`  [dry run] POST ${input.videoId}/thumbnails (${(jpeg.length / 1024).toFixed(0)} KB JPEG @ ${at})`);
    return;
  }
  const form = new FormData();
  form.append("access_token", input.config.pageToken!);
  form.append("is_preferred", "true");
  form.append("source", new Blob([new Uint8Array(jpeg)], { type: "image/jpeg" }), "cover.jpg");
  const response = await fetch(`${GRAPH}/${input.config.version}/${input.videoId}/thumbnails`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(60_000),
  });
  const json = (await response.json().catch(() => ({}))) as { success?: boolean; error?: { message?: string } };
  if (!response.ok || json.error) {
    throw new Error(`Meta POST ${input.videoId}/thumbnails: ${json.error?.message ?? `HTTP ${response.status}`}`);
  }
  log(`  ✓ cover set from ${at} (${(jpeg.length / 1024).toFixed(0)} KB)`);
}

async function publishFacebook(
  config: MetaConfig,
  file: string,
  caption: string,
  coverMs: number | null,
  log: Log,
): Promise<ReelResult> {
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
  // The Reel is live by now; a cover that will not set is a warning, never a failed post.
  if (coverMs !== null) {
    await setFacebookCover({ config, videoId, file, coverMs, log }).catch((error: unknown) =>
      log(`  ! cover not set: ${error instanceof Error ? error.message : String(error)}`),
    );
  }
  const link = await graph<{ permalink_url?: string }>(
    config, "GET", videoId, { fields: "permalink_url", access_token: token }, log,
  ).catch(() => ({}) as { permalink_url?: string });
  const url = link.permalink_url ? new URL(link.permalink_url, "https://www.facebook.com").href : null;
  return { id: videoId, url };
}

async function publishInstagramReel(
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
 * @param input.coverMs - the cover frame, in ms into the clip (Facebook's thumbnail, Instagram's thumb_offset)
 * @throws with Meta's own message when a step is refused or processing fails
 */
/** A post already on a platform: its id, address and the text it went out with. */
/** A live post: its id, address, text, and when it went up (ISO) when the platform says. */
export type LiveUpload = { id: string; url: string | null; text: string; at?: string | null };

/**
 * The Page's latest Reels (Facebook) or the account's latest posts (Instagram), newest first,
 * so a post can be looked for before it is sent (postNumberIn reads which one each is). Empty
 * on a dry run.
 * @throws when Meta cannot be asked: the caller sends nothing rather than risk a second copy
 */
export async function recentUploads(config: MetaConfig, platform: MetaPlatform, log: Log = () => {}): Promise<LiveUpload[]> {
  const token = config.pageToken!;
  if (platform === "facebook") {
    const page = await graph<{ data?: { id: string; description?: string; permalink_url?: string; created_time?: string }[] }>(
      config, "GET", `${config.pageId}/video_reels`, { fields: "id,description,permalink_url,created_time", limit: "50", access_token: token }, log,
    );
    return (page.data ?? []).map((r) => ({
      id: r.id,
      url: r.permalink_url ? new URL(r.permalink_url, "https://www.facebook.com").href : null,
      text: r.description ?? "",
      at: r.created_time ?? null,
    }));
  }
  const media = await graph<{ data?: { id: string; caption?: string; permalink?: string; timestamp?: string }[] }>(
    config, "GET", `${config.igUserId}/media`, { fields: "id,caption,permalink,timestamp", limit: "50", access_token: token }, log,
  );
  return (media.data ?? []).map((m) => ({ id: m.id, url: m.permalink ?? null, text: m.caption ?? "", at: m.timestamp ?? null }));
}

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
    ? publishFacebook(input.config, input.file, input.caption, input.coverMs ?? null, log)
    : publishInstagramReel(input.config, input.file, input.caption, input.coverMs ?? null, log);
}

/** Instagram's limit on the items in one carousel. */
export const MAX_CAROUSEL_ITEMS = 20;

/**
 * The biggest rendition Meta made of a hosted photo: the one an Instagram carousel should use.
 * @param images - a photo's `images` field
 * @returns its URL, or null when there is none yet
 * @pure true
 */
export function largestImage(images: { width: number; height: number; source: string }[] | undefined): string | null {
  if (!images?.length) return null;
  return [...images].sort((a, b) => b.width * b.height - a.width * a.height)[0]!.source;
}

/**
 * Host one page image as an unpublished photo on the Page and return its public address.
 * Meta makes the renditions a moment after the upload, so the address is asked for until it
 * is there.
 */
export async function hostImage(config: MetaConfig, file: string, log: Log): Promise<{ photoId: string; url: string }> {
  if (config.dryRun) {
    log(`  [dry run] POST ${config.pageId}/photos source,published=false (${(statSync(file).size / 1024).toFixed(0)} KB)`);
    return { photoId: "dry-photo", url: "https://example.invalid/dry.jpg" };
  }
  const form = new FormData();
  form.set("source", new Blob([readFileSync(file)], { type: "image/jpeg" }), basename(file));
  form.set("published", "false");
  form.set("access_token", config.pageToken!);
  const response = await fetch(`${GRAPH}/${config.version}/${config.pageId}/photos`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(120_000),
  });
  const json = (await response.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
  if (!response.ok || !json.id) throw new Error(`Meta photo upload: ${json.error?.message ?? `HTTP ${response.status}`}`);
  const photoId = json.id;
  const hosted = await poll(
    () => graph<{ images?: { width: number; height: number; source: string }[] }>(
      config, "GET", photoId, { fields: "images", access_token: config.pageToken! }, log,
    ),
    (r) => largestImage(r.images) !== null,
    60_000,
  );
  return { photoId, url: largestImage(hosted.images)! };
}

/** Delete a temporary unpublished photo from the Page (best-effort, warns on error). */
export async function deleteHostedImage(config: MetaConfig, photoId: string, log: Log = () => {}): Promise<void> {
  if (config.dryRun) return;
  await graph(config, "POST", photoId, { method: "delete", access_token: config.pageToken! }, () => {}).catch(
    (error) => log(`  ! could not delete the hosted page photo ${photoId}: ${(error as Error).message}`),
  );
}

/** Replace a Facebook Reel's description (the video's own text on the Page). */
export async function updateReelDescription(config: MetaConfig, videoId: string, description: string, log: Log = () => {}): Promise<void> {
  await graph(config, "POST", videoId, { description, access_token: config.pageToken! }, log);
}

/** Wait for an Instagram container to be ready to use. */
async function containerReady(config: MetaConfig, containerId: string, what: string, log: Log) {
  if (config.dryRun) return;
  await poll(
    () => graph<{ status_code?: string; status?: string }>(
      config, "GET", containerId, { fields: "status_code,status", access_token: config.pageToken! }, log,
    ),
    (r) =>
      r.status_code === "ERROR" || r.status_code === "EXPIRED"
        ? new Error(`Instagram could not process the ${what}: ${r.status ?? r.status_code}`)
        : r.status_code === "FINISHED",
    5 * 60_000,
  );
}

/**
 * Publish the word's finished pages as one Instagram carousel, in the order given.
 * @param input.images - JPEG files, 2 to MAX_CAROUSEL_ITEMS, first slide first
 * @throws with Meta's own message when a step is refused; the hosted photos are deleted
 *   whatever happens
 */
export async function publishCarousel(input: {
  config: MetaConfig;
  images: string[];
  caption: string;
  log?: Log;
}): Promise<ReelResult> {
  const { config, images, caption } = input;
  const log = input.log ?? ((line: string) => console.log(line));
  const missing = metaReady(config, "instagram");
  if (missing && !config.dryRun) throw new Error(missing);
  if (images.length < 2 || images.length > MAX_CAROUSEL_ITEMS) {
    throw new Error(`an Instagram carousel takes 2 to ${MAX_CAROUSEL_ITEMS} images, not ${images.length}`);
  }
  for (const file of images) {
    if (!existsSync(file)) throw new Error(`no page image at ${file}`);
    if (!/\.jpe?g$/i.test(file)) throw new Error(`Instagram takes only JPEG: ${basename(file)}`);
  }
  const user = config.igUserId!;
  const token = config.pageToken!;
  const hosted: string[] = [];
  try {
    const children: string[] = [];
    for (const [index, file] of images.entries()) {
      const { photoId, url } = await hostImage(config, file, log);
      hosted.push(photoId);
      const item = await graph<{ id?: string }>(config, "POST", `${user}/media`, {
        image_url: url,
        is_carousel_item: "true",
        access_token: token,
      }, log);
      const itemId = config.dryRun ? `dry-item-${index + 1}` : item.id;
      if (!itemId) throw new Error(`Instagram did not return a container for page ${index + 1}`);
      await containerReady(config, itemId, `page ${index + 1}`, log);
      children.push(itemId);
    }
    const carousel = await graph<{ id?: string }>(config, "POST", `${user}/media`, {
      media_type: "CAROUSEL",
      children: children.join(","),
      caption,
      access_token: token,
    }, log);
    const carouselId = config.dryRun ? "dry-carousel" : carousel.id;
    if (!carouselId) throw new Error("Instagram did not return the carousel container");
    await containerReady(config, carouselId, "carousel", log);
    const published = await graph<{ id?: string }>(
      config, "POST", `${user}/media_publish`, { creation_id: carouselId, access_token: token }, log,
    );
    const mediaId = config.dryRun ? "dry-instagram-media" : published.id;
    if (!mediaId) throw new Error("Instagram did not return the published media id");
    if (config.dryRun) return { id: mediaId, url: null };
    const link = await graph<{ permalink?: string }>(
      config, "GET", mediaId, { fields: "permalink", access_token: token }, log,
    ).catch(() => ({}) as { permalink?: string });
    return { id: mediaId, url: link.permalink ?? null };
  } finally {
    // Instagram has its own copy once a container exists; the Page's hidden photos were only
    // the way there. A failed delete leaves an unpublished photo nobody sees, so it only warns.
    if (!config.dryRun) {
      for (const photoId of hosted) {
        await graph(config, "POST", photoId, { method: "delete", access_token: token }, () => {}).catch((error) =>
          log(`  ! could not delete the hosted page photo ${photoId}: ${(error as Error).message}`),
        );
      }
    } else if (hosted.length) {
      log(`  [dry run] delete ${hosted.length} hosted page photo(s)`);
    }
  }
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
