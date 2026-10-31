# HANDOFF: mark inseparable syllables with `_` when generating deck text

> **Update.** There are now three marks, not one. `_` still means "one word"; `=` binds two
> words that must share a line but are not one word; `|` marks a phrase edge. Sections 1-4
> below describe `_`, and section 11 describes the other two.

**For:** any model or script that writes text for a vocabulary deck (the word crawler, the
admin "regenerate" action, a future generator for another language).
**Status:** the app already understands the marker. No stored deck carries it yet, so
every new or regenerated text field should.

---

## 1. What you must do

When you write a sentence for a deck, **join the parts of one word with a single
underscore `_`**, and keep an ordinary space between different words.

```
Sáng nào cũng đeo ba_lô ra cửa.
Điều /quan_trọng/ nhất là sức_khỏe.
Tim đập thình_thịch chưa?
他是一个很诚_实的学_生。
```

Why: Vietnamese is written one syllable at a time, so `ba lô` (a backpack) looks exactly
like two unrelated words, and the card may end a line after `ba` and start the next with
`lô`. The underscore tells the app the two syllables are one word. It then keeps them on
one line and, if they do not fit, moves the **whole word** down.

A reader never sees the underscore. The app replaces it when the deck is loaded.

## 2. The rule, exactly

- A join is **one** underscore with a letter or digit directly on **both** sides. No space
  before it, no space after it.
- Write it **only** between parts of the same word. Everything else stays separated by one
  plain space.
- Do not use an underscore for anything else in a text field: no `snake_case`, no
  emphasis, no single-underscore blanks. Any underscore between two letters will be read
  as a join.
- When you are not sure two syllables form one word, **do not join them**. A missing join
  only allows a line break; a wrong join glues two words into a block that cannot wrap and
  makes the whole page smaller.

## 3. By language

| Language                                        | Where the join goes                                                                                                | What the reader sees              |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------- |
| Vietnamese                                      | Between the syllables of one word, in place of the space: `học_sinh`                                               | `học sinh`, never split           |
| Chinese                                         | Between the characters of one word: `诚_实`, `图_书_馆`                                                            | `诚实`, `图书馆` (no space added) |
| English and other languages written with spaces | In place of the space inside a fixed compound: `ice_cream`                                                         | `ice cream`, never split          |
| Korean                                          | Usually nothing. Optionally between two spaced words of one fixed term: `한국_사람`. **Never inside a word block** | `한국 사람`, never split          |
| Japanese                                        | Only between two kanji of one word: `図_書_館`. **Never next to kana**                                             | `図書館`                          |

The reason for the two "never" entries: a join is shown as nothing only between two Han
characters. Anywhere else it is shown as a space, so `학_교` would print `학 교` and
`たべ_もの` would print `たべ もの`. A Korean word block is already unbreakable and needs
no marker.

## 4. Vietnamese: what counts as one word

Follow standard Vietnamese word segmentation (the VLSP / VnCoreNLP convention, which
writes joins the same way).

**Join**

- Compound words: `học_sinh`, `điện_thoại`, `thư_viện`, `nguyên_liệu`, `sức_khỏe`
- Reduplicated words: `thình_thịch`, `lấp_lánh`, `nhẹ_nhàng`, `năn_nỉ`
- Loanwords spelled as syllables: `cà_phê`, `ba_lô`, `ô_tô`, `xà_phòng`
- Multi-syllable function words: `bởi_vì`, `tuy_nhiên`, `mặc_dù`, `cho_nên`, `bao_giờ`
- Proper names: `Việt_Nam`, `Hà_Nội`, `Sài_Gòn`

**Do not join**

- Verb and its object: `ăn cơm`, `đọc sách`, `mở cửa`
- Classifier or number and its noun: `cái bàn`, `con mèo`, `ba người`
- Adverb and what it modifies: `rất đẹp`, `đang ngủ`, `không biết`
- A whole phrase, idiom or clause, even a fixed one. Join the real words inside it
  instead: `công_nghệ thông_tin`, not `công_nghệ_thông_tin`.

**Length.** A joined word is normally two syllables and occasionally three. Never join
more than four. On a phone a joined unit must fit on one line, so a long chain shrinks the
entire page.

**Quick test.** If you could put another word between the two syllables without breaking
the meaning (`ăn [nhiều] cơm`), they are two words. If you cannot (`ba … lô`), they are
one.

## 5. With the other deck syntax

- **Punctuation** stays outside, attached to the last syllable: `ba_lô,` `quan_trọng.`
  `"cà_phê!"`
