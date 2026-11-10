# HANDOFF: a fuller scan of share codes for words and taboos

**For:** whoever widens the share-code screen next.
**State on 2026-11-10:** a first pass is in. 440 issued codes across the seven decks were
retired and replaced (en 165, es 119, de 56, ja 37, zh 26, ko 22, fr 15), and
`npm run check:share-codes` now fails if an issued code reads as a word or a taboo. This
document is what that pass did not cover, and how to extend it.

## What a share code is, and the rules you must keep

- A code is three characters from `0123456789ABCDEFGHJKMNPQRSTVWXYZ` (no I, L, O, U), e.g.
  `anh.chayla.app/w/6W3`. It opens the feed on one word (lib/share-code.ts).
- **A code is a promise.** Once it has been in a chat message it must keep opening the same
  word. So a bad code is **retired, never recycled**: it moves from
  `src/features/vocabulary/data/share-codes.json` (the ledger, code → word id per deck) to
  `src/features/vocabulary/data/share-codes-retired.json` (code → `{ id, reason,
replacedBy }`), it is never issued again, and an old link with it still opens its word
  (`api/word-endpoint.server.ts` reads the retired file).
- Codes are unique **per deck** (per host language), not globally. Every deck has its own
  32,768-code space; retired codes count against it. Today en uses 5,540 + 165 retired.
- The screen runs **offline only** (scripts). None of its lists may reach a browser bundle.

## How it works now

| File                               | Role                                                                                 |
| ---------------------------------- | ------------------------------------------------------------------------------------ |
| `scripts/lib/share-code-screen.ts` | `screenShareCode(code)` → reason (`word:dog`, `taboo:sex`, `pair:dm`) or `null`      |
| `scripts/rescreen-share-codes.ts`  | Retires every issued code that fails, gives its word a fresh screened code (`--dry`) |
| `scripts/assign-share-codes.ts`    | New codes must pass the screen and may not be retired                                |
| `scripts/check-share-codes.ts`     | Fails on an issued code that fails the screen, or a retired code back in use         |
| `data/share-codes-retired.json`    | The retired codes, per deck                                                          |

A code is read the way a person reads it, not the way it is spelt:

- **Ordinary words** (`COMMON_WORDS`, ~450 common English 3-letter words and abbreviations)
  are matched with only the substitutions the alphabet itself makes: `0`→O, `1`→I/L,
  `V`→U. That is what turns `D0G` into DOG. Nothing further-fetched.
- **Taboos** (`TABOO_WORDS`, English and Vietnamese) are matched with leetspeak
  (`3`→E, `4`→A, `5`→S, `7`→T, `8`→B, `9`/`6`→G, `2`→Z) and sound-alikes (C/K/Q, S/Z, Y/I).
- **Two-letter taboos** (`TABOO_PAIRS`: `dm`, `vl`) fail a code wherever they sit in it.
- A code of digits alone is a number: it fails only on a numeric taboo itself (666, 420).

## What the fuller scan should add

Work through these in order; each is a list or a rule in `share-code-screen.ts`.

1. **Vietnamese, the readers' own language.** Every reader reads the code as a Vietnamese
   speaker first. Collect, with a native speaker:
   - teen-code and swear abbreviations beyond the current list (`vcl vkl dcm dkm dmm cmm
cmn clm cac lon loz djt dit dyt deo ngu`): e.g. variants with `z`/`j`/`k` spellings,
     `cmnr`-style stems cut to three, regional forms;
   - unaccented everyday words that read badly in a link (`cut` "cút", `chet` stems,
     `cuc`), and body words;
   - more **two-letter** taboos to fail anywhere in a code (`cc`, `cl`, `dm` is in) —
     each pair costs ~64–200 codes per deck with look-alikes, so weigh them.
2. **Each deck's target language.** A code is read on that language's host too:
   - French: `con`, `pd`, `fdp`, `ntm`, `tg`;
   - Spanish: `pto`, `ctm`, `hdp`, `csm`;
   - German: `ss`, `sau`, `fck` (in), `afd`-style political shorthands;
   - Chinese: numbers — `250` (idiot), `38`, `4`-heavy codes (death), `TMD`, `SB`, `NMB`;
   - Japanese: `4`/`9`-heavy codes (death, suffering), `shi` readings;
   - Korean: `18` (시발), `ㅅㅂ`-style romanisations `sb`, `sp`.
3. **Hate and extremist numbers and letters:** `88`, `14`, `1488` parts, `SS`, `HH`,
   `KKK` (in), `ISIS` parts, `187`. Decide whether they fail anywhere in a code (pairs) or
   only whole.
4. **Brands, institutions and loaded acronyms** a reader would recognise and might not want
   in a learning link (`KFC`, `CIA` is in, `IRS`, `CNN`): optional, low priority.
5. **A broader English list.** `COMMON_WORDS` is hand-picked. A frequency list (the top
   ~1,000 three-letter tokens of a modern corpus) plus a slang list would catch more.
   Webster's `/usr/share/dict/words` is the wrong tool: 1,142 three-letter entries,
   mostly obscure (`aal`, `aby`), and with full leetspeak it flagged 559 en codes, most of
   them plain numbers.
6. **Reading rules to reconsider:** whether plain words should also get leetspeak (`B4D`
   as BAD), whether reversed or rotated codes matter, and whether two-letter English words
   inside a code matter at all (almost certainly not).

## How to run a pass

1. Extend the lists or rules in `scripts/lib/share-code-screen.ts`. Keep each list in a
   comment-headed group so a reviewer can see what it is for.
2. See what it would catch, per deck, before touching anything:
   `npx tsx scripts/rescreen-share-codes.ts --dry`. Review the reasons; a list that flags
   thousands of codes is wrong, not thorough.
3. Run it for real: `npx tsx scripts/rescreen-share-codes.ts`. It only rewrites
   `shareCode` values, the ledger and the retired file — check with
   `git diff -U0 -- src/features/vocabulary/data | grep '^[+-] ' | grep -vc shareCode`
   (must print 0).
4. `npm run check:share-codes` must show `no issued code reads as a word or a taboo` and
   `no retired code is back` for every deck. (The zh and ko decks also report words with
   no code yet; that predates this work and is the assigner's job, not the screen's.)
5. Spot-check an old link: `/api/public/word?code=<retired>` and `?code=<replacement>`
   return the same word.

## Never

- Never delete a retired code or move it back into the ledger: an old link would then
  open nothing, or a different word.
- Never reassign a code from one word to another, even a clean one.
- Never import `scripts/lib/share-code-screen.ts` from `src/`: its lists stay offline.
