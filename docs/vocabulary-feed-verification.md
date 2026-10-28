# Vocabulary feed verification handoff

## Status and scope

Implementation is ready for independent verification, **not verified for release**. At the user's request, the implementing agent did not run typechecking, lint, builds, test scripts, browser sessions, accessibility checks, or performance benchmarks.

Implementation-only commands executed:

- Imported the supplied WordCrawler file into the bundled catalog (25 distinct entries, revision `f8334fe45566bf31df91134d`). This performed the importer's required input validation; it was not a test-suite run.
- Regenerated TanStack route types, retaining the TanStack Start registration footer.
- Formatted the changed source files with Prettier.

The user approved **25 starter words**, not a fabricated large dictionary. The feed repeats after complete shuffled cycles. Larger real decks must be supplied/imported separately. Themes and styles do not count as additional vocabulary.

Do not deploy, commit, trigger vocabulary-refill jobs, modify live databases, or publish test content to real accounts as part of this handoff. Use demo mode or an isolated, approved test environment for social mutations. Keep credentials out of screenshots and reports.

## Architecture and changed behavior

| Area                 | Location / behavior                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Default entry        | `src/routes/index.tsx`: `/` redirects to public `/feed`, preserving callback query/hash parameters                                   |
| Public UI            | `src/routes/feed.tsx`, `src/features/vocabulary/components/`: client-rendered vocabulary feed, no auth loader                        |
| Existing social feed | `src/routes/_authenticated/community.tsx`: original authenticated feed and prefetch, now at `/community`                             |
| Public HTTP endpoint | `src/routes/api/public/vocabulary.ts`, `src/features/vocabulary/api/endpoint.server.ts`                                              |
| Catalog / ordering   | `src/features/vocabulary/api/catalog.server.ts`, `lib/random.ts`                                                                     |
| Import contract      | `src/features/vocabulary/lib/schema.ts`, `scripts/import-vocabulary.ts`                                                              |
| Compiled data        | `src/features/vocabulary/data/catalog.json`, imported only through the server module                                                 |
| Browser data loading | `api/feed.ts`, `hooks/useVocabularyFeed.ts`, `hooks/useFeedPagination.ts`                                                            |
| Virtual scrolling    | `hooks/useVocabularyWindow.ts`: retained-window rebasing, fixed-height TanStack Virtual rows                                         |
| Cards and playback   | `lib/stages.ts`, `lib/presets.ts`, `hooks/useLearningPlayback.ts`, `components/VocabularyCard.tsx`, `components/VocabularyStage.tsx` |
| Presentation         | `src/features/vocabulary/vocabulary.css`: eight color themes, four motion/narrative presets, mobile layout                           |
| Auth integration     | `RootDocument.tsx`: optional failure-safe subscription; excludes vocabulary queries from auth-triggered refetches                    |
| Navigation           | `AuthedShell.tsx`, `AuthPage.tsx`, `useStudioPublish.ts`: public vocabulary links and community publication destination              |

The content-hub source deck, cron jobs, refill endpoint, database tables, existing post IDs, and social mutations remain unchanged. `VOCAB_ONLY_MODE` still controls the existing community/discovery behavior; it does not control the new public catalog. The community feed retains its existing finite/ranked behavior. New vocabulary occurrences are not social posts and have no fake likes, comments, authors, or timestamps.

### Stream invariants

- A seed identifies the mounted browsing session. Shuffle and filter changes create new streams at position zero. A new visit starts fresh; this feature does not persist learning progress across reloads.
- Word IDs identify dictionary entries. Occurrence IDs identify positions within a seeded, filtered, versioned stream.
- Seeded Fisher–Yates permutations cover every matching word before repeating. For three or more matches, a first-two swap prevents a repeat at cycle boundaries without changing the previous cycle's last word.
- A two-word pool must keep alternating; a one-word pool necessarily repeats. Empty filters yield an empty state, not a request loop.
- Default pages contain 12 entries; ten retained query pages mean at most 120 retained stream entries. The parent holds one metadata page, and the virtualizer renders only nearby cards (normally about five to six), plus at most one active occurrence pinned during scroll rebasing.
- Old query data is garbage-collected when the stream unmounts. Scroll coordinates are rebased on page eviction/prepend instead of growing indefinitely.
- Server caches are bounded to 16 filtered index pools and eight raw permutations, stored as `Uint32Array`s. The catalog itself is loaded once per server instance.
- Clues default to manual navigation. Autoplay is opt-in, stops at reveal, and pauses offscreen, behind open options, or in a hidden tab. Reduced motion uses static text and disables autoplay.
- Leaving the virtual window can reset that occurrence's clue progress when it remounts. The word order and appearance remain deterministic.
- Always-on means independent of scheduled publication, AI keys, and Supabase uptime. It does not promise offline cold starts or hosting availability.

