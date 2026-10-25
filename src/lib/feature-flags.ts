/**
 * Feature flags — temporary vocab-only mode.
 *
 * When VOCAB_ONLY_MODE is true:
 *  - Home feed (getFeed) + Discover (getDiscover) only show vocabulary bot posts
 *    (do_chu_bot / wordcrawler deck). Other scheduled posts are paused at the
 *    DB layer (migration 20260723000000...), and existing non-vocab posts are
 *    hidden at the app layer here — no rows are deleted.
 *
 * To revert to full feed: set VOCAB_ONLY_MODE = false and re-activate the
 * other bot_agents (see bottom of that migration for the 2 SQL lines).
 */
export const VOCAB_ONLY_MODE = true;

/** Profile id of the vocabulary bot (do_chu_bot). Matches migration 20260621083000... */
export const VOCAB_BOT_PROFILE_ID = "77777777-7777-4777-8777-777777777777";

/** Return true if a post looks like a vocabulary reveal (duck-typing for safety). */
export function isVocabularyPost(post: { author_id: string; canvas_html: string }): boolean {
  if (post.author_id === VOCAB_BOT_PROFILE_ID) return true;
  // Fallback: legacy vocab posts are identified by the two hint substrings.
  // Keep in sync with public.vocabulary_reveal_word_from_canvas().
  const html = post.canvas_html ?? "";
  return html.includes("Từ này bắt đầu bằng chữ") && html.includes("Cả từ gồm");
}

/**
 * The social community feed is not open to readers yet, so its two entry points are
 * hidden: the shell menu item in `features/session/components/AuthedShell.tsx` and the
 * "Cộng đồng" link in the vocabulary option sheet (`FeedControls.tsx`).
 *
 * Only the buttons are gated. The `/community` route stays mounted so an old shared
 * link or a bookmark still resolves, and `useStudioPublish` still lands on it after a
 * post is published.
 *
 * To bring the buttons back: set COMMUNITY_AVAILABLE = true.
 */
export const COMMUNITY_AVAILABLE = false;

/**
 * The ecosystem store page lists every sibling app with screenshots and copy,
 * but those apps are not public yet, so the tile that opens it is hidden and the
 * app panel ends with a "more are coming" footer instead. (The Settings tile
 * that once stood in for it is gone for good: the options sheet has its own
 * permanent corner button on the toolbar.)
 *
 * Only the tile is gated. The `/store` route stays mounted, so a direct link
 * still resolves and the page can be reviewed before it is announced.
 *
 * To bring the tile back: set ECOSYSTEM_STORE_AVAILABLE = true.
 */
export const ECOSYSTEM_STORE_AVAILABLE = false;

/**
 * The word library's curated packs are placeholder metadata — every one is marked
 * "Sắp có" and none can be opened yet — so the shelves are hidden and the page is used
 * only to upload a reader's own pack (ImportPackPanel).
 *
 * Only the shelves are gated. The pack data in `features/vocabulary/lib/library.ts`
 * and the `/feed/library` route stay as they are.
 *
 * To bring the shelves back: set LIBRARY_PACKS_AVAILABLE = true.
 */
export const LIBRARY_PACKS_AVAILABLE = false;