- **Highlights** `/…/` wrap whole words, with the join inside: `/quan_trọng/`. Never
  `/quan/_trọng` or `/quan_/trọng`. A Vietnamese highlight is ONE word: a single
  syllable (`/gắt/`) or exactly two syllables the text joins with `_` (`/quan_trọng/`).
  Never `/nắng gắt/` (two words), never across a `=`, never three syllables, even joined
  (`/thời_khóa_biểu/` cannot glow; highlight another word). `check:word-joiners` fails a
  shipped deck that breaks this. (The admin regenerate prompt uses `*…*` for the same
  thing; the same rule applies.)
- **The answer blank** is a run of underscores standing alone, written `____`. It is not
  a join. Never attach a blank to a word (`từ____`) and never write a blank as a single
  underscore: the app reads two or more in a row as the blank, and one as nothing.
- **The headword** (`word`) never contains an underscore.
- **Length limits** written in "words" count syllables. `ba_lô` counts as two.
- **Capitals, hyphens and digits** are written as usual: `Việt_Nam`, `A-Z`, `2025`.

Fields the marker applies to: `defVi`, `leadVi`, `anticipateVi`, `usage[].vi`, and
`usage[].en` (for a Chinese deck this field holds the Chinese sentence, so its words are
joined the Chinese way). The legacy `emphasis` array may be written either way.

## 6. Right and wrong

| Wrong                              | Why                                              | Right                      |
| ---------------------------------- | ------------------------------------------------ | -------------------------- |
| `Xách ba lô lên và đi!`            | `ba lô` can be split across lines                | `Xách ba_lô lên và đi!`    |
| `Xách_ba_lô lên và đi!`            | joins a verb to its object                       | `Xách ba_lô lên và đi!`    |
| `Cô ấy ăn_cơm rất_nhanh.`          | two separate words joined, twice                 | `Cô ấy ăn cơm rất nhanh.`  |
| `điều quan _trọng` / `quan_ trọng` | a space next to the join; it is no longer a join | `điều quan_trọng`          |
| `/quan/_trọng lắm`                 | highlight cuts through a word                    | `/quan_trọng/ lắm`         |
| `dưới /nắng gắt/`                  | highlight covers two words                       | `dưới nắng /gắt/`          |
| `dán /thời_khóa_biểu/`             | highlight of three syllables                     | `/dán/ thời_khóa_biểu`     |
| `gầm_giường_nín_thở`               | a whole phrase joined; cannot wrap               | `gầm giường nín thở`       |
| `Cô ấy rất _.`                     | single underscore used as a blank                | `Cô ấy rất ____.`          |
| `他是一个很诚实的学生。`           | `诚实` and `学生` can each be split              | `他是一个很诚_实的学_生。` |
| `학_교에 가요.`                    | prints a space inside the word                   | `학교에 가요.`             |

## 7. Check before you return a field

1. Every underscore has a letter or digit on both sides and no space next to it, or it is
   part of a `____` blank.
2. Every joined unit is one real word of at most four syllables.
3. Removing every join (turn `_` into a space, or into nothing between two Han characters)
   gives the natural sentence, unchanged.
4. No `/` or `*` sits directly next to an underscore.
5. The syllable count is still inside the field's length limit.
6. A Vietnamese sentence of six syllables or more almost always contains at least one
   multi-syllable word. If yours has no join at all, look again.

## 8. Text to paste into a generation prompt

```
WORD BOUNDARIES — required in every text field you write.
Join the parts of ONE word with a single underscore and no spaces; separate different
words with one space.
- Vietnamese: join the syllables of each multi-syllable word (ba_lô, quan_trọng,
  thình_thịch, học_sinh, Việt_Nam). A one-syllable word is written alone.
- Chinese: join the characters of each multi-character word (诚_实, 图_书_馆).
- Never join two different words (not ăn_cơm, not rất_đẹp). Never join more than four
  syllables. When unsure, leave a space.
- Punctuation stays outside the join (ba_lô, not ba_lô_,). A highlight is one word: one
  syllable (/gắt/) or one two-syllable joined word (/quan_trọng/); never two separate
  words, never across "=", never three syllables. The answer blank is ____ and is never
  attached to a word.
- Every `emphasisVi` phrase is exactly ONE joined group (or one lone syllable) of the text
  it sits in — at most three syllables, and three only for a real lexicalised word
  (nút_bịt_tai). Never glue a collocation to make it look like one word (not
  mua_và_bán, not không_có_việc), and never let a phrase hold và, hoặc or nhưng.
- Use no underscore for any other purpose.
- Length limits count syllables: ba_lô is two.
```

