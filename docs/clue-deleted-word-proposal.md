# PROPOSAL: clue sentences with the word cut out

**Status:** step 1 is done: Rule 8, `npm run check:clue-whole`, and the review ledger with 4
confirmed broken clues. The ratchets start at 421 unreviewed and 3 known broken. No deck
file has been changed for this yet.
**Scope:** the English pack (`data/packs/en-*.json`, 4,904 cards, 14,712 clue fields), measured
at `58f37e4` plus the working tree. Other locales come later.

## 1. The defect

Some `defVi` / `leadVi` / `anticipateVi` were written by taking a natural sentence and deleting
the word that names the meaning, to "hide" it. What is left is not a cloze, because there is no
visible blank. It is just broken Vietnamese:

| Card        | Clue as shipped                                           | What was cut                                                                                 |
| ----------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `swimming`  | `Hè này, tôi \| ra hồ /trường_học/ sải mỗi=sáng.`         | `bơi` (`sải` only means anything after `bơi`). Fixed in the working tree by another session. |
| `light`     | `Cúp điện giữa giờ ôn, \| cả phòng bật pin /điện_thoại/.` | `đèn` (`bật pin` means "switch on the battery")                                              |
| `sandwich`  | `Đi /dã_ngoại/, tôi \| gói sẵn mấy ổ kẹp trứng.`          | `bánh_mì` (classifier `ổ` is left with no noun)                                              |
| `objective` | `/Đầu_kỳ/, \| em ghi \| đạt tám điểm Toán.`               | `mục_tiêu` (`ghi` is left with no object)                                                    |

Hiding the word buys nothing.

- **The usage page already shows it.** The usage page comes before the anticipation page and
  the reveal, and its Vietnamese line holds the meaning's root on 2,652 of 4,904 cards (54%).
- **The clues hide it almost everywhere.** Only 205 of 14,712 clue fields (1.4%) contain the
  meaning's root syllables. Most avoid it by rephrasing, which is fine. A few avoid it by
  deleting, which is the defect.
- **It comes from the prompt.** word-refinery's annotation prompt asks for a `leadVi`
  "hinting at the meaning without naming it", and its reviewer checks the same thing
  (`src/lib/prompt.ts`, the field rules and the TEASER line). word-crawler's prompt says the
  same, though it adds "hinting is not deleting". The model obeyed the letter of the rule. In
  the swimming batch it even listed the leftover `sải` in `emphasisVi`.
- **The source is word-refinery, not word-crawler.** The packs are named "WordCrawler", but
  the shipped text lives in word-refinery's `data/batches/*.json`. The swimming lead above is in
  `A104.json` word for word.

## 2. What the data shows

### Confirmed and borderline cases (hand-read)

Clear, meaning the sentence is broken: `swimming` (lead), `light` (lead), `sandwich` (lead),
`objective` (lead).

Borderline, meaning a reader would stumble and a fix is cheap:

- `as` def: `so /ngang/ hai người…`, with `bằng` cut.
- `remember` lead: `tôi /bồi_hồi/ ngày đầu…`, with `nhớ` cut.
- `medieval` def: `Thuộc về /châu_Âu/ khoảng từ năm 500 tới 1500`. It says "belongs to Europe",
  because the time period was cut.
- `menu` lead: `bạn /lật/ mãi chưa chốt món`. The object is dropped. It is natural Vietnamese
  ellipsis, but it carries no clue.
- `difference` anticipate: `Soi kỹ, vẫn sót một?`, where `một` has no noun.

### Random sample (240 fields, seeded, read by hand)

| Field          | Read | Clear           | Borderline                              |
| -------------- | ---- | --------------- | --------------------------------------- |
| `leadVi`       | 120  | 1 (`objective`) | 2–3 (object dropped: `menu`, `thinker`) |
| `defVi`        | 60   | 0               | 1 (`lesson`, `một phần dạy về…`)        |
| `anticipateVi` | 60   | 0               | 1 (`difference`)                        |

Anticipation lines are elliptical by design (`Bà ngắm suốt nhỉ?`). They read as a follow-up to
the lead, so they can only be judged together with it.

**Estimate:** about 1% of leads are clearly broken and 2–3% are borderline. Definitions are
cleaner. Across the English pack that comes to roughly **50 clear cases, and 100–200
borderline**. One hit in 120 is a thin base, so the true number could be anywhere from 20 to 150.

### Each signature from the write-up, measured