## Environment and execution order

Use the existing npm installation/lockfile. The import command requires Node with built-in TypeScript stripping (Node 22.6+ or a current supported Node version). Public vocabulary needs no Supabase or AI credentials. Existing live social features still require their normal configuration.

Run the following and report each exit status independently. **All checks below are NOT RUN by the implementer.**

```sh
npm run typecheck
npm run lint
npm run build
npx --yes tsx scripts/check-text-pagination.ts
npx --yes tsx scripts/check-text-emphasis.ts
npx --yes tsx scripts/check-vietnamese-line-fit.ts
```

The existing text scripts use TSX/extensionless imports and document `tsx` as their runner. It may need to be acquired separately if it is unavailable locally; report that dependency requirement rather than silently skipping checks.

`npm run check:gradients` is a separate **read-only Supabase-backed** check over stored social posts. Run it only against an approved environment with the appropriate public configuration. Its lack of credentials is not a public-vocabulary regression, and it does not validate the new preset contrast by itself.

After static checks, start `npm run dev` for browser testing, then exercise a production build using the project's supported preview/runtime. Verify both dev and production because server-only route handling and catalog exclusion from client bundles depend on the TanStack build transform.

There were pre-existing uncommitted typography edits in these paths before implementation:

- `scripts/check-vietnamese-line-fit.ts`
- `src/features/kinetic-text/components/{KineticText,VietnameseLineBlock,WordRenderer}.tsx`
- `src/features/kinetic-text/lib/text-language/{page-metrics,vietnamese-phrases}.ts`
- `src/features/post-player/components/{WordSequenceLines,WordSequenceWord}.tsx`

Those changes were left untouched. `.commandcode/` and `STAFF_REVIEW.md` were also already untracked. Do not overwrite them or attribute their existing failures to this task without evidence.

## Catalog import tests

Run destructive/fixture imports only in an isolated disposable copy of the project. The import command **replaces the compiled vocabulary catalog** after full validation; it does not merge decks or change the content-hub source file.

```sh
npm run vocab:import -- "/absolute/path/to/wordcrawler-deck.json"
```

Contract:

- Root object: `words` array, optional `meta` object with a name.
- Required per record: `id`, `word`, `defVi`.
- Optional: `leadVi`, `anticipateVi`, `ipa`, `pos`, `topic`, `level`, `style`, `usage: [{ en, vi }]`, `chars`, `initial`.
- IDs: 1–80 ASCII letters/digits/underscore/hyphen. Words: 2–64 ASCII letters with internal apostrophes/hyphens allowed, but no spaces/digits. Multiword expressions are not supported in this version.
- Levels, when supplied: A1, A2, B1, B2, C1, C2. Styles: detective, speed, confession, minimal.
- Topic slugs: lowercase letters/digits/hyphens, up to 60 characters; omitted/empty topics normalize to `general`.
- Definitions: up to 400 characters; leads 240; anticipation 180; IPA 120; POS 40. Up to five example pairs, each string up to 400 characters.
- IDs normalize to lowercase; headwords keep their authored case (German nouns stay capitalised) and duplicates are caught case-insensitively; curly apostrophes in the word normalize to straight apostrophes. Vietnamese source wording/accents remain intact. Letter counts and initials are recomputed rather than trusting supplied values.
- Maximum input: 100 MiB and 100,000 records. Empty decks, duplicate words/IDs, invalid fields, and target-word leakage in anticipation reject the entire import.
- Optional stages disappear when their source content is absent. No machine-generated definitions/examples are fabricated.

Cases to add as focused tests:

1. Import the starter deck; assert 25 unique entries, expected topics/levels, and unchanged Vietnamese strings/IPA/examples.
2. Reimport identical content; expect the same revision. Change a definition; expect a different revision.
3. Mixed-case duplicate words and IDs, malformed JSON, invalid levels, numeric/blank words, missing definitions, excessive examples, and oversized values must fail with record-specific errors.
4. Supply deliberately wrong `chars`/`initial`; verify recomputation, including apostrophes/hyphens.
5. Put the target in anticipation with case/punctuation variations; expect rejection. Ensure incidental substrings inside another word are not incorrectly treated as the full answer.
6. Fail an import and compare the previous compiled catalog byte-for-byte: it must remain intact. Atomic writes use a neighboring temporary file; incomplete `.tmp` artifacts are ignored by Git and must never be deployed as the catalog.
7. Exercise omitted optional fields, single-word/two-word decks, and a syntactically valid large fixture. Keep fake entries explicitly labeled as fixtures and out of the shipped catalog.

