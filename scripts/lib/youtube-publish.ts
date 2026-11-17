/**
 * Publish a post on YouTube as a Short, through the YouTube Data API v3, from this Mac.
 *
 *   setup   one time: the owner signs in to Google in their own browser and lets this app
 *           upload to their channel (OAuth for an installed app: a loopback redirect to
 *           127.0.0.1 and PKCE). The refresh token Google hands back goes to .env.local as
 *           YT_REFRESH_TOKEN and lasts until revoked; nothing else is stored.
 *   upload  a fresh access token from the refresh token → POST the video's details to the
 *           resumable upload endpoint → PUT the MP4's bytes to the address it returns → the
 *           new video's id, from which its Shorts link follows.
 *
 * A vertical video under three minutes is a Short; the clip is 9:16 and under a minute, and
 * the title carries #shorts. YouTube has no music option in its API, so a song is mixed in
 * before upload like Facebook's (music-mix.ts, from YouTube's own Audio Library).
 *
 * Until Google audits the API project, every upload from it is locked to private: the
 * response then reports `private` whatever was asked, and the result says so. The audit is
 * Google's "YouTube API Services - Audit and Quota Extension" form.
 *
 * Credentials (YT_CLIENT_ID, YT_CLIENT_SECRET from a Google Cloud "Desktop app" OAuth client,
 * and YT_REFRESH_TOKEN) live in .env.local, which git ignores, and are never printed.
 * YT_DRY_RUN=1 (or `dryRun`) runs every step but the network.
 *
 * Exports: YouTubeConfig, loadYouTubeConfig, youtubeReady, publishShort, ShortResult, youtubeSetup
 * Depends on: Node's fetch, http and crypto; meta-publish's env helpers
 */
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { readEnvFile, writeEnvLocal } from "./meta-publish";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/youtube/v3";
const UPLOAD = "https://www.googleapis.com/upload/youtube/v3/videos";
/** Upload, and read the channel's name so setup can say which channel it reached. */
const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
];
/** YouTube's category for Education. */
const EDUCATION = "27";

export type YouTubeConfig = {
  clientId: string | null;
  clientSecret: string | null;
  refreshToken: string | null;
  /** What to ask for; an unaudited project gets private whatever this says. */
  privacy: "public" | "unlisted" | "private";
  dryRun: boolean;
};

type Log = (line: string) => void;

/**
 * YouTube settings from the process environment, then .env.local, then .env (first wins),
 * read fresh each call so a setup run is seen without a restart.
 */
export function loadYouTubeConfig(root: string): YouTubeConfig {
  const files = { ...readEnvFile(join(root, ".env")), ...readEnvFile(join(root, ".env.local")) };
  const get = (key: string) => process.env[key] || files[key] || null;
  const privacy = get("YT_PRIVACY");
  return {
    clientId: get("YT_CLIENT_ID"),
    clientSecret: get("YT_CLIENT_SECRET"),
    refreshToken: get("YT_REFRESH_TOKEN"),
    privacy: privacy === "unlisted" || privacy === "private" ? privacy : "public",
    dryRun: get("YT_DRY_RUN") === "1",
  };
}

/** What YouTube still lacks before it can publish, or null when it is ready. */
export function youtubeReady(config: YouTubeConfig): string | null {
  if (!config.clientId || !config.clientSecret) {
    return "no YT_CLIENT_ID / YT_CLIENT_SECRET: create a Desktop OAuth client (docs/youtube-publishing.md)";
  }
  if (!config.refreshToken) return "no YT_REFRESH_TOKEN: run `npm run tiktok -- youtube-setup`";
  return null;
}

/** Google's own error text, which says what to fix far better than the status. */
async function googleError(response: Response, what: string): Promise<Error> {
  const json = (await response.json().catch(() => ({}))) as {
    error?: { message?: string } | string;
    error_description?: string;
  };
  const message =
    typeof json.error === "string"
      ? `${json.error}${json.error_description ? `: ${json.error_description}` : ""}`
      : json.error?.message;
  return new Error(`YouTube ${what}: ${message ?? `HTTP ${response.status}`}`);
}

