/**
 * Whether this browser lets the site keep data. Everything a reader earns (progress, saved
 * words, streaks, settings) lives in local storage, so a browser that refuses it (a private
 * window, site data blocked in settings, some in-app browsers) or has filled it (large
 * imported packs) silently loses all of it. The probe writes and removes one tiny key.
 *
 * Exports: StorageState, probeLocalStorage
 * Depends on: none (leaf module)
 */

/** ok: writes work; blocked: the browser refuses; full: it refuses for space. */
export type StorageState = "ok" | "blocked" | "full";

const PROBE_KEY = "kine.storage_probe";

function isQuotaError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { name, code } = error as { name?: string; code?: number };
  return name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED" || code === 22;
}

/**
 * Try a write. A quota error on an EMPTY store is a refusal, not a full store: that is how
 * older Safari private windows answered every write.
 * @param getStore - where to probe; defaults to window.localStorage
 * @returns Whether the site can keep data
 */
export function probeLocalStorage(
  getStore: () => Storage | null | undefined = () => window.localStorage,
): StorageState {
  let store: Storage | null | undefined;
  try {
    store = getStore();
  } catch {
    return "blocked";
  }
  if (!store) return "blocked";
  try {
    store.setItem(PROBE_KEY, "1");
    store.removeItem(PROBE_KEY);
    return "ok";
  } catch (error) {
    let entries = 0;
    try {
      entries = store.length;
    } catch {
      entries = 0;
    }
    return isQuotaError(error) && entries > 0 ? "full" : "blocked";
  }
}
