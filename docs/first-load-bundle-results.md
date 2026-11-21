# First-load bundle work: verification and re-measurement

## Implemented

- A project-owned lazy bearer attacher replaces the generated static attacher at the same position in `src/start.ts`. Generated files remain unchanged. It checks the client's own storage, including the editor broker, before loading the SDK; unknown/blocked storage falls back to the SDK. Signed-in calls still use `getSession()` for the bearer token.
- The protected layout and `/me` import the account client only inside their guards. The shell and sign-in view load from their own modules instead of the session barrel.
- Social/discovery query and prefetch paths load demo data only in their demo branches. Root-reachable session helpers use leaf modules instead of the component barrel.
- The root toast host uses React.lazy and Suspense. Root error screens, reader notices, unsupported-browser warning, and desktop notice stay in place.
- Error-report validation lives in `error-report.schema.server.ts`; the browser report builder and its type no longer import zod. The existing clipping/validation tests pass unchanged.
- Other root zod uses remain where client validation really occurs: admin URL search validation and dev export/carousel/showcase search validators. No measured text, fonts, deck content, security gates, limits, HTTPS handling, or middleware order was changed.

## Build regression guard

`scripts/first-load-guard.ts` checks the actual emitted main script during builds, with no public source maps:

- Rejects rendered `@supabase/*` modules and old `features/demo` modules in the main entry.
- Prints raw and gzip byte counts.
- Rejects a production entry over **168,960 bytes (165 KiB) gzip**.
- Development builds report size but do not enforce the production ceiling, because they intentionally retain local export/lab tools.

The existing deck/export build guard remains enabled. This is additional protection, not a replacement for `check:deck-not-bundled`.

## Verified on 21 November 2026

- Full Vitest suite: **132 files, 2,281 tests passed**.
- Latest automatic preview build check: **build OK**.
- Phone viewport, fresh browser: `/feed` mounts and plays its first-visit words without signing in.
- `/auth` loads its Google button; completing external Google authorization was not exercised.
- A real temporary Cloud member session opens `/me`, redirects to its own profile, and displays that profile after its data loads.
- Signed-in discovery requests carry a bearer token and read live data through the UI.
- The admin PIN form unlocks `/admin`; the dashboard reads live status and counts.
- No page errors occurred in these checks.

## Publishing and remaining proof

Publishing was requested for `https://vibrant-type-flow.lovable.app`, which also serves the language domains. Scheduling is not deployment confirmation.

The live phone-browser check at `anh.chayla.app` still received the previous main entry, `index-CWupxl0x.js`: **773,401 raw bytes / 229,134 gzip bytes**. It still contains the account SDK and is not evidence of the new deployment. It rendered words with the correct domain title and no page errors. Default headless/CLI identities receive the existing metadata-only bot response; normal mobile-browser emulation was needed, without changing the app's protection.

The automatic build's output files are not available in this checkout, so the source-map composition command and the deeper fingerprint command have not been run against the new production files. Do not call the 165 KiB goal achieved until the new entry is measured.

## Claude Code re-measurement handoff

After the new entry is live, repeat the handoff's empty-cache slow-4G measurement (1.6 Mbps, 150 ms latency, CPU 4× slowdown), using a normal mobile-browser identity:

1. Record the new main entry URL, raw/gzip bytes, first paint, first word, and bytes downloaded before that word.
2. Confirm no account SDK or old social demo modules are rendered in that entry. The production build guard must pass.
3. Run `check:deck-not-bundled` against the same production output; build source maps locally for `scripts/bundle-composition.ts` if module-level attribution is needed.
4. Compare with the original 226 KiB gzip, ~4.6 s first paint, 8.7 s first word, and ~765 KiB before the first word.
5. An account holder must complete Google sign-in on the live site, then open `/me`; confirm the existing admin flow and signed-in bearer request there as well.
## Claude Code re-measurement, 22 November 2026

**Main script: done.** Local production build of `5972395`: **469,783 raw / 148,779 gzip bytes** (was 226 KB gzip), no `@supabase/*` or `features/demo` in it, build guard and `check:deck-not-bundled` pass, 133 test files / 2,287 tests pass. The live entry (`index-D64JBz50.js`, 475,412 raw bytes) is the new build.

**Live, slow 4G (1.6 Mbps, 150 ms) and CPU 4×, empty cache, three runs:**

| | Before (21 Nov) | After this work |
|---|---|---|
| First paint | ~4.6 s | 4.3 s (4.2–5.2) |
| First word | 8.7 s | 7.9 s (5.3–8.0) |
| Downloaded before the first word | ~765 KB | 755–838 KB |

**Why the bytes did not drop: the account client still reached every reader.** It left the main script but was fetched about 3 s in by every reader (`index-CCQ0dwpp.js`, 53 KB gzip), on the same network path as the first feed page and the card fonts. Three routes led to it, all fixed in the commit after this note:

1. **A static chain the guard cannot see.** The feed's player code imports `lib/post-media.ts`. The demo seed posts imported it too (for `DEMO_STATUS_PHOTOS`), so the bundler put `post-media` and the whole seed into one shared chunk (`comments-*.js`), which the feed loads statically. And `features/demo/seed/profiles.ts` imported `DEMO_AUTH_USER_ID` from the `@/features/session` **barrel**, which re-exports `AuthPage`, which imports the client. Fixed: the seed photos moved to `features/demo/seed/photos.ts`, and `profiles.ts` imports from `@/features/session/demo-session`.
2. **`RootApp`'s auth listener** (`shell/components/RootDocument.tsx`) imported the client whenever Supabase was configured, i.e. always. Fixed: it loads only through `shouldLoadAuthClient()` (`lib/lazy-auth.ts`): a stored session, or a sign-in returning in the URL (`access_token`, `code`, `error`… which `routes/index.tsx` keeps on its way to `/feed`).
3. **`useIsAdmin`** (the feed's export button, via `useCanExport`) imported the client to ask for the session. Fixed: it returns false without a stored session (`hasStoredAuthSession()`).

**Rule for next time:** never import from the `@/features/session` barrel outside the session feature; use its leaf modules (`demo-session`, `data-mode`). The first-load guard checks the main script only. A shared chunk the feed loads statically can still carry the client, so check the static closure, not just the entry: after `npx vite build`, the feed's static imports from `index-*.js` and `VocabularyFeedPage-*.js` must not reach the chunk containing `supabase-js`.

**Still to confirm after the next publish:** that new readers download no Supabase chunk at all (expected: about 210 KB raw / 53 KB gzip off the first word's path), and a real Google sign-in on the live site, including the redirect return through `/` → `/feed`.
