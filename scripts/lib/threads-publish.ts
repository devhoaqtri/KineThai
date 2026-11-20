/**
 * Publish a post on Threads (a carousel of the word's finished pages, matching Instagram)
 * through Meta's Threads API (`graph.threads.net`).
 *
 *   each page  host as an unpublished photo on the Facebook Page (meta-publish.ts hostImage)
 *              → POST /{threads-user}/threads (media_type=IMAGE, image_url, is_carousel_item=true)
 *              → poll /{id}?fields=status until FINISHED
 *   carousel   POST /{threads-user}/threads (media_type=CAROUSEL, children, text)
 *              → poll until FINISHED
 *              → POST /{threads-user}/threads_publish (creation_id)
 *              → GET /{media}?fields=permalink
 *              → delete the temporary Page photos in `finally`.
 *
 * Credentials (`THREADS_USER_ID`, `THREADS_ACCESS_TOKEN`, and optionally `THREADS_APP_ID` /
 * `THREADS_APP_SECRET` for long-lived token exchange/refresh) live in `.env.local`, which
 * git ignores, and are never printed. `THREADS_DRY_RUN=1` runs every step except the network.
 *
 * Exports: ThreadsConfig, loadThreadsConfig, threadsReady, publishThreadsCarousel,
 *   recentThreads, threadsSetup, refreshThreadsToken, MAX_THREADS_TEXT
 */
import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import {
  deleteHostedImage,
  hostImage,
  MAX_CAROUSEL_ITEMS,
  metaReady,
  readEnvFile,
  writeEnvLocal,
  type LiveUpload,
  type MetaConfig,
  type ReelResult,
} from "./meta-publish";

const THREADS_GRAPH = "https://graph.threads.net";
const THREADS_API = `${THREADS_GRAPH}/v1.0`;
const THREADS_OAUTH = "https://threads.net/oauth/authorize";
/** Threads's text limit per post. */
export const MAX_THREADS_TEXT = 500;

export type ThreadsConfig = {
  appId: string | null;
  appSecret: string | null;
  userId: string | null;
  accessToken: string | null;
  dryRun: boolean;
};

type Log = (line: string) => void;

/**
 * Threads settings from process.env, then .env.local, then .env (first wins),
 * read fresh each call so a setup run is seen without a restart.
 */
export function loadThreadsConfig(root: string): ThreadsConfig {
  const files = { ...readEnvFile(join(root, ".env")), ...readEnvFile(join(root, ".env.local")) };
  const get = (key: string) => process.env[key] || files[key] || null;
  return {
    appId: get("THREADS_APP_ID"),
    appSecret: get("THREADS_APP_SECRET"),
    userId: get("THREADS_USER_ID"),
    accessToken: get("THREADS_ACCESS_TOKEN"),
    dryRun: get("THREADS_DRY_RUN") === "1",
  };
}

/** What Threads still lacks before it can publish, or null when it is ready. */
export function threadsReady(config: ThreadsConfig, metaConfig?: MetaConfig): string | null {
  if (!config.accessToken) {
    return "no THREADS_ACCESS_TOKEN: run `npm run tiktok -- threads-setup --token <token>`";
  }
  if (!config.userId) {
    return "no THREADS_USER_ID: run `npm run tiktok -- threads-setup --token <token>`";
  }
  if (metaConfig) {
    const pageMissing = metaReady(metaConfig, "facebook");
    if (pageMissing) return `Threads hosts carousel images via Facebook Page: ${pageMissing}`;
  }
  return null;
}

async function threadsGraph<T>(
  config: ThreadsConfig,
  method: "GET" | "POST",
  path: string,
  params: Record<string, string>,
  log: Log,
): Promise<T> {
  const shown = Object.keys(params).filter((k) => k !== "access_token" && k !== "client_secret");
  if (config.dryRun) {
    log(`  [dry run] ${method} ${path} ${shown.join(",")}`);
    return {} as T;
  }
  const url = new URL(path.startsWith("http") ? path : `${THREADS_API}/${path}`);
  const body = new URLSearchParams(params);
  if (method === "GET") url.search = body.toString();
  const response = await fetch(url, {
    method,
    ...(method === "POST" ? { body } : {}),
    signal: AbortSignal.timeout(60_000),
  });
  const json = (await response.json().catch(() => ({}))) as T & {
    error?: { message?: string; code?: number };
    error_message?: string;
  };
  if (!response.ok || json.error) {
    const msg = json.error?.message ?? json.error_message ?? `HTTP ${response.status}`;
    throw new Error(`Threads ${method} ${path}: ${msg}`);
  }
  return json;
}

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
    if (Date.now() >= deadline) {
      if (failure) throw failure;
      throw new Error(`Threads container did not finish within ${Math.round(limitMs / 1000)}s`);
    }
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
}