Deployment: the compiled JSON is committed/deployed with the application; runtime does not read a Downloads path or call the importer. Rebuild/redeploy after real catalog updates. No migration or AI configuration is needed. Check the target host's bundle limits against the actual future large deck.

## API verification

Example anonymous request:

```text
GET /api/public/vocabulary?seed=verification1234&position=0&limit=12
```

Subsequent requests reuse the seed, topic, level, page size, and returned revision, with the returned `nextPosition` or `previousPosition`.

Parameters:

- `seed`: required, 8–64 ASCII letters/digits/underscore/hyphen.
- `position`: unsigned decimal integer, default zero, at most 1,000,000,000,000. It must be divisible by `limit` so previous/next pages stay contiguous.
- `limit`: unsigned decimal integer, 1–24, default 12. Keep it fixed within a stream.
- `revision`: optional on the first page, otherwise the returned 24-character lowercase hexadecimal revision.
- `topic`: optional known topic slug; an unknown syntactically valid slug yields no matches.
- `level`: optional supported CEFR level or empty.
- Unknown parameters and query strings longer than 512 characters are rejected.

Success response: `entries` (each has `word`, `position`, `cycle`, `occurrenceId`), `seed`, `revision`, `position`, `previousPosition`, `nextPosition`, `total`, `matching`, `name`, `topics`, and `levels`. Errors are JSON with a stable `code` and readable `error`: 400 `INVALID_REQUEST`, 409 `CATALOG_CHANGED`, or 503 `UNAVAILABLE`. Responses use `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`.

Assertions:

- No cookie, bearer token, service-role key, or AI key is required; requests do not write posts or enqueue content.
- Same seed/revision/filters/cursor returns identical words, occurrence IDs, and ordering after retries and server-cache eviction.
- Fetch across many 25-word boundaries (not just 12-entry page boundaries). Each full cycle has 25 unique words. Adjacent cycle boundary words differ whenever matching count exceeds one.
- Different seeds produce different permutations across a representative sample; do not assert that every pair of short pages differs.
- Follow previous cursors after ten-page eviction; pages must match their earlier responses.
- Test every topic/level intersection, empty pools, one-word pools, and two-word pools. Empty pools return no continuation cursors.
- Reject missing/short/oversized seeds; fractional, negative, exponential, nonnumeric, unaligned, or oversized positions; limits zero/25; malformed revisions; invalid levels.
- Use a valid-but-old revision and confirm 409 with no mixed-deck continuation. The UI must require an explicit restart.
- Inspect boundary arithmetic near the position cap. The UI offers a fresh shuffle when no further cursor exists; it must not request an overflowing cursor.
- Error responses must not expose environment variables, file paths, stack traces, or private data.

## Browser and integration scenarios

1. Fresh private window: `/` leads to `/feed` without an auth/demo prompt. First card loads automatically. Repeat by directly opening `/feed`.
2. Public-only environment: remove/unset Supabase and AI configuration in an isolated launch environment; also test with unreachable Supabase while configured. The feed must continue working without auth-related unhandled failures.
3. Storage denied: block local/session storage. Vocabulary itself must still work; it has no storage dependency. Record unrelated auth SDK failures separately.
4. Scroll at least 500 cards, slowly and with rapid wheel/touch gestures. Check that the stream passes 25, 60, and 120 entries and never becomes a finite list.
5. Cross both eviction directions repeatedly: advance beyond 120, then scroll back into removed pages. Record active occurrence and clue/reveal stage before/after fetches; the visible retained card must stay mounted through rebasing without losing its stage. Check for duplicate cards, blank windows, unexpected jumps, or oscillating forward/backward prefetch loops. Include delayed responses followed by rapid direction reversals.
6. Click next/previous word buttons and use ArrowUp/ArrowDown/PageUp/PageDown while the feed is focused. Selects and buttons must keep their normal keyboard behavior.
7. Change topic/level rapidly with delayed network responses. Requests from abandoned streams must be canceled and must never populate the current stream.
8. Shuffle resets the stream. Theme/style changes retain the active word/order. A new visit can have a new seed; persistent back-button learning progress is not promised.
9. Slow/failed first request: show a useful error/retry instead of an infinite spinner. Fail a next/previous request: retain loaded cards and provide Retry. Restore connectivity and confirm recovery without duplicate requests.
10. Change the deployed catalog revision while a stream is open (local test deployment only): cached cards remain usable, a 409 shows a restart prompt, and Restart begins at zero with the new revision.
11. Test 320px mobile width, common phone sizes, tablet/desktop, short landscape, browser zoom, and orientation changes. Keep the same occurrence anchored during viewport resizing.
12. Confirm wheel/swipe gestures over the card text continue the feed when the inner text has reached its scroll boundary. Long reveal/example sections must remain readable and scrollable.
13. Options panel: labeled controls, visible focus, Escape/back-to-words closes it and restores focus, and behind-panel playback pauses.
14. Reduced motion: no kinetic/loop animations and no automatic clue advancement. Hidden tab/offscreen cards must stop timers/animation. Default mode must never advance clues without user input.
15. Accessibility tree: only the active card is interactive; no unrevealed answer in labels, hidden detail nodes, or live announcements. Reading order and per-language pronunciation should be sensible. The educational API does contain answers; this is not a secure quiz/exam mechanism.
16. With demo mode: open `/community`, like/comment, create a post, and confirm publication navigates to community with refreshed data. Verify discover/profile/settings/permalinks remain usable.
17. With an approved test account: verify login/logout and OAuth callback handling through `/`, then community access. Unauthenticated direct access to protected routes must still require auth; no RLS or mutation protection should have been weakened.

