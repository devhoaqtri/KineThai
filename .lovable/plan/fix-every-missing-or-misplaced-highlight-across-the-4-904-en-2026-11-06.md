# Fix every missing or misplaced highlight across the 4,904 English words

## What's wrong (found on "favourite")
- **Meaning sentence:** `Được thích /nhất/ …` marks just one syllable. The highlight rule only accepts two joined syllables, so the whole sentence stays unlit.
- **Teaser question:** `Đổi món một /lần_thử/ xem?` lights a filler phrase ("lần thử") when the point of the question is "đổi món".

## How big it is (first count across all 14,712 sentences)
| Sentence | No mark at all | Mark the rule rejects |
|---|---|---|
| Meaning (defVi) | 0 | 359 |
| Scene (leadVi) | 0 | 458 |
| Teaser (anticipateVi) | 2,419 | 0 |

That adds up to about 3,236 unlit sentences. Misplaced marks pass the rule, so this count can't see them. They need a separate check, described below.

## Plan
1. **Full scan script.** Read all six English packs and sort every sentence into one group: OK, no mark, one syllable, three or more syllables, mark on a filler, or mark on something other than the core idea. Write a report listing each word's ID, the sentence type, and the reason.
2. **Filler detection.** Keep a fixed list of empty phrases: lần thử, một chút, thứ gì, lúc nào, ai đó, việc gì, and similar. Treat a mark on one of these as misplaced.
3. **Choose the right word to mark.** Use the AI service in batches of 50 words. For each flagged sentence, it picks the two-syllable word that carries the meaning (the action or object the sentence is about) and adds or moves the mark. The sentence text itself must not change. The script rejects any reply that adds, drops or rewords a syllable, or breaks Rule 8 (never hide the answer by deleting its word). If the sentence has no suitable two-syllable word, it is listed for review instead of being rewritten.
4. **Apply and check.** Write the fixes back to the pack files, keeping every `_` and `|`. Then run the highlight check, the clue-whole check and the tests.
5. **Lock it in.** Lower the dark-page limit (now 6,805) to the new count. Add a rule to the check that fails on any teaser with no mark or any mark on a filler phrase, so new decks can't slip back.
6. **Review list.** Anything the script couldn't fix safely goes into a short list for you to check. I'll also send the fixes as a batch for word-refinery so a later re-import doesn't undo them.

## Scope
- English packs only (the 4,904 words). Other languages can get the same pass afterwards.
- Highlight marks only. No sentence will be rewritten except where it breaks Rule 8.