## 9. For whoever maintains the generator

- **Count syllables, not tokens.** A whitespace split now undercounts. Split on whitespace
  and on a single underscore between letters; the app's own helper is `countJoinedUnits`
  in `src/features/vocabulary/lib/word-joiner.ts`.
- **Do not strip, escape or normalise the underscore** anywhere between the model and the
  stored deck. Stored decks keep it; only the app's loader converts it.
- **Match highlights verbatim.** A highlighted phrase is looked up in the sentence as
  written, joins included.
- **Lint each field** before accepting it:
  - a join is `(?<=[\p{L}\p{N}])_(?=[\p{L}\p{N}])` (Unicode mode); any other lone
    underscore is an error; a run of two or more is the blank and must stand alone;
  - no `/_`, `_/`, `*_` or `_*`;
  - no joined unit longer than four syllables;
  - no join between two Hangul characters, none touching Hiragana or Katakana;
  - each `emphasisVi` phrase equals exactly one `_` group of the field it highlights (or one
    lone syllable), is at most three syllables, and never holds và, hoặc or nhưng —
    the reader's own guard proves it on every shipped page: `npm run check:emphasis-runs`.
- **Existing decks** (200 words, 800 Vietnamese fields at the time of writing) have no
  joins. They render as before until they are regenerated or annotated.

How the app uses it, for reference:

| Step                                                             | Where                                                                 |
| ---------------------------------------------------------------- | --------------------------------------------------------------------- |
| The convention, and conversion to unbreakable characters on load | `src/features/vocabulary/lib/word-joiner.ts`, `lib/catalog-source.ts` |
| Clue pages receive the joined words                              | `src/features/vocabulary/lib/stages.ts` (`boundPhrases`)              |
| A joined word is one unbreakable unit in the line layout         | `src/features/post-player/components/WordSequenceText.tsx`            |
| The deck contract                                                | `src/features/vocabulary/data/catalog.schema.jsonc`                   |
| Guard                                                            | `npm run check:word-joiners`                                          |

## 10. Known limits

- A join is spaceless only between two Han characters. Kana, Thai and other scripts
  written without spaces are not supported yet; extend `encodeWordJoiners` before
  generating joins for them.
- On English sentence pages the join is honoured in plain text (the meaning panel, saved
  words) but the animated page may still wrap between the two words.
- If a join overlaps one of the app's built-in Vietnamese compounds (`A_B` built in, `B_C`
  authored), the built-in one wins. Correct segmentation never produces this.

## 11. The other two marks

`_` answers "is this one word?". Two more questions needed answering, and each got its
own mark. All three are invisible to a reader and none changes a word count.

### `=` — leans on its neighbour

Two words that must stay on one line but are **not** one word: a classifier and its noun
(`con=mèo`), a function word and what it leans on (`đã=đi`, `của=tôi`, `rất=đẹp`), a free
verb-object pair (`ăn=cơm`). Linguistically these are clitics; the symbol is the Leipzig
glossing rules' clitic boundary.

It breaks exactly like `_` — encoded to a no-break space, reported in `bound`, never split
across lines. The difference is what a highlight may cover:

- a highlight **may** cover a `_`, because those syllables are one word
- a highlight may **never** cover a `=`, because `con mèo` is a classifier plus a noun,
  not a phrase worth glowing

That rule is enforced upstream, where emphasis is chosen and validated.

### `|` — phrase edge

Written between phrases with a space each side:

```
Chất_lỏng trong suốt | mà ta uống=mỗi ngày.
```

A phrase edge is where a break is **welcome**, and by implication the places beside it
where a break is bad. The rule it expresses:

> A line or page break must not carry only one syllable across a phrase edge, in either
> direction. Never strand a lone syllable at the end of a line, and never pull a lone
> syllable up from the next phrase to fill a gap. The same applies at a page break.

Every phrase must therefore be **at least two syllables** — a one-syllable phrase cannot
offer a break that honours the rule, and the generator's validator rejects it.

**Status:** `|` is stripped on load, so it never reaches a reader, and
`splitPhrases()` exposes the edges. **Nothing honours the rule yet.** The packer in
`features/kinetic-text` chooses line breaks from measured widths and does not know about
phrase edges; teaching it the minimum-syllable constraint is the remaining work. Until
then the mark is recorded in the deck and costs nothing.