async function containerReady(config: ThreadsConfig, containerId: string, what: string, log: Log) {
  if (config.dryRun) return;
  await poll(
    () =>
      threadsGraph<{ status?: string; error_message?: string }>(
        config,
        "GET",
        containerId,
        { fields: "status,error_message", access_token: config.accessToken! },
        log,
      ),
    (r) =>
      r.status === "ERROR" || r.status === "EXPIRED"
        ? new Error(`Threads could not process ${what}: ${r.error_message ?? r.status}`)
        : r.status === "FINISHED" || r.status === "PUBLISHED",
    5 * 60_000,
  );
}

/** Clamp a caption cleanly to Threads's 500-character limit. */
export function threadsCaption(caption: string): string {
  const chars = [...caption.trim()];
  if (chars.length <= MAX_THREADS_TEXT) return caption.trim();
  return `${chars.slice(0, MAX_THREADS_TEXT - 1).join("").trimEnd()}…`;
}

/**
 * Publish the word's finished carousel slides on Threads, in order.
 * Hosts slides temporarily via the Facebook Page (same as Instagram) and cleans them up in `finally`.
 */
export async function publishThreadsCarousel(input: {
  config: ThreadsConfig;
  metaConfig: MetaConfig;
  images: string[];
  caption: string;
  log?: Log;
}): Promise<ReelResult> {
  const { config, metaConfig, images } = input;
  const log = input.log ?? ((line: string) => console.log(line));
  const missing = threadsReady(config, metaConfig);
  if (missing && !config.dryRun) throw new Error(missing);
  if (images.length < 2 || images.length > MAX_CAROUSEL_ITEMS) {
    throw new Error(`a Threads carousel takes 2 to ${MAX_CAROUSEL_ITEMS} images, not ${images.length}`);
  }
  for (const file of images) {
    if (!existsSync(file)) throw new Error(`no page image at ${file}`);
    if (!/\.jpe?g$/i.test(file)) throw new Error(`Threads carousel takes JPEG: ${basename(file)}`);
  }

  const user = config.userId ?? "dry-threads-user";
  const token = config.accessToken ?? "dry-token";
  const text = threadsCaption(input.caption);
  const hosted: string[] = [];
  const effectiveMeta = config.dryRun ? { ...metaConfig, dryRun: true } : metaConfig;

  try {
    const children: string[] = [];
    for (const [index, file] of images.entries()) {
      const { photoId, url } = await hostImage(effectiveMeta, file, log);
      hosted.push(photoId);
      const item = await threadsGraph<{ id?: string }>(
        config,
        "POST",
        `${user}/threads`,
        {
          media_type: "IMAGE",
          image_url: url,
          is_carousel_item: "true",
          access_token: token,
        },
        log,
      );
      const itemId = config.dryRun ? `dry-threads-item-${index + 1}` : item.id;
      if (!itemId) throw new Error(`Threads did not return a container for page ${index + 1}`);
      await containerReady(config, itemId, `page ${index + 1}`, log);
      children.push(itemId);
    }

    const carousel = await threadsGraph<{ id?: string }>(
      config,
      "POST",
      `${user}/threads`,
      {
        media_type: "CAROUSEL",
        children: children.join(","),
        text,
        access_token: token,
      },
      log,
    );
    const carouselId = config.dryRun ? "dry-threads-carousel" : carousel.id;
    if (!carouselId) throw new Error("Threads did not return the carousel container");
    await containerReady(config, carouselId, "carousel", log);

    const published = await threadsGraph<{ id?: string }>(
      config,
      "POST",
      `${user}/threads_publish`,
      { creation_id: carouselId, access_token: token },
      log,
    );
    const mediaId = config.dryRun ? "dry-threads-media" : published.id;
    if (!mediaId) throw new Error("Threads did not return the published media id");
    if (config.dryRun) return { id: mediaId, url: null };

    const link = await threadsGraph<{ permalink?: string }>(
      config,
      "GET",
      mediaId,
      { fields: "permalink", access_token: token },
      log,
    ).catch(() => ({}) as { permalink?: string });
    return { id: mediaId, url: link.permalink ?? null };
  } finally {
    if (!config.dryRun) {
      for (const photoId of hosted) {
        await deleteHostedImage(effectiveMeta, photoId, log);
      }
    } else if (hosted.length) {
      log(`  [dry run] delete ${hosted.length} hosted page photo(s)`);
    }
  }
}

/**
 * The account's latest Threads posts, newest first, so a post is never sent twice.
 */
