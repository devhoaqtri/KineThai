/**
 * An upload that answered with an error may still have gone live: on 2026-11-19 Instagram
 * answered media_publish for posts 11 and 12 with "Application request limit reached" while
 * both carousels went out, and post 12's YouTube Short was live after its upload timed out.
 * Recorded as failed, such a post raises a false alarm and spends a retry that only the
 * look-before-sending guard keeps from posting it twice.
 *
 * So after a failed upload the platform is asked again, a few times a little apart (a new
 * post can take a moment to be listed), and a post it lists is recorded as live. A lookup that
 * cannot be made ends the search: the failure stands, and the next run looks before sending.
 *
 * Exports: findLiveAfterError, LIVE_RECHECK_TRIES, LIVE_RECHECK_WAIT_MS
 */

/** How many times a platform is asked after a failed upload. */
export const LIVE_RECHECK_TRIES = 3;
/** The wait before each of those lookups. */
export const LIVE_RECHECK_WAIT_MS = 15_000;

/**
 * Ask a platform, after a failed upload, whether the post went live anyway.
 * @param find - the lookup (undefined when the platform does not list the post)
 * @param options - tries, wait between them, and the sleep used (tests pass a fake)
 * @returns The live post, or undefined when it never shows or a lookup fails
 */
export async function findLiveAfterError<T>(
  find: () => Promise<T | undefined>,
  options: { tries?: number; waitMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<T | undefined> {
  const tries = options.tries ?? LIVE_RECHECK_TRIES;
  const waitMs = options.waitMs ?? LIVE_RECHECK_WAIT_MS;
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)));
  for (let i = 0; i < tries; i += 1) {
    await sleep(waitMs);
    let live: T | undefined;
    try {
      live = await find();
    } catch {
      return undefined;
    }
    if (live) return live;
  }
  return undefined;
}
