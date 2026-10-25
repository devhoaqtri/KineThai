/**
 * The reader's imported packs and which one is playing, kept in sync with every change:
 * this tab's (CUSTOM_PACKS_EVENT) and another tab's (the storage event).
 *
 * Exports: useCustomPacks
 * Depends on: React, ../lib/custom-pack
 */

import { useEffect, useState } from "react";
import { CUSTOM_PACKS_EVENT, readPackLibrary, type PackLibrary } from "../lib/custom-pack";

/** @returns The library: packs newest first, and the active pack's id or null */
export function useCustomPacks(): PackLibrary {
  const [library, setLibrary] = useState<PackLibrary>(() => readPackLibrary());
  useEffect(() => {
    const refresh = () => setLibrary(readPackLibrary());
    refresh();
    window.addEventListener(CUSTOM_PACKS_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(CUSTOM_PACKS_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return library;
}
