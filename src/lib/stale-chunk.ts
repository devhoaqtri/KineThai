/**
 * A page left open across a deploy asks for code chunks the new deploy no longer serves,
 * and the dynamic import fails ("Failed to fetch dynamically imported module"). The cure
 * is a reload, which fetches the new version. It must happen once: if the reload hits the
 * same failure (a real outage, not a deploy), reloading again would loop, so a second
 * failure inside RELOAD_GUARD_MS is left to the error screen.
 *
 * Exports: isStaleChunkError, reloadOnceForStaleChunk, installStaleChunkReload,
 *   RELOAD_GUARD_MS
 * Depends on: none (leaf module)
 */

/** A second stale-chunk failure this soon after a reload is not a deploy: stop reloading. */
export const RELOAD_GUARD_MS = 30_000;
const GUARD_KEY = "kine.chunk_reload_at";

/** The messages browsers and bundlers give a chunk that could not be fetched. */
const STALE_CHUNK_MESSAGES = [
  /Failed to fetch dynamically imported module/i, // Chromium
  /Importing a module script failed/i, // Safari
  /error loading dynamically imported module/i, // Firefox
  /Unable to preload CSS/i, // Vite's CSS preload
  /ChunkLoadError|Loading chunk [\w-]+ failed/i,
];

/**
 * Whether a thrown value is a chunk that could not be fetched.
 * @pure true
 */
export function isStaleChunkError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : typeof error === "string"
        ? error
        : "";
  return STALE_CHUNK_MESSAGES.some((pattern) => pattern.test(message));
}

type GuardStore = Pick<Storage, "getItem" | "setItem">;

function sessionStore(): GuardStore | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Reload the page for a stale chunk, unless one was just tried.
 * Without session storage there is no way to know a reload was already tried, so it does
 * not reload at all and leaves the error screen to offer the button.
 * @returns Whether a reload was started
 */
export function reloadOnceForStaleChunk({
  now = Date.now(),
  store = sessionStore(),
  reload = () => window.location.reload(),
}: { now?: number; store?: GuardStore | null; reload?: () => void } = {}): boolean {
  if (!store) return false;
  try {
    const last = Number(store.getItem(GUARD_KEY) ?? 0);
    if (last && now - last < RELOAD_GUARD_MS) return false;
    store.setItem(GUARD_KEY, String(now));
  } catch {
    return false;
  }
  reload();
  return true;
}

/**
 * Reload on Vite's `vite:preloadError`, fired when a lazy chunk or its CSS fails to load.
 * When the guard refuses, the error is left to reach the error screen.
 * @returns Cleanup
 */
export function installStaleChunkReload(): () => void {
  const onPreloadError = (event: Event) => {
    if (reloadOnceForStaleChunk()) event.preventDefault();
  };
  window.addEventListener("vite:preloadError", onPreloadError);
  return () => window.removeEventListener("vite:preloadError", onPreloadError);
}
