/**
 * Ask the browser to keep this device's progress.
 *
 * Everything a reader earns lives in local storage, which a browser may clear to free space.
 * This asks it not to. It is a request and not a guarantee: Chrome decides by itself from how
 * the site is used, Firefox shows a permission prompt, and Safari's rule about sites left
 * unvisited for a week can still apply. So a reader who loses a device, or whose browser
 * clears the site anyway, still loses their progress; only an account could prevent that.
 *
 * Called when there is something worth keeping (a day that counted, a saved word) and not on
 * load, so a first-time visitor on Firefox is not met with a prompt before reading anything.
 *
 * Exports: requestDurableStorage
 * Depends on: none (leaf module)
 */

let asked = false;

/** Ask once per page load; never throws, and does nothing where the browser cannot. */
export function requestDurableStorage(): void {
  if (asked) return;
  asked = true;
  const storage = typeof navigator === "undefined" ? undefined : navigator.storage;
  if (!storage?.persist || !storage.persisted) return;
  void storage
    .persisted()
    .then((kept) => (kept ? true : storage.persist()))
    .catch(() => undefined);
}