## Content and visual inspection

Inspect all 25 supplied words, not just the first page. Expected full flow when optional fields exist:

1. Original Vietnamese lead.
2. Vietnamese definition.
3. Computed letter count.
4. English example with the target masked, plus Vietnamese example translation when supplied.
5. Initial-letter hint.
6. Original Vietnamese anticipation without the answer.
7. English word, optional IPA/POS, definition, and completed example pairs.

Check previous/next clue, early Reveal, Replay, and optional autoplay. Verify no supplied blank remains in completed usage, no target leaks before reveal, and no supplied wording/diacritic is altered. Include long words, punctuation, Vietnamese bound phrases, and long optional examples. Pronunciation and part of speech must not create extra clue stages.

Exercise all eight themes (Aurora, Ocean, Sunrise, Orchid, Mint, Ember, Paper, Indigo) and four styles (detective, speed, confession, minimal), including all 32 combinations on representative cards. Check text/accent/button contrast, reduced-motion static rendering, safe areas, long-word fitting, and clipping at mobile sizes. Single screenshots do not establish contrast or timing correctness.

## Scale and bundle checks

In a disposable local copy, import a clearly labeled 10,000-entry fixture with unique alphabetic synthetic words, valid Vietnamese placeholder definitions, and several topics/levels. Do not represent this fixture as a real learning catalog or leave it in release artifacts.

Measure/report:

- First-page and subsequent-page latency, including cold start, new seeds, filtered requests, and cache churn. Set and state a device/runtime-specific acceptance budget before concluding performance is acceptable.
- Client JS and network payloads: the complete `features/vocabulary/data/catalog.json` module must be absent from browser bundles. A single word string can also occur in pre-existing demo data; that alone is not evidence of a catalog leak.
- Retained query pages capped at ten, no abandoned-stream cache growth after repeated shuffles, mounted card count roughly bounded by viewport plus overscan, and no unbounded DOM/spacer growth after 1,000+ scrolls.
- Heap before/after long browsing, options toggling, backward pagination, viewport resize, and repeated stream changes. Use DevTools with comparable GC conditions and report trends, not one heap reading.
- Only active-card animation work and opt-in timers; no ongoing playback in background tabs.
- Server cache size caps and actual deployment artifact size versus the target runtime's limits. The schema's 100,000-record ceiling is not a claim of benchmarked production capacity.

## Report template

```text
Environment / commit or working-tree identity:
Catalog revision / real entry count:
Commands run and exit codes:
New focused tests added and results:
Anonymous/public-only results:
Pagination and cycle-boundary evidence:
Eviction/backward-scroll evidence:
Auth/demo/social regression results:
Screenshots (viewport + theme/style + stage):
Accessibility and reduced-motion findings:
Bundle / latency / heap measurements:
Pre-existing failures (with evidence):
New defects (reproduction + impact + affected files):
Unexecuted checks and blockers:
Release recommendation:
```

Block release for broken anonymous access, production build/type failures introduced by this work, catalog leakage into client bundles, incorrect cycle uniqueness, eviction-induced scroll jumps/loops, unbounded memory growth, inaccessible/clipped content, early answer leakage, or auth regressions. Clearly distinguish confirmed defects from hypotheses and checks that could not be executed.