| #   | Signature                                                      | Flags (en)                                                    | Real                                                              | Verdict                            |
| --- | -------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------- |
| 1   | Orphaned dependent morpheme ("gap" detector, below)            | 423 at HEAD, 422 now                                          | Top 110 read by hand: 2 clear, 2 borderline (≈2–5%)               | Useful only to rank and to ratchet |
| 1′  | Same, ranked by how bound the leftover is (P(root │ leftover)) | 2,002                                                         | Top 90: 3 clear (light, sandwich, swimming) plus `medieval`       | Worse; drop                        |
| 2   | Meaning root absent from the clue                              | 14,507 of 14,712 (98.6%)                                      | Absence is the norm, so it means nothing on its own               | Only as a precondition             |
| 3   | Clue ≈ the card's own `usage.vi` with the word removed         | **0** at similarity ≥ 0.7 (max 0.667, `earth`, which is fine) | none                                                              | Keep as a free hard gate           |
| 4   | Short or incoherent: function word before punctuation          | 367                                                           | Almost all are valid final particles (`về`, `được`, `tới`, `với`) | Drop                               |
| 4′  | Quantifier + demonstrative (`những này`)                       | 0                                                             | none                                                              | Keep as a hard gate                |

**How the gap detector works.** It builds syllable bigram counts from every Vietnamese text in
`data/` (all locales: 864k bigrams). It then looks at each clue that lacks the meaning root. It
reports a spot where `prev ROOT` and `ROOT next` are both attested, while the clue's own
`prev next` never occurs anywhere else. It caught `swimming` (`học [bơi] sải`), `light`
(`bật [đèn] pin`), `as` and `remember`. It missed `sandwich`, `objective`, `menu` and
`difference`.

**So the deterministic detectors have about 50% recall and under 5% precision.** They cannot
find the stock on their own. They can guard against regressions.

The prototype scanners (`scan.py`, `gap.py`, `dep.py`, `dangle.py`) and the 422 current
candidates are kept outside the repo, in the session notes folder `clue-deleted-word/`.

## 3. Detection plan

**A. One review pass over every English card, done by a language model.** Recall is the
problem, so the pass reads all 4,904 cards, not just the candidates.

- **The unit is the card, not the field.** The model sees `meaningVi`, all three clues and
  `usage.vi`, so it judges an anticipation line against its lead.
- **The verdict is per field:** `whole` | `deleted` (name the missing word and where it goes) |
  `ellipsis-ok` | `broken-other` (for example a word split by `|`).
- **Who runs it:** Claude Code subagents in this repo, about 10 batches of 500 cards. This needs
  no API key, writes JSON to the notes folder, and touches no deck. The alternative is
  word-refinery's reviewer prompt with a stronger model. The Llama 3.3 70B profile is what
  wrote the defect.
- **Expected output:** 150–250 flagged cards, about 3–5%.

**B. A person decides the flagged list.** That is the user, as the native speaker. Each
decision lands in the review ledger described in section 5.

**C. Deterministic rules that run on every check**, with the false-positive load each one
carries:

| Rule                                                                                  | Kind      | False positives today  |
| ------------------------------------------------------------------------------------- | --------- | ---------------------- |
| Curated bound-morpheme pairs, seeded only from confirmed cases                        | hard fail | 0 by construction      |
| Clue ≈ `usage.vi` minus the meaning (similarity ≥ 0.8)                                | hard fail | 0                      |
| Quantifier + demonstrative (`những này`); a classifier with no noun is left to review | hard fail | 0                      |
| Gap candidate that is not in the ledger                                               | ratchet   | about 400 to read once |

How the bound-morpheme rule is seeded:

- Each entry carries its own exceptions. For example, `sải` needs `bơi` before it unless
  `bước`, `cánh`, `chân` or `tay` follows.
- It grows only when a reviewer confirms a case, so it never needs reviewing.

## 4. Fix plan

**Rewrite rules.** A flagged clue is either restored with the cut word or rephrased so it no
longer needs it. The Vietnamese meaning **may** appear in a clue. Every rewrite must also keep
the existing deck rules:

- `_` on every real multi-syllable word and nowhere else.
- Exactly one `/x_y/` mark that passes `highlight-gate`, so the dark-page ratchet does not rise.
- `|` only between phrases of two or more syllables.
- The length limits: lead and definition 8–11 words, anticipation 3–8.

Proposed rewrites:

| Card        | Proposed                                                                                           |
| ----------- | -------------------------------------------------------------------------------------------------- |
| `light`     | `Cúp điện giữa giờ ôn, \| cả phòng bật đèn_pin /điện_thoại/.`                                      |
| `sandwich`  | `Đi /dã_ngoại/, tôi \| gói sẵn mấy ổ=bánh_mì kẹp trứng.`                                           |
| `objective` | `/Đầu_kỳ/, \| em tự hứa \| sẽ đạt tám điểm Toán.` (rephrased; restoring `ghi mục_tiêu` also works) |

**Who does what.**

1. The review pass (section 3A) proposes the rewrites into one patch file. Each entry holds
   deck, id, field, old text and new text.
2. The user approves or edits the file.
3. A small apply script writes the approved rewrites into the English packs. It reads each file
   before writing it, and re-validates the whole deck through `normalizeDeck`, as the library
   editor does.
