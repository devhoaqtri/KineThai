# Remaining English highlight corrections

All 149 fields remaining after the initial pass were reviewed and corrected on
2026-11-07. The served English packs now have zero fields rejected by the highlight
scanner. Changes are confined to those fields and each affected pack's revision.

`scripts/data/highlight-review-fixes.json` records the word, field, previous text,
approved replacement and chosen highlight. It is tracked source, unlike `logs/`.
Use this record to update the corresponding Word Refinery source batches by
headword and field, checking the previous text before replacing it. The external
source batches have not been changed by this pass; they are not in this repository.
Do not apply stale replacements blindly if a source sentence has since changed.

The replacements also have complete-sentence verdicts in
`scripts/data/clue-review-ledger.json`. The English weak-highlight limit is now
zero, preventing an old source import from silently restoring the 149 defects.
The reader-stage regression tests exercise each corrected field's mark through
the real highlight pipeline rather than comparing wording or screenshots.

Validation:

- `bun scripts/fix-highlights.ts --scan`
- `bun scripts/check-emphasis-runs.ts`
- `bun scripts/check-clue-whole.ts`
- `bunx vitest run src/features/vocabulary/lib/__tests__/highlight-review.test.ts`