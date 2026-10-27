# Hint equivalents for Chinese, Japanese and Korean

**Status: research handoff, deliberately deferred.** The vocabulary feed keeps teaching
English answers to Vietnamese readers. This document records what the clue mechanism would
become if the answer word were ever in Chinese, Japanese or Korean, so that work does not
have to be re-derived later. Nothing here is scheduled; it is a note for when the English
deck is good enough to justify a second language.

## Implemented since: the Chinese stroke coda

The 筆順 half of the "Coda equivalent" row below is now built for Chinese. When the revealed
answer is Han (`isHanAnswer` in `src/features/vocabulary/lib/hanzi.ts`), the post-reveal coda
draws each character stroke-by-stroke instead of popping whole characters:

- Renderer: `components/HanziStrokeSpelling.tsx`, using [Hanzi Writer](https://hanziwriter.org)
  (MIT) over a synchronous `charDataLoader`. Strokes paint in the card's `--vocab-accent`
  over a faint `--vocab-ink` outline guide, then flash `--vocab-accent-alt` on completion.
  Multi-character words draw left-to-right. Reduced motion shows the finished character.
- Stroke data is **one static file per character**: `scripts/build-hanzi-strokes.ts` scans
  every served deck, pulls just those characters from `hanzi-writer-data`, and writes
  `public/hanzi/<version>/<codepoint>.json` (the folder is the data package's version, kept
  in `data/hanzi-strokes-version.ts`). The host serves them as plain cached assets, so the
  server does no work per reader and a reader downloads only the characters of the cards
  they meet (~1.2 KB each compressed) — the dataset can grow to thousands of characters
  without a heavy up-front download. `lib/hanzi-strokes.ts` fetches and memoises them; the
  card prefetches its answer's files on mount, so the coda draws without waiting. If a file
  cannot be fetched the coda shows the plain characters. Re-run the script
  (`npm run build:hanzi`) whenever a CJK deck changes; `npm run check:hanzi` fails if any
  served character has no file at its loader URL. The renderer is lazy-loaded, so the
  English feed chunk never carries Hanzi Writer.
- Timing stays owned by the playback hook: `getStrokeSpellingDurationMs` derives a fixed
  draw budget from the character count alone (pure), and the component splits that budget
  across the real strokes via `solveStrokeTiming`, so the drawing always lands inside the
  coda page. The Latin letter coda (`SpellingAnimation`) is untouched.
- Chinese answers are served from `data/zh/*.json` on the `hoa.*` domain (see
  `lib/target-language.ts`); `catalogFor("zh")` merges them. The reveal and usage stages now
  emit `lang="zh"` for a Han answer.

Still deferred: the pinyin/reading hint axis, the spaceless-script masking and tokenization
fixes (the pack authors `usage` blanks with `____` to avoid the leak), and Japanese/Korean codas.

**Data attribution:** the stroke outlines in `public/hanzi/` derive from
[Make Me a Hanzi](https://github.com/skishore/makemeahanzi) (Arphic Public License) as
redistributed by the `hanzi-writer-data` package; they are vendored under that licence.

## What the current clue actually relies on

One page carries the whole hint. In `src/features/vocabulary/lib/stages.ts` (`buildStages`):

```
const count = (word.word.match(/\p{L}/gu) ?? []).length;
const initial = word.word[0].toUpperCase();
text: `Gồm ${count} chữ cái, bắt đầu bằng ${initial}`
```

The count keeps the primary emphasis mark and the initial gets a second, differently drawn
mark (`INITIAL_EMPHASIS_VARIANT = "frame"`), so one page states two facts. The same answer
string is then replayed letter-by-letter by the spelling coda
(`components/SpellingAnimation.tsx` splits with `Array.from(word)`, `lib/spelling.ts`
times it as `letters × SPELLING_STAGGER + settle + hold`).

The clue works because a Latin letter is:

1. **Small** — 26 letters for an English answer, so "9 letters, starts with R" leaves a
   guessable candidate set.
2. **Perceivable without knowing the answer** — a reader can see and count a glyph they
   cannot read.
3. **Ordered** — the alphabet gives "first" a meaning.
4. **Self-describing** — for Latin, the written letter _is_ a piece of the pronunciation,
   so counting and phonetic cueing are the same operation.

Property 4 is the one that does not transfer.

## The core finding: CJK splits the two axes

A Chinese or Japanese character carries shape and meaning but not sound, so a hint must
choose a side:

- **Phonetic axis** — hint on the reading. Requires romanization data the glyph cannot
  give you (pinyin, kana, romaja).
- **Graphic axis** — hint on visible structure. Perceivable for free, and it is a real
  literacy skill in both countries: 部首 (radical) + 笔画／画数 (stroke count) is exactly
  how children are taught to look up a character they can see but cannot read.

Hangul merges the axes again — it is an alphabet composed into syllable blocks — which is
why Korean is nearly a drop-in and the other two are not.

## Equivalents by language

|              | Count equivalent                                         | Initial equivalent                                    | Axis Latin does not offer                   | Coda equivalent              |
| ------------ | -------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------- | ---------------------------- |
| **Korean**   | 자모 count (jamo), or 음절 block count                   | **초성 string** — 국밥 → `ㄱㅂ`                       | 받침 present/absent per block; 중성 (vowel) | block → jamo pop             |
| **Chinese**  | 字 count (weak) → use **pinyin letter count**            | Pinyin letter initial, or the **声母** inventory (21) | **声调 tone number**; 部首 semantic radical | 拆字 component breakdown     |
| **Japanese** | **mora / 拍 count** — not kana count, not syllable count | First mora/kana, or the **五十音図 row**              | 拗音／促音／長音 shape; kanji 部首 + 画数   | kana-by-kana; 筆順 for kanji |

### Korean — the authentic format already exists as a genre

초성 퀴즈 (initial-consonant quiz) is a commercial puzzle format in Korea: the game shows
the initial consonant of every syllable block and the player fills in the vowels. Examples:
[GoGoCS.net](https://gogocs.net/) ("providing the initial consonant of each orthographic
syllable"), and it is used as a classroom exercise at
[Hancom Taja](https://support.hancomtaja.com/63fd6936-bfa8-4aa2-b338-876137dbea97).

This is _stronger_ than the current clue because it is one initial per syllable rather than
one per word, and it needs no dictionary and no data: Hangul syllables decompose
arithmetically. Verified in Node against the real block layout (`0xAC00`, L=19, V=21, T=28):

```
한국어 -> [ㅎ+ㅏ+ㄴ] [ㄱ+ㅜ+ㄱ] [ㅇ+ㅓ]     chosung: ㅎㄱㅇ
국밥   -> [ㄱ+ㅜ+ㄱ] [ㅂ+ㅏ+ㅂ]             chosung: ㄱㅂ
```

The same decomposition yields the jamo count and the 받침 flag for free, which gives Korean
a graded hint ladder Latin cannot match: 초성 only → 초성 + 중성 → whole blocks.

### Chinese — the number has to move to the reading

Character count is a near-useless constraint (the lexicon is dominated by 2-character
words) and `word[0]` leaks an entire morpheme. What preserves the current hint strength is
**pinyin**, because pinyin is a Latin letter string: 坚强 `jiānqiáng` gives `Gồm 9 chữ cái,
bắt đầu bằng j` — the existing sentence works verbatim once the target is the reading instead
of the glyph. Stripping the diacritics costs nothing, since the letters are what is being
counted. Tone is a bonus axis that costs one digit and is highly discriminative.

Accuracy traps: pinyin is not derivable from a character (polyphonic 多音字 — 银行 `xíng`
vs 行走 `háng`), so it must come from a word-level dictionary, and citation tone lies for
一／七／八／不 sandhi and 儿化. For the graphic axis, [Unihan](https://unicode.org/charts/unihan.html)
ships `kTotalStrokes` and `kRSUnicode` (radical + stroke index) under the Unicode licence —
no ML required.

The true equivalent of "spell it once more" is 拆字: Chinese speakers decompose a character
by its components when asked to spell it out loud — 弓长张, 木子李, 耳东陈, 口天吴
(the primary-school 姓氏歌 teaches exactly this). That maps onto the coda as a component
pop-in rather than a letter pop-in.

### Japanese — the counting unit is the mora, and kana count is wrong

Japanese length is counted in 拍 (morae): haiku meter, and the everyday "count your name in
beats" game. The rule that makes it computable: one kana is one mora, `ん`, the small `っ`
and a long-vowel `ー` each add one of their own, and a small `ゃゅょ` folds into the
preceding mora. Verified:

```
とうきょう  kana 5 → mora 4      きょう   kana 3 → mora 2
がっこう    kana 4 → mora 4      にほんご kana 4 → mora 4
```

Publishing the kana count where a Japanese reader expects 拍 is simply wrong, so the number
must be derived, not copied from `chars`. For the initial, the 五十音図 grid gives a coarse
but very guessable cue that has no Latin analogue: "starts in the ka row" narrows to five
candidates. Kanji answers need the reading from a dictionary (KANJIDIC/JMENEDICT) because
音読み vs 訓読み means the glyph does not determine the sound.

## Why this audience is better placed than an English one

Instruction text is Vietnamese, and Vietnamese orthography already trains both units:

- Vietnamese is written **one syllable per space-separated token**, so "count the syllables"
  is a native concept — it maps onto 字 and onto 拍 without explanation.
- Vietnamese is **lexically tonal with six tones**, so a tone-number hint is informative to
  these readers in a way it is not to an English-speaking audience.
- Hán tự literacy is part of Vietnamese education; the radical system (水部 → bộ thủy) is
  shared with Chinese and Japanese dictionary lookup, so 部首／画数 hints read as familiar
  rather than exotic.
- Hangul is fully transparent — the written block _is_ the sound — and the audience already
  meets Korean vocabulary in romanised form (한국 → Hàn Quốc), so jamo need no introduction.

## Verified blockers (measured on the current code paths)

Run against `answerPattern`, `getWords` and the `chars`/`initial` derivation with CJK input:

| Behaviour                                       | Result                       | Consequence                                                                                                                                                                                             |
| ----------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `answerPattern("銀行")` inside `"我去銀行看看"` | **no match**                 | The boundary assertions `(?<![\p{L}])…(?![\p{L}])` are defeated by neighbouring Han characters, so `mask()` silently leaves the answer **visible** in the usage example. Spoiler, not a formatting nit. |
| `getWords` (`/\S+/g`) on a spaceless sentence   | **1 token**                  | Pagination, emphasis matching, line packing and the fit pass all see one giant word. Blocks Japanese and Chinese before the hint layer is even reachable. Korean is unaffected — it does use spaces.    |
| `chars` via `\p{L}`                             | counts glyphs (`한국어` = 3) | Hanzi, kana and Hangul blocks are all `\p{L}`, so the deck schema would accept a CJK answer and report a misleading "chữ cái" count.                                                                    |
| `word[0].toUpperCase()`                         | `坚`                         | No case-folding effect, and it hands the reader a whole morpheme instead of a partial cue.                                                                                                              |
| `LearningStage.lang`                            | closed `"vi" \| "en"`        | No tag for a CJK answer, so `<p lang>` mislabels it for screen readers and font selection.                                                                                                              |
| `isLikelyVietnameseText`                        | false for CJK                | CJK text falls through to the English layout branch, which is space-based.                                                                                                                              |

Also structural, and worth fixing **before** any language work because it is a present-day
bug risk, not a future one: the count/initial pair is derived in four places that can drift —
`word-crawler/src/deck.ts` (`buildDeckWord`), `src/features/vocabulary/lib/schema.ts`
(`normalizeDeck`, which **overwrites** whatever the deck supplied), `stages.ts` (`buildStages`,
which recomputes again and ignores the stored field entirely), and
`content-hub/src/sources/vocabulary.ts` (`buildStyleHints` + the payload). The values in
`catalog.json` are therefore decorative for the feed. Step one of any i18n-hint work is to
collapse these into one script-aware derivation module.

## Suggested sequencing when this is picked up

1. **Extract one hint-derivation seam** taking `(word, script)` and returning
   `{ unitLabel, count, initial, reading?, ladder }`. Replace all four call sites.
2. **Add a `reading` field to the deck contract**, generalising `ipa` (which is already
   carried and rendered in `VocabularyStage.tsx`): pinyin with tone marks, kana/romaji, or
   RRK romaja. `chars`/`initial` then derive from the reading for Chinese and Japanese, and
   from the blocks for Korean.
3. **Start with Korean.** 초성 is arithmetic, the answer language can keep spaces, and the
   quiz format is already culturally established — it validates the whole hint-ladder design
   at the lowest cost.
4. Then Chinese on the phonetic axis (pinyin + tone, from CC-CEDICT), with 部首 as an
   optional graphic clue from Unihan.
5. Japanese last: it needs reading data _and_ the tokenization fix.
6. Fix masking and tokenization for spaceless scripts before shipping any Japanese or Chinese
   usage example — otherwise the answer leaks. Options: segment with Intl.Segmenter
   (`granularity: "word"`, available in Node 22 and all current browsers) or mask by exact
   character offset instead of by word boundary.
7. Localise the unit noun in the Vietnamese clue text: "chữ cái" is a factual error for
   hanzi and mora (字 → "chữ", 拍 → "nhịp", 자모 → "chữ cái Hàn", 음절 → "âm tiết").

Data sources: Unihan (Unicode licence — stroke counts, radical index, Mandarin/Japanese/Korean
readings), CC-CEDICT (word-level pinyin, CC BY-SA 4.0 — check attribution obligations),
KANJIDIC + JMENEDICT (JMDICT licence, for Japanese readings and stroke counts). Korean needs
none.

## Open questions for whoever picks this up

- Is the answer the target-language word, or does the feed keep Vietnamese as the thing being
  guessed? The hint unit only matters for the revealed side; this doc assumes the revealed side.
- Does the learner write the script (then 筆順／拆字 belongs in the coda) or only recognise it
  (then the phonetic axis alone is enough)?
- Tone hints are free for a Vietnamese audience but would be misleading if the audience ever
  changes to non-tonal-language readers.
- Sino-Korean and Sino-Japanese lookups via Hanja／漢字 could be a third hint axis, but it
  only pays off for vocabulary that is actually Sino-Xenic.
