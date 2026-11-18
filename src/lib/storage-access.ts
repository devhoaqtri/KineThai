/**
 * Whether this browser lets the site keep data, as one shared answer every screen reads.
 *
 * The probe (./storage-probe) says what the browser does right now; this module keeps that
 * answer, lets anything subscribe to it, and checks again on request ("Thử lại" in the
 * storage dialog) or when the reader comes back to the tab, which is when a setting changed
 * in another tab or the browser's own menu takes effect. A browser has no permission prompt
 * to raise again for local storage: the reader changes a setting and the site checks again.
 *
 * It also carries which on-device feature the reader just tapped while storage was off, so
 * the one dialog (StorageAccessDialog) can say why that control is greyed out.
 *
 * Persistence is a separate, softer question: Firefox can refuse to keep the data for good
 * (navigator.storage.persist) while still letting the site write it. That never greys a
 * control out; it is reported as `persistDenied` so the reader can be told the browser may
 * clear it, and how to allow it.
 *
 * Exports: StorageAccess, getStorageAccess, getServerStorageAccess, subscribeStorageAccess,
 *   recheckStorageAccess, requestStorageDialog, closeStorageDialog, resetStorageAccessForTests
 * Depends on: ./storage-probe
 */

import { probeLocalStorage, type StorageState } from "./storage-probe";

export type StorageAccess = {
  /** ok: writes work; blocked: the browser refuses them; full: it refuses for space. */
  state: StorageState;
  /** The browser declined to keep the site's data for good (Firefox's prompt, refused). */
  persistDenied: boolean;
  /** The feature whose greyed-out control was tapped; the dialog is open while set. */
  dialog: string | null;
};

const SERVER: StorageAccess = { state: "ok", persistDenied: false, dialog: null };

let current: StorageAccess = SERVER;
let probed = false;
const listeners = new Set<() => void>();

function emit(next: StorageAccess) {
  if (
    next.state === current.state &&
    next.persistDenied === current.persistDenied &&
    next.dialog === current.dialog
  ) {
    return;
  }
  current = next;
  for (const listener of listeners) listener();
}

/** The persistent-storage permission, where the browser can say (Chromium, Firefox). */
async function readPersistDenied(): Promise<boolean> {
  try {
    const status = await navigator.permissions?.query({
      name: "persistent-storage" as PermissionName,
    });
    return status?.state === "denied";
  } catch {
    return false;
  }
}

/** @returns The current answer; the first call on the client probes the browser. */
export function getStorageAccess(): StorageAccess {
  if (!probed && typeof window !== "undefined") {
    probed = true;
    current = { ...current, state: probeLocalStorage() };
    void readPersistDenied().then((persistDenied) => emit({ ...current, persistDenied }));
    // Coming back to the tab is when a changed browser setting shows up.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && current.state !== "ok") {
        void recheckStorageAccess();
      }
    });
  }
  return current;
}

/** What the server renders: storage assumed fine, so nothing is greyed before hydration. */
export function getServerStorageAccess(): StorageAccess {
  return SERVER;
}

/** @returns An unsubscribe function. */
export function subscribeStorageAccess(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Check again, and ask the browser to keep the data while at it: the reader just said they
 * want it kept, which is the moment the persist request is meant for.
 * @returns The new answer
 */
export async function recheckStorageAccess(): Promise<StorageAccess> {
  const state = probeLocalStorage();
  let persistDenied = await readPersistDenied();
  if (state === "ok") {
    try {
      const storage = navigator.storage;
      if (storage?.persist && !(await storage.persisted())) await storage.persist();
      persistDenied = await readPersistDenied();
    } catch {
      // A browser without the API, or one that throws: the write probe is what counts.
    }
  }
  emit({ ...current, state, persistDenied });
  return current;
}

/** Open the storage dialog for one feature's greyed-out control. */
export function requestStorageDialog(feature: string): void {
  getStorageAccess();
  emit({ ...current, dialog: feature });
}

export function closeStorageDialog(): void {
  emit({ ...current, dialog: null });
}

/** Tests only: forget the probe so the next read probes again. */
export function resetStorageAccessForTests(): void {
  current = SERVER;
  probed = false;
  listeners.clear();
}