4. Then run `check:emphasis-runs`, `check:word-joiners`, `check:text-pagination`,
   `check:deck-pages` and the new check, and lower the ratchets.

**Surviving a re-import.** The same patch file is applied to word-refinery's
`data/batches/*.json`. Refinery stores the highlight as a plain `emphasisVi` list, not inline,
so the sync translates `/x_y/` back. Refinery commit `6b6849d` already did this for 187 fields.
That work is a separate session in that repo. The ledger also records every rejected old text
(section 5), so a re-import that brings one back fails the check at once instead of silently
undoing the fix.

## 5. Prevention

### Generation rule

Add a Rule 8 to the paste-in block in `highlight-generation-rule.md`, which already replaces
every earlier instruction. Link it from `word-joiner-generation-handoff.md`, and add one line
to AGENTS.md.

```
RULE 8. EVERY CLUE IS A WHOLE SENTENCE. NEVER DELETE A WORD TO HIDE THE ANSWER.
- A clue may contain the Vietnamese meaning. If you would rather not use it, rewrite the
  sentence so it is not needed. Never take a sentence and cut the word out.
- There are no blanks in clue fields. The usage sentence's _____ is the only blank, and it is
  only in English.
- Nothing may be left without its head: no sải without bơi, no pin without đèn, no
  classifier (ổ, tấm, cuốn, chiếc) without its noun, no ghi / đặt / lật / bật without its object.
- Test: strip the marks and read it cold. Would a Vietnamese reader who has never seen the card
  call it complete and natural? If not, rewrite.
```

### Upstream prompt changes

These go to separate sessions in each repo:

- **word-refinery `src/lib/prompt.ts`:**
  - Change the `leadVi` field rule from "without naming it" to "it may name the Vietnamese word;
    it must be a complete natural sentence; never delete a word to hide it".
  - Reword the reviewer's TEASER line to match, and add a WHOLE line to the reviewer.
- **word-crawler `src/annotate/prompt.ts`:** the same wording change. This is lower priority,
  because word-crawler is not the source of the shipped decks.

### `npm run check:clue-whole`

The script is `scripts/check-clue-whole.ts`, in the style of `check:emphasis-runs`. It reads the
shipped decks (English first) and fails on any of these:

1. A hard rule from section 3C fires on a clue the ledger does not already call broken.
2. More ledger-`broken` clues are shipped than `MAX_KNOWN_BROKEN_CLUES`. This starts at
   **3** (`light`, `sandwich`, `objective`). A fix lowers it, and a re-import that brings an
   old text back goes over it.
3. More unreviewed gap candidates than `MAX_UNREVIEWED_CLUE_GAPS`. This starts at **421**
   (422 minus `light`, which is in the ledger) and may only go down. Each review or fix lowers
   it, and the bar for a finished deck is 0. `--list` prints them all.

The review ledger is `scripts/data/clue-review-ledger.json`. Each entry holds a card id, a
field, the text and a verdict, `ok` or `broken`. An entry matches on the clue's plain words,
with marks, joins and `|` ignored. A reviewed sentence therefore stays reviewed across a
re-import, or a later highlight edit, as long as its words are unchanged. It lives in `scripts/`
because the deck loader must never pick it up.

The check joins the guard list in `word-refinery-import.md`.

**One known wrinkle.** The bigram table is rebuilt from the decks on every run. Fixing one card
can therefore, rarely, create or remove a candidate somewhere else. The ratchet absorbs that. If
it becomes noisy, freeze the table into a file.

## 6. Order of work

1. **Done.** Add the rule text and the check, with no deck changes. The ratchets start at 421
   unreviewed and 3 known broken.
2. Run the review pass over the English cards. The flagged list goes to the notes folder.
3. The user decides the flagged list. Apply the approved rewrites, record the ledger and lower
   the ratchet.
4. Sync the rewrites and the prompt change into word-refinery, in its own session.
5. Later: run the same pass over de / es / fr / ja / ko / zh.

## 7. Questions for the user

1. May a clue contain the Vietnamese meaning, and may its `/…/` mark sit on that word? The
   write-up implies yes to the first. The second makes the glow a giveaway.
2. Should natural object ellipsis (`bạn lật mãi chưa chốt món`) be accepted or rewritten?
3. Is `usage.vi` in scope? `remember`'s usage line (`Mình vẫn ghi lòng sinh_nhật bạn.`) looks
   like the same defect.

## Seen in passing, out of scope

- `|` splits a word, and the mark covers only one syllable, so the page stays dark:
  - `thinker`: `Giờ /triết/ | học`
  - `sideways`: `Xe /bánh/ | mì`
- Joins on words that are not one word: `ký_vội` (parental), `ấm_vừa` (powder),
  `thật_nhanh chóng` (blink).
