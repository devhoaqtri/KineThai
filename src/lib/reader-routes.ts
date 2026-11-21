/**
 * The site serves the vocabulary reader and nothing else.
 *
 * The codebase still carries an experimental social network (community feed, posts,
 * profiles, follows, notifications, the creator studio) and Google sign-in for it. None of
 * it is part of the reader's experience, and some of its server functions read posts and
 * profiles with the service-role key, so it is switched off at both ends:
 * - pages: only READER_PAGES (plus the PIN-gated admin) answer; everything else is a 404
 *   from the root route, on a full load and on in-app navigation alike;
 * - server functions: every social and account function refuses on the server
 *   (lib/account-features, accountFeaturesGate), so calling one directly does nothing.
 *
 * Dev-only tools (labs, export, carousel, posting) keep their own import.meta.env.DEV gates
 * and stay reachable under `npm run dev`. Switching the social side back on is setting
 * ACCOUNT_FEATURES_ENABLED = true, after a security review of its server functions.
 *
 * Exports: ACCOUNT_FEATURES_ENABLED, READER_PAGES, DEV_TOOL_PAGES, isAllowedPage
 * Depends on: none (leaf module)
 */

/** The social network, its sign-in and the creator studio. Off: see the header. */
export const ACCOUNT_FEATURES_ENABLED = false;

/** Pages of the reader's experience, plus the owner's PIN-gated admin. */
export const READER_PAGES: readonly RegExp[] = [
  /^\/$/,
  /^\/feed(\/(about|library|saved))?\/?$/,
  /^\/w\/[^/]+\/?$/,
  /^\/privacy\/?$/,
  /^\/terms\/?$/,
  /^\/robots\.txt$/,
  /^\/sitemap\.xml$/,
  /^\/admin(\/.*)?$/,
  /^\/admin-access-denied\/?$/,
];

/** Local tools, each also gated by import.meta.env.DEV in its own route. */
export const DEV_TOOL_PAGES: readonly RegExp[] = [
  /^\/(badge-lab|burst-lab|tiktok-lab|showcase|posting)\/?$/,
  /^\/(export|carousel)\/[^/]+\/?$/,
];

/** The social side's pages, open only while ACCOUNT_FEATURES_ENABLED. */
const ACCOUNT_PAGES: readonly RegExp[] = [
  /^\/(auth|about|community|create|discover|edit-profile|me|notifications|settings)\/?$/,
  /^\/(p|u)\/[^/]+\/?$/,
];

/**
 * Whether a page may be served.
 * @param pathname - the URL path
 * @param dev - running under `npm run dev`
 * @pure true
 */
export function isAllowedPage(pathname: string, dev = false): boolean {
  const matches = (list: readonly RegExp[]) => list.some((pattern) => pattern.test(pathname));
  if (matches(READER_PAGES)) return true;
  if (dev && matches(DEV_TOOL_PAGES)) return true;
  return ACCOUNT_FEATURES_ENABLED && matches(ACCOUNT_PAGES);
}
