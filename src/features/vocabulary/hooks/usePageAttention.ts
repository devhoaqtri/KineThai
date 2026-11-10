/**
 * Whether the reader can see the feed right now, as React state (lib/page-attention).
 *
 * Exports: usePageAttention
 * Depends on: React, ../lib/page-attention
 */

import { useSyncExternalStore } from "react";
import { pageAttention } from "../lib/page-attention";

const subscribe = (listener: () => void) => pageAttention().subscribe(listener);
const getSnapshot = () => pageAttention().attended();
// The server renders a page someone is about to look at.
const getServerSnapshot = () => true;

/** @returns True while the page is in view, unfrozen and (on a phone) holding focus. */
export function usePageAttention(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
