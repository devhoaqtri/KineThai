# Importing a Word Refinery deck

KineMedia's side of the hand-off. **The file format is defined in Word Refinery's
`docs/kinemedia-export.md`** — read that for what arrives and why. This file owns the
other half: what `npm run vocab:import` does with it, the stamp it enforces, and the
guards to run afterwards. Change the format there; change the import behaviour here.

```
word-refinery: npm run export:kinemedia -- word-catalog.sqlite --out vi-deck.json
   ▼  (the file: meta.format "word-refinery.kinemedia-deck", words in deck shape)
KineMedia: npm run vocab:import -- vi-deck.json
   ▼  scripts/import-vocabulary.ts → normalizeDeck → data/catalog.json (atomic)
then the guard sequence below, then rebuild/deploy.
```

## The stamp is enforced

A Word Refinery export carries `meta.format` and `meta.formatVersion`. `normalizeDeck`
alone cannot tell a hand-off from any other deck that happens to fit the schema, so
`scripts/import-vocabulary.ts` checks the stamp first (`assertRefineryFormat`) and refuses
rather than import:

- `meta.format` present and **not** `word-refinery.kinemedia-deck` → refused.
- `meta.formatVersion` **above** the `REFINERY_FORMAT_VERSION` this importer knows → refused
  (a newer version could be a shape the schema parses but the reader misreads silently).
- **No** `meta.format` → an ordinary hand-authored deck (the `docs/Batches` files, a
  library export); it imports exactly as before. The stamp only ever gates a hand-off.

`REFINERY_FORMAT` and `REFINERY_FORMAT_VERSION` live at the top of `import-vocabulary.ts`
and mirror the two constants in Word Refinery's `src/lib/kinemedia-export.ts`. Bumping the
version is a two-repo change: raise it there, teach this importer the new shape, then raise
it here.

## What the import does

`scripts/import-vocabulary.ts` (the same script every deck uses):

- **Validates before writing.** `normalizeDeck` throws on a duplicate id, a duplicate
  headword, a leaked English answer in `anticipateVi`, or a malformed field. Nothing is
  written unless the whole deck parses.
- **Recomputes the derived fields.** `chars` and `initial` are `[DERIVED]`: the importer
  sets both from the headword, so the export deliberately omits them (a file must not claim
  values that get overwritten). Ids are lower-cased; the headword keeps its case.
- **Writes atomically.** Temp file + `rename`, so a failed import leaves the previous file
  intact. Each write stamps a `revision` (a sha256 of the normalized catalog) that
  pagination is keyed on.
- **Lands where the flags say.** Default rewrites the base `data/catalog.json`.
  `--pack <name>` compiles `data/packs/<name>.json`; add `--staged` to put it in
  `data/packs/incoming/` (embedded and validated but **not** served, because the loader
  globs `data/packs/*.json` non-recursively — moving it up one level and rebuilding is the
  whole activation). `--locale <code>` routes to `data/<code>/`, a deck served only on that
  language's domain. The feed merges `catalog.json` with every pack at load time; on a
  shared id or headword the admin-editable base wins.

The import does **not** assign share codes, require glosses, or check layout — those are
the guards below, and they are why a clean import is not yet a shippable deck.

## Run these afterwards, in order

```bash
npm run vocab:import -- vi-deck.json     # normalizeDeck rebuilds catalog.json (above)
npx tsx scripts/assign-share-codes.ts    # every published word needs a shareCode; append-only
npm run check:share-codes                # codes unique per deck, stable against the ledger
npm run check:meanings                   # meaningVi present on every published English word
npm run check:word-joiners               # _ = | marks survive; nothing strips them
npm run check:emphasis-runs              # inline /…/ highlights render as one run per group
npm run check:text-pagination            # the splitter obeys its phrase-edge rules
npm run check:deck-pages                 # the real paginator over the real deck: no stray scene
```

- `assign-share-codes` is **append-only**: a word that already has a code keeps it, and an
  issued code is never recycled, because `/w/K7F` travels in chat and must keep meaning the
  same word. Run it before `check:share-codes`, which fails on any published word without
  one.
- `check:meanings` requires `meaningVi` on published English words; the export carries it,
  so a failure here means a card left the refinery without one.
- The last four are the layout guards the inline marks depend on. They read the deck as
  shipped, so run them on the imported file, not on the export in isolation.

Then `npm test`, and rebuild/deploy to publish.

## Not yet decided

The Japanese deck has no home here: `TargetLocale` is the language of the word being
**taught** and the UI is Vietnamese by design, so English-headword/Japanese-gloss cards
have nowhere to go without a new reader-language axis. Export Vietnamese only until that is
a product decision (Word Refinery's plan, Gap 2). The gloss-namespaced ids (`vi-…`, `ja-…`)
are what keep the two decks from colliding whenever it is resolved.
