/**
 * The shared answer to "may this site keep data?", re-rendering whatever reads it when the
 * answer changes (a "Thử lại" that worked, the reader coming back after changing a setting).
 * The server and the first client render assume storage works, so nothing is greyed out
 * before hydration; the real answer arrives on the next render.
 *
 * Exports: useStorageAccess
 * Depends on: React, @/lib/storage-access
 */

import { useSyncExternalStore } from "react";
import {
  getServerStorageAccess,
  getStorageAccess,
  subscribeStorageAccess,
  type StorageAccess,
} from "@/lib/storage-access";

/** @returns What the browser allows, and which feature's storage dialog is open. */
export function useStorageAccess(): StorageAccess {
  return useSyncExternalStore(subscribeStorageAccess, getStorageAccess, getServerStorageAccess);
}
