# Handoff: make the first load lighter (main script)

**For:** Lovable · **Written:** 21 November 2026 · **Owner of the measurement:** Claude Code (re-measures the live site after you publish)

## Why

Readers are mostly on phones in Vietnam, often on slow mobile data. Measured on the live site (anh.chayla.app) after the 21 November publish, emulating slow 4G (1.6 Mbps, 150 ms) and a mid-range phone (CPU 4× slower), first visit, empty cache:

| | Now |
|---|---|
| First paint | ~4.6 s (4.6–8.0 across runs) |
| First word on screen | 8.7 s |
| Downloaded before the first word | ~765 KB |

First paint waits for one file: the main script, `/assets/index-*.js`, **753 KB raw / 226 KB gzip**. In the trace it finishes downloading at 4.3 s and the page paints right after it runs. Fonts and the feed's first page only start after it. So the main script is the next thing to shrink: every KB out of it is earlier first paint, earlier fonts, earlier first word.

## What the main script is made of

From `npx vite build --sourcemap && npx tsx scripts/bundle-composition.ts` (bytes before compression):

| Size | What | Needed for a reader's first paint? |
|---|---|---|
| 176.6 KB | react-dom | yes |
| **204 KB** | **Supabase client**: auth-js 95.7, realtime-js 30.3, phoenix 24.5, storage-js 20.9, postgrest-js 15.6, supabase-js 9.4, iceberg-js 5.3, functions-js 2.7 | **no**: reading the feed needs no account |
| 59.9 KB | @tanstack/router-core (+ react-router 17.3, start-client-core 10.0) | yes |
| 53.3 KB | zod | partly (see 4) |
| 32.9 KB | sonner (toasts) | no, not before the first toast |
| 29.6 KB | app `features/demo` (demo seed posts for the old social feed) | **no** |
| 24.9 KB | seroval | yes (router serialization) |
| 24.2 KB | @tanstack/query-core | yes |
| 22.5 KB | app `features/canvas` (palette collection) | yes, cards paint with it |

The reader's own feed code is already split into its own chunks; these are what every page loads before any of it.

## Where it comes from, and what to do

Do these in order; each is independent and shippable on its own.

### 1. Supabase client out of the first load (biggest: ~204 KB raw)

Two static imports put the whole client in the main script:

- **`src/integrations/supabase/auth-attacher.ts`** (your generated file) imports `supabase` from `./client` at the top, and `src/start.ts:71` registers it as the global `functionMiddleware`, so it rides on every page.
  **Do:** make the client import lazy inside the middleware, and skip it when there is nothing to attach. For example:
  ```ts
  export const attachSupabaseAuth = createMiddleware({ type: "function" }).client(
    async ({ next }) => {
      const { supabase } = await import("./client");
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
    },
  );
  ```
  If your generator owns this file, change the generator's template so a regeneration keeps it lazy.
- **`src/routes/_authenticated/route.tsx`** (and `src/routes/_authenticated/me.tsx`) import `supabase` and `@/features/session` (which re-exports `AuthedShell`, itself importing the client) at the top of the route file. Route files are in the main script even when their components are split.
  **Do:** import inside `beforeLoad` / the loader (`const { supabase } = await import("@/integrations/supabase/client")`), and take `AuthedShell` from its own module behind the route's lazy component, not from the `@/features/session` barrel.

`RootApp` (`src/features/shell/components/RootDocument.tsx`) already loads the client lazily for its auth listener; it can stay as it is.

### 2. The old social feed's demo data out of the first load (~30 KB raw)

`src/routes/_authenticated/me.tsx` and the prefetch/query modules it and its siblings reach at the top level (`src/features/social/api/prefetch.ts`, `queries.ts`; `src/features/discovery/api/prefetch.ts`, `queries.ts`) import `features/demo` seed posts and store. **Do:** move those imports into the loaders (dynamic `import()`), so the seed data loads only when an `/_authenticated` route is visited.

### 3. Toasts mounted lazily (~33 KB raw)

`<Toaster>` from sonner is mounted in `RootApp`. **Do:** mount it through `React.lazy` (or after the first idle callback). Components that call `toast()` already live in split chunks, so they bring sonner with them when they load.

### 4. zod at the root (part of ~53 KB raw)

Root-level modules that import zod: `src/lib/error-report.ts` (the error screen's report schema), `src/features/vocabulary/lib/schema.ts`, `src/features/vocabulary/lib/grammar.ts`, `src/features/admin/lib/search-schema.ts`. **Do:** for `lib/error-report.ts`, move `errorReportSchema` into a server-only module (e.g. `src/lib/error-report.schema.ts`) imported by `src/features/shell/api/error-report.server.ts`; the browser only builds and shows the report and needs no schema. Check whether the other three are reached from the root only through route `validateSearch` / loaders; if so, the same move-to-loader approach applies. Leave zod wherever a route really validates on the client.

## Rules that must still hold (from AGENTS.md)

- **Never import `lib/catalog-source` (decks) into a client module.** The build fails if one does (`scripts/deck-guard-plugin.ts`); `npm run check:deck-not-bundled` checks after a build.
- **Export tools stay dev-only** behind `import.meta.env.DEV` (Export Studio, `/export/$code`, `/showcase`, `/carousel/$code`, `/api/dev/carousel`).
- **Fonts and layout:** do not change `src/features/vocabulary/hooks/useFontsReady.ts` or the measured clue layout. Fonts must load before a card mounts because the measured layout steps down and never back up.
- **The error screen and notices stay in the root**: `ErrorComponent`, `NotFoundComponent`, `ReaderNotices`, `UnsupportedBrowserWarning`, `DesktopModeNotice`. They must work when the rest of the app failed to load. They are small; they are not the target.
- **`window.__lovableEvents`** error reporting (`src/lib/lovable-error-reporting.ts`) keeps working.
- Do not touch the rate limits, the bot gates (`src/lib/bot-gate.ts`, `src/lib/bot-signals.ts`), `src/start.ts` middleware order, or `src/server.ts` (HTTPS).

## Done when

1. `npx vite build --sourcemap && npx tsx scripts/bundle-composition.ts` shows **no `@supabase/*` package and no `app features/demo`** in the main script, and its gzip size is **at or under 165 KB** (from 226 KB).
2. `npm run build` passes, then `npm run check:deck-not-bundled`.
3. `npx vitest run` passes (2,258 tests at the time of writing).
4. By hand on the published site:
   - `/feed` loads and plays words without signing in;
   - Google sign-in at `/auth` still works, and a signed-in user reaches `/me`;
   - an `/admin` page still loads for an admin;
   - a server function call made while signed in still carries the bearer token (for example, an admin page that lists data).
5. Publish, then tell Claude Code to re-measure: it reruns the same throttled first-visit measurement against the live site and compares with the table above.

## Out of scope here

- react-dom, the router and query core: needed for any page.
- The reader's own feed chunks (`VocabularyFeedPage-*.js` and its neighbours): a separate pass.
- Fonts: the four handwriting families already load 4 s after the first word (21 Nov), and the three card families are needed for the first word.
