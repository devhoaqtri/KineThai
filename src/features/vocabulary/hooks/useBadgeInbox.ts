/**
 * The badge to celebrate right now, kept in step with the on-device inbox.
 *
 * Read after mount, not during it: the inbox only exists in the browser, so reading it
 * while rendering would disagree with the server's markup.
 *
 * Exports: useBadgeInbox
 * Depends on: React, ../lib/badge-inbox
 */

import { useCallback, useEffect, useState } from "react";
import {
  BADGE_INBOX_EVENT,
  BADGE_INBOX_KEY,
  nextBadge,
  readBadgeInbox,
  removeBadge,
  type InboxBadge,
} from "../lib/badge-inbox";

/** @returns The badge to show, or null, and the call that says it has been shown. */
export function useBadgeInbox(): { current: InboxBadge | null; dismiss: () => void } {
  const [inbox, setInbox] = useState<InboxBadge[]>([]);
  useEffect(() => {
    const refresh = () => setInbox(readBadgeInbox());
    const onStorage = (event: StorageEvent) => {
      if (event.key === BADGE_INBOX_KEY) refresh();
    };
    refresh();
    window.addEventListener("storage", onStorage);
    window.addEventListener(BADGE_INBOX_EVENT, refresh);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(BADGE_INBOX_EVENT, refresh);
    };
  }, []);
  // Read fresh so this stays one stable function: the celebration's close timer hangs on it.
  const dismiss = useCallback(() => {
    const shown = nextBadge(readBadgeInbox());
    if (shown) removeBadge(shown);
  }, []);
  return { current: nextBadge(inbox), dismiss };
}
