/**
 * Server-only admin PIN gate and HMAC-signed HttpOnly session cookie.
 *
 * Keeps the admin PIN check and signing secret exclusively on the server so no
 * browser bundle ever receives the PIN literal or secret material. Works in both
 * local dev and hosted production deployments without requiring Supabase login.
 *
 * Exports: ADMIN_PIN_ACTOR_ID, ADMIN_PIN_COOKIE, ADMIN_PIN_TTL_MS,
 *   verifyAdminPinValue, issueAdminPinToken, verifyAdminPinToken,
 *   hasValidAdminPinCookie, setAdminPinCookie, clearAdminPinCookie,
 *   checkPinAttemptRateLimit, recordPinFailure, clearPinFailures,
 *   adminPinRequestIp
 * Depends on: globalThis.crypto.subtle, @tanstack/react-start/server
 */

import { deleteCookie, getRequest, setCookie } from "@tanstack/react-start/server";

export const ADMIN_PIN_ACTOR_ID = "00000000-0000-4000-8000-000000000001";
export const ADMIN_PIN_COOKIE = "kinetic_admin_pin";
export const ADMIN_PIN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const DEFAULT_ADMIN_PIN = "080723";
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000;

type FailureRecord = {
  count: number;
  resetAt: number;
};

const failedAttempts = new Map<string, FailureRecord>();
const encoder = new TextEncoder();
let cachedKey: { secret: string; keyPromise: Promise<CryptoKey> } | null = null;

function expectedPin(): string {
  return process.env.ADMIN_PIN?.trim() || DEFAULT_ADMIN_PIN;
}

function secretMaterial(): string {
  const explicit = process.env.ADMIN_PIN_SECRET?.trim();
  if (explicit) return explicit;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (serviceKey) return `kinemedia:admin-pin:v1:${serviceKey}`;
  return "kinemedia:admin-pin:dev-only";
}

function signingKey(): Promise<CryptoKey> {
  const secret = secretMaterial();
  if (!cachedKey || cachedKey.secret !== secret) {
    cachedKey = {
      secret,
      keyPromise: crypto.subtle.importKey(
        "raw",
        encoder.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      ),
    };
  }
  return cachedKey.keyPromise;
}

function base64url(bytes: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function constantTimeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i += 1) {
    const ca = i < a.length ? a.charCodeAt(i) : 0;
    const cb = i < b.length ? b.charCodeAt(i) : 0;
    diff |= ca ^ cb;
  }
  return diff === 0;
}

/** Verify a submitted PIN against the configured admin PIN using constant-time comparison. */
export function verifyAdminPinValue(pin: string): boolean {
  return constantTimeEqual(pin.trim(), expectedPin());
}

async function signPayload(expiresSeconds: number): Promise<string> {
  const message = `v1|admin-pin|${expiresSeconds}`;
  const mac = await crypto.subtle.sign("HMAC", await signingKey(), encoder.encode(message));
  return base64url(mac).slice(0, 22);
}

/** Issue a signed session cookie value valid until `now + ADMIN_PIN_TTL_MS`. */
export async function issueAdminPinToken(now: number = Date.now()): Promise<string> {
  const expiresSeconds = Math.floor((now + ADMIN_PIN_TTL_MS) / 1000);
  const sig = await signPayload(expiresSeconds);
  return `v1.${expiresSeconds}.${sig}`;
}

/** Validate a signed admin PIN token and its expiry. */
export async function verifyAdminPinToken(
  token: string | null | undefined,
  now: number = Date.now(),
): Promise<boolean> {
  if (!token) return false;
  const match = /^v1\.(\d{1,12})\.([A-Za-z0-9_-]{22})$/.exec(token.trim());
  if (!match) return false;
  const expiresSeconds = Number(match[1]);
  if (expiresSeconds * 1000 <= now) return false;
  const expected = await signPayload(expiresSeconds);
  return constantTimeEqual(expected, match[2]!);
}

function parseCookieHeader(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const key = part.slice(0, eq).trim();
    if (key !== name) continue;
    const raw = part.slice(eq + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return null;
}

function safeCurrentRequest(explicit?: Request): Request | undefined {
  if (explicit) return explicit;
  try {
    return getRequest();
  } catch {
    return undefined;
  }
}

/** Check whether the current (or provided) request carries a valid signed admin PIN cookie. */
export async function hasValidAdminPinCookie(request?: Request): Promise<boolean> {
  const req = safeCurrentRequest(request);
  if (!req) return false;
  const token = parseCookieHeader(req.headers.get("cookie"), ADMIN_PIN_COOKIE);
  return verifyAdminPinToken(token);
}

function isSecureRequest(request?: Request): boolean {
  const req = safeCurrentRequest(request);
  if (!req) return false;
  const forwardedProto = req.headers.get("x-forwarded-proto");
  if (forwardedProto) {
    return forwardedProto.split(",")[0]?.trim().toLowerCase() === "https";
  }
  try {
    return new URL(req.url).protocol === "https:";
  } catch {
    return false;
  }
}

/** Persist the signed admin PIN token into an HttpOnly cookie on the active response. */
export function setAdminPinCookie(token: string, request?: Request): void {
  setCookie(ADMIN_PIN_COOKIE, token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(request),
    maxAge: Math.floor(ADMIN_PIN_TTL_MS / 1000),
  });
}

/** Clear the admin PIN cookie on the active response. */
export function clearAdminPinCookie(request?: Request): void {
  deleteCookie(ADMIN_PIN_COOKIE, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(request),
  });
}

/** Resolve client IP key for rate-limiting PIN attempts. */
export function adminPinRequestIp(request?: Request): string {
  const req = safeCurrentRequest(request);
  if (!req) return "local";
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "anon"
  );
}

/** Check whether an IP is temporarily locked out due to repeated failed PIN guesses. */
export function checkPinAttemptRateLimit(
  key: string,
  now: number = Date.now(),
): { ok: true } | { ok: false; retryAfterSeconds: number } {
  const record = failedAttempts.get(key);
  if (!record) return { ok: true };
  if (now >= record.resetAt) {
    failedAttempts.delete(key);
    return { ok: true };
  }
  if (record.count >= MAX_FAILED_ATTEMPTS) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((record.resetAt - now) / 1000)),
    };
  }
  return { ok: true };
}

/** Record a failed PIN attempt for an IP. */
export function recordPinFailure(key: string, now: number = Date.now()): void {
  const existing = failedAttempts.get(key);
  if (!existing || now >= existing.resetAt) {
    failedAttempts.set(key, { count: 1, resetAt: now + LOCKOUT_MS });
    return;
  }
  existing.count += 1;
}

/** Clear recorded PIN failures for an IP after a successful unlock. */
export function clearPinFailures(key: string): void {
  failedAttempts.delete(key);
}