/** A short-lived access token from the stored refresh token. */
async function accessToken(config: YouTubeConfig): Promise<string> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    body: new URLSearchParams({
      client_id: config.clientId!,
      client_secret: config.clientSecret!,
      refresh_token: config.refreshToken!,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw await googleError(response, "token refresh");
  return ((await response.json()) as { access_token: string }).access_token;
}

export type ShortResult = { id: string; url: string; privacy: string };

/**
 * Upload one clip as a Short.
 * @param input.title - at most 100 characters, no `<` or `>` (youtubeTitle)
 * @param input.description - the caption; its first hashtags show above the title
 * @throws with Google's own message when a step is refused
 */
export async function publishShort(input: {
  config: YouTubeConfig;
  file: string;
  title: string;
  description: string;
  log?: Log;
}): Promise<ShortResult> {
  const { config } = input;
  const log = input.log ?? ((line: string) => console.log(line));
  const missing = youtubeReady(config);
  if (missing && !config.dryRun) throw new Error(missing);
  if (!existsSync(input.file)) throw new Error(`no clip at ${input.file}`);
  const size = statSync(input.file).size;
  const details = {
    snippet: {
      title: input.title,
      description: input.description.replace(/[<>]/g, ""),
      categoryId: EDUCATION,
      defaultLanguage: "vi",
    },
    status: { privacyStatus: config.privacy, selfDeclaredMadeForKids: false, embeddable: true },
  };
  if (config.dryRun) {
    log(`  [dry run] POST ${UPLOAD} “${details.snippet.title}” ${config.privacy}`);
    log(`  [dry run] PUT ${(size / 1_048_576).toFixed(1)} MB`);
    return { id: "dry-run", url: "https://youtube.com/shorts/dry-run", privacy: config.privacy };
  }
  const token = await accessToken(config);
  const start = await fetch(`${UPLOAD}?uploadType=resumable&part=snippet,status`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Length": String(size),
      "X-Upload-Content-Type": "video/mp4",
    },
    body: JSON.stringify(details),
    signal: AbortSignal.timeout(60_000),
  });
  if (!start.ok) throw await googleError(start, "upload start");
  const location = start.headers.get("location");
  if (!location) throw new Error("YouTube upload start: no upload address came back");
  log(`  uploading ${(size / 1_048_576).toFixed(1)} MB`);
  const sent = await fetch(location, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "video/mp4",
      "Content-Length": String(size),
    },
    body: readFileSync(input.file),
    signal: AbortSignal.timeout(600_000),
  });
  if (!sent.ok) throw await googleError(sent, "upload");
  const video = (await sent.json()) as {
    id: string;
    status?: { privacyStatus?: string; uploadStatus?: string };
  };
  const privacy = video.status?.privacyStatus ?? "unknown";
  if (privacy !== config.privacy) {
    log(
      `  ! YouTube set it ${privacy}, not ${config.privacy}: an unaudited API project's uploads stay private`,
    );
  }
  return { id: video.id, url: `https://youtube.com/shorts/${video.id}`, privacy };
}

const base64url = (bytes: Buffer) => bytes.toString("base64url");

/**
 * Sign in once: open Google's consent page in the owner's browser, catch the redirect on a
 * loopback port, trade the code for a refresh token and keep it in .env.local.
 * @returns The channel the token reaches
 */
export async function youtubeSetup(
  root: string,
  log: Log = console.log,
): Promise<{ channel: string; channelId: string }> {
  const config = loadYouTubeConfig(root);
  if (!config.clientId || !config.clientSecret) {
    throw new Error(
      "set YT_CLIENT_ID and YT_CLIENT_SECRET in .env.local first (docs/youtube-publishing.md)",
    );
  }
  const verifier = base64url(randomBytes(48));
  const state = base64url(randomBytes(16));
  const challenge = base64url(createHash("sha256").update(verifier).digest());

  const code = await new Promise<{ code: string; redirect: string }>((resolve, reject) => {
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (url.pathname !== "/") {
        response.writeHead(404).end();
        return;
      }
      const finish = (status: number, text: string, outcome: () => void) => {
        response.writeHead(status, { "content-type": "text/plain; charset=utf-8" }).end(text);
        server.close();
        clearTimeout(timer);
        outcome();
      };
      if (url.searchParams.get("state") !== state) {
        finish(400, "This sign-in did not come from this setup run. Run it again.", () =>
          reject(new Error("state mismatch")),
        );
        return;
      }
      const error = url.searchParams.get("error");
      const got = url.searchParams.get("code");
      if (error || !got) {
        finish(400, `Google said: ${error ?? "no code"}. You can close this tab.`, () =>
          reject(new Error(`Google refused: ${error ?? "no code"}`)),
        );
        return;
      }
      finish(200, "YouTube connected. You can close this tab and go back to the terminal.", () =>
        resolve({
          code: got,
          redirect: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
        }),
      );
    });
    const timer = setTimeout(() => {
      server.close();
      reject(new Error("no sign-in within 10 minutes"));
    }, 600_000);
    server.listen(0, "127.0.0.1", () => {
      const redirect = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      const consent = new URL(AUTH_URL);
      consent.search = new URLSearchParams({
        client_id: config.clientId!,
        redirect_uri: redirect,
        response_type: "code",
        scope: SCOPES.join(" "),
        access_type: "offline",
        // Always ask, so Google always hands back a refresh token.
        prompt: "consent",
        state,
        code_challenge: challenge,
        code_challenge_method: "S256",
      }).toString();
      log(
        "Opening Google's sign-in in your browser. Pick the account that owns the YouTube channel.",
      );
      log(`If nothing opens, open this address yourself:\n  ${consent.toString()}\n`);
      spawn("open", [consent.toString()], { stdio: "ignore", detached: true }).unref();
    });
  });

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code: code.code,
      code_verifier: verifier,
      redirect_uri: code.redirect,
      grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw await googleError(response, "sign-in");
  const tokens = (await response.json()) as { access_token: string; refresh_token?: string };
  if (!tokens.refresh_token)
    throw new Error(
      "Google sent no refresh token; remove the app's access in your Google account and run setup again",
    );
  writeEnvLocal(root, { YT_REFRESH_TOKEN: tokens.refresh_token });

  const channels = await fetch(`${API}/channels?part=snippet&mine=true`, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!channels.ok) throw await googleError(channels, "channel lookup");
  const item = ((await channels.json()) as { items?: { id: string; snippet: { title: string } }[] })
    .items?.[0];
  if (!item)
    throw new Error("that Google account has no YouTube channel: create one, then run setup again");
  return { channel: item.snippet.title, channelId: item.id };
}
