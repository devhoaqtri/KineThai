/**
 * A diagnostic log of what the feed did, for reading after a session on a real device:
 * every word shown and for how long, every page and stage change, every move between
 * words and what caused it, and every frame that took too long — each stamped with the
 * time since the session began.
 *
 * Development only. In a dev build (the dev server, on this machine or a phone on the
 * LAN) entries are batched and posted to /api/dev/feed-log, which appends them to
 * logs/feed-<date>.ndjson in the project. A production build never logs: `enabled` is a
 * build-time constant there, so every call is a no-op and the endpoint answers 404.
 *
 * Nothing about the reader is recorded beyond the device's own description (screen,
 * pixel ratio, user agent) and what the feed showed.
 *
 * Exports: feedLog, feedLogEnabled
 * Depends on: none (browser globals only)
 */

/** Dev builds only; Vite replaces this at build time, so production drops the logger. */
const enabled =
  typeof window !== "undefined" && (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true;

/** A frame this much longer than one refresh is logged as a hitch. */
const HITCH_MS = 50;
const FLUSH_MS = 2000;
const FLUSH_AT = 60;

type Entry = { t: number; ev: string } & Record<string, unknown>;

let started = false;
let t0 = 0;
let session = "";
let queue: Entry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | undefined;
// What is on screen, so a hitch can say which word it hit.
let currentWord: string | null = null;

/** @returns Whether this build logs at all. */
export function feedLogEnabled(): boolean {
  return enabled;
}

function now(): number {
  return Math.round(performance.now() - t0);
}

function post(entries: Entry[], beacon = false): void {
  if (!entries.length) return;
  const body = JSON.stringify({ session, entries });
  if (beacon && navigator.sendBeacon) {
    navigator.sendBeacon("/api/dev/feed-log", new Blob([body], { type: "application/json" }));
    return;
  }
  void fetch("/api/dev/feed-log", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {
    // The dev server went away; the log is best-effort.
  });
}

function flush(beacon = false): void {
  clearTimeout(flushTimer);
  flushTimer = undefined;
  const entries = queue;
  queue = [];
  post(entries, beacon);
}

/** Watch for frames that run long: a gap between animation frames well past one refresh. */
function watchFrames(): void {
  let last = performance.now();
  const tick = (time: number) => {
    const gap = time - last;
    last = time;
    if (gap > HITCH_MS && document.visibilityState === "visible") {
      feedLog("hitch", { ms: Math.round(gap), word: currentWord });
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  try {
    // Chromium reports main-thread tasks over 50ms; WebKit does not support it.
    new PerformanceObserver((list) => {
      for (const task of list.getEntries()) {
        feedLog("longtask", { ms: Math.round(task.duration), word: currentWord });
      }
    }).observe({ type: "longtask", buffered: false });
  } catch {
    // Unsupported here: the frame watch above still catches what the reader would see.
  }
}

function start(): void {
  started = true;
  t0 = performance.now();
  session = `${new Date().toISOString().replace(/[:.]/g, "-")}-${Math.random().toString(36).slice(2, 6)}`;
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { effectiveType?: string };
  };
  feedLog("session", {
    at: new Date().toISOString(),
    ua: navigator.userAgent,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    dpr: window.devicePixelRatio,
    cores: navigator.hardwareConcurrency,
    memoryGb: nav.deviceMemory ?? null,
    network: nav.connection?.effectiveType ?? null,
    touch: navigator.maxTouchPoints > 0,
  });
  document.addEventListener("visibilitychange", () => {
    feedLog("visibility", { state: document.visibilityState });
    if (document.visibilityState === "hidden") flush(true);
  });
  window.addEventListener("pagehide", () => flush(true));
  window.addEventListener("error", (event) =>
    feedLog("error", { message: event.message, source: event.filename, line: event.lineno }),
  );
  window.addEventListener("unhandledrejection", (event) =>
    feedLog("error", { message: String(event.reason) }),
  );
  watchFrames();
}

/**
 * Record one event. A no-op outside development.
 * @param ev - What happened: "word", "page", "move", "hitch", …
 * @param data - Its details; kept small and JSON-safe
 */
export function feedLog(ev: string, data: Record<string, unknown> = {}): void {
  if (!enabled) return;
  if (!started) start();
  if (ev === "word") currentWord = typeof data.word === "string" ? data.word : null;
  queue.push({ t: now(), ev, ...data });
  if (queue.length >= FLUSH_AT) flush();
  else if (!flushTimer) flushTimer = setTimeout(() => flush(), FLUSH_MS);
}