export async function recentThreads(config: ThreadsConfig): Promise<LiveUpload[]> {
  if (config.dryRun) return [];
  const missing = threadsReady(config);
  if (missing) throw new Error(missing);
  const res = await threadsGraph<{ data?: { id?: string; text?: string; permalink?: string }[] }>(
    config,
    "GET",
    `${config.userId}/threads`,
    { fields: "id,text,permalink", limit: "50", access_token: config.accessToken! },
    () => {},
  );
  return (res.data ?? []).flatMap((item) =>
    item.id ? [{ id: item.id, url: item.permalink ?? null, text: item.text ?? "" }] : [],
  );
}

/** Exchange a short-lived Threads token for a 60-day long-lived token (when appSecret is set). */
async function exchangeLongLived(token: string, appSecret: string | null): Promise<string> {
  if (!appSecret) return token;
  const url = new URL(`${THREADS_GRAPH}/access_token`);
  url.search = new URLSearchParams({
    grant_type: "th_exchange_token",
    client_secret: appSecret,
    access_token: token,
  }).toString();
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string };
  return res.ok && json.access_token ? json.access_token : token;
}

/** Refresh a 60-day long-lived Threads token and save it back to .env.local. */
export async function refreshThreadsToken(root: string): Promise<{ expiresInDays: number }> {
  const config = loadThreadsConfig(root);
  if (!config.accessToken) throw new Error("no THREADS_ACCESS_TOKEN to refresh");
  const url = new URL(`${THREADS_GRAPH}/refresh_access_token`);
  url.search = new URLSearchParams({
    grant_type: "th_refresh_token",
    access_token: config.accessToken,
  }).toString();
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: { message?: string };
  };
  if (!res.ok || !json.access_token) {
    throw new Error(`Threads token refresh: ${json.error?.message ?? `HTTP ${res.status}`}`);
  }
  writeEnvLocal(root, { THREADS_ACCESS_TOKEN: json.access_token });
  return { expiresInDays: Math.round((json.expires_in ?? 0) / 86_400) };
}

/**
 * Connect Threads once and save THREADS_USER_ID + THREADS_ACCESS_TOKEN to .env.local.
 * Accepts either `--token <token>` (from Meta's Threads User Token Generator) or
 * `--code <code> --redirect <uri>` from the Threads OAuth authorize flow.
 */
export async function threadsSetup(input: {
  root: string;
  token?: string;
  code?: string;
  redirectUri?: string;
}): Promise<{ userId: string; username: string; exchanged: boolean }> {
  const config = loadThreadsConfig(input.root);
  let rawToken = input.token?.trim() || "";

  if (!rawToken && input.code) {
    if (!config.appId || !config.appSecret) {
      throw new Error("put THREADS_APP_ID and THREADS_APP_SECRET in .env.local to exchange an OAuth code");
    }
    const redirectUri = input.redirectUri || "https://anh.chayla.app/threads-callback";
    const res = await fetch(`${THREADS_GRAPH}/oauth/access_token`, {
      method: "POST",
      body: new URLSearchParams({
        client_id: config.appId,
        client_secret: config.appSecret,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        code: input.code.trim(),
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const json = (await res.json().catch(() => ({}))) as {
      access_token?: string;
      error_message?: string;
      error?: { message?: string };
    };
    if (!res.ok || !json.access_token) {
      throw new Error(`Threads OAuth exchange: ${json.error?.message ?? json.error_message ?? `HTTP ${res.status}`}`);
    }
    rawToken = json.access_token;
  }

  if (!rawToken) {
    const authHint = config.appId
      ? `\n  Or authorize via OAuth:\n  ${THREADS_OAUTH}?client_id=${encodeURIComponent(config.appId)}&redirect_uri=${encodeURIComponent(input.redirectUri || "https://anh.chayla.app/threads-callback")}&scope=threads_basic,threads_content_publish&response_type=code`
      : "";
    throw new Error(
      "pass --token <token> from Meta Developer Console → Threads API → User Token Generator" +
        " (or --code <code> --redirect <uri>)." +
        authHint,
    );
  }

  const longToken = await exchangeLongLived(rawToken, config.appSecret);
  const exchanged = longToken !== rawToken;

  const meRes = await fetch(
    `${THREADS_API}/me?fields=id,username&access_token=${encodeURIComponent(longToken)}`,
    { signal: AbortSignal.timeout(30_000) },
  );
  const me = (await meRes.json().catch(() => ({}))) as {
    id?: string;
    username?: string;
    error?: { message?: string };
  };
  if (!meRes.ok || !me.id) {
    throw new Error(`Threads /me check failed: ${me.error?.message ?? `HTTP ${meRes.status}`}`);
  }

  writeEnvLocal(input.root, {
    THREADS_USER_ID: me.id,
    THREADS_ACCESS_TOKEN: longToken,
  });
  return { userId: me.id, username: me.username ?? me.id, exchanged };
}
