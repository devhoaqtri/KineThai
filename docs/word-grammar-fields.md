# Word grammar fields (the meaning panel's "Nâng cao" section)

Handoff for whoever generates decks (the word-crawler repo) and for whoever touches the
panel. Code: `src/features/vocabulary/lib/grammar.ts` (the table, the fold, the display
rows), `components/WordGrammar.tsx` (the section), sample cards for all six languages:
`docs/word-grammar-sample.json`.

## How it works

- **The deck writes the fields flat on the card**, every key present, `null` where it
  does not apply — exactly as `gen-rules-{de,fr,es}.md` v3 section G already does. That
  stays the generator's contract; this file only adds fields.
- **The app folds them into one `word.grammar` object** when a deck is compiled
  (`normalizeDeck`), dropping every null. A word with no grammar carries nothing.
- **The panel is generic.** Values and sub-keys are written in the target language
  ("stark", "passé composé", "ㅂ 불규칙", "五段動詞"), so a sub-key is already its own
  label; the app only adds the Vietnamese gloss beside it (`TERM_VI` in grammar.ts). A
  new sub-key or enumerated value needs one gloss line there and nothing else; an
  unknown one still shows, just without a gloss.
- **The section is closed by default**: one quiet row at the foot of the panel
  ("NÂNG CAO  số nhiều · cách chia · đi kèm ⌄"). The reader's open/closed choice is
  remembered on the device. Opening it by hand holds autoplay on that answer until it
  is closed. It never appears in video exports, or for a word with no grammar.

## The fields

Display order is the order below. ● = used by that language.

| field | de | fr | es | ko | ja | zh | value |
|---|---|---|---|---|---|---|---|
| `gender` | ● | ● | ● | | | | `"m"` \| `"f"` \| `"n"` |
| `article` | ● | ● | ● | | | | `"der"`, `"l'"`, `"el"` — shown together with gender |
| `feminine` | | ● | ● | | | | adjective's feminine singular |
| `plural` | ● | ● | ● | | | | `"die Bücher"`, `"petits / petites"` |
| `comparison` **new** | ● | ● | ● | | | | `"größer · am größten"`, `"meilleur"`, `"mejor"` |
| `hAspire` | | ● | | | | | `"h aspiré"` \| `"h muet"` |
| `counter` **new** | | | | ● | ● | ● | `"권"`, `"冊（さつ）"`, `"本 běn"` |
| `hanja` **new** | | | | ● | | | `"學校"` |
| `traditional` **new** | | | | | | ● | `"見面"` |
| `hanViet` **new** | | | | ● | ● | ● | `"học hiệu"` |
| `verbInfo` | ● | ● | ● | ● | ● | ● | object, see per language |
| `reflexive` | ● | ● | ● | | | | `"sich beeilen"`, `"se dépêcher"`, `"quejarse"` |
| `governs` | ● | ● | ● | ● | ● | ● | `"+ Dativ"`, `"à + lieu"`, `"N을/를"`, `"Nを"`, `"跟 + 人 + 见面"` |
| `serEstar` | | | ● | | | | Vietnamese note (v3 G.6) |
| `honorific` **new** | | | | ● | ● | | object, see per language |
| `reduplication` **new** | | | | | | ● | `"看看"`, `"高高兴兴"` |
| `collocations` **new** | ● | ● | ● | ● | ● | ● | 1–4 `{ "text", "vi" }` |
| `tipVi` | ● | ● | ● | ● | ● | ● | the one beginner trap, Vietnamese (v3 G.6/G.7) |

Every field is optional to the app: a deck that does not know a field simply leaves it
out (or `null`). Each language's card key order lists only the fields that language uses.

## New fields shared by every language

### `collocations` (array or null)
One to four everyday pairings that show HOW the word is used, most common first. Each is
`{ "text": <target-language phrase>, "vi": <Vietnamese meaning> }`.
- `text`: 2–5 words, the headword in it (inflected as needed), no blank, no `_ = |`.
  Not a sentence; the example sentence is `usageEn`. "einen Termin vereinbaren",
  "prendre une décision", "hacer la cama", "밥을 먹다", "ご飯を食べる", "看书".
- `vi`: compact Vietnamese (D), marks as E, at most about 6 syllables.
- Pairings, not synonyms. `null` for a word with no fixed pairing worth showing.
- Same level ceiling (H) and sensitive-topic rule (I, J) as `usageEn`.

### `comparison` (string or null) — de, fr, es
Adjectives and adverbs only. German: always, comparative and superlative joined by
" · ": `"größer · am größten"`, `"schneller · am schnellsten"`, `"besser · am besten"`.
French and Spanish: only when irregular: `"meilleur"` (bon), `"mieux"` (bien), `"pire"`;
`"mejor"` (bueno), `"peor"`, `"mayor"` (grande, of age). Regular ones (plus grand, más
grande) are `null`. When the comparison IS the trap, `tipVi` names something else or is
`null` — they never say the same thing.

## Korean (ko)

Card keys, in this order:
```
word, pos, ipa, meaningVi, counter, hanja, hanViet,
verbInfo, governs, honorific, collocations, tipVi,
defVi, leadVi, anticipateVi, usageEn, usageVi, topics, exams, emphasisVi
```
- `word`: dictionary form (먹다, 덥다, 학교). `ipa`: IPA in slashes.
- `counter`: the counting noun used with this noun (책 → `"권"`, 사람 → `"명"`, 학교 →
  `"곳"`). Nouns only; null when the general 개 is the natural choice.
- `hanja`: the Han spelling of a Sino-Korean (한자어) word: 학교 → `"學校"`. null for
  native Korean words and loanwords.
- `hanViet`: the Sino-Vietnamese reading of that hanja, lowercase, syllables spaced
  (`"học hiệu"`). This is the single most useful hint for a Vietnamese learner: a
  한자어 is often the Vietnamese word in disguise. null whenever `hanja` is null.
- `verbInfo` (verbs AND adjectives — Korean adjectives conjugate): exactly
  | key | value |
  |---|---|
  | 활용 | `"규칙"` \| `"ㅂ 불규칙"` \| `"ㄷ 불규칙"` \| `"ㅅ 불규칙"` \| `"ㅎ 불규칙"` \| `"르 불규칙"` \| `"ㄹ 탈락"` \| `"으 탈락"` |
  | 활용형 | `{ "현재": "더워요", "과거": "더웠어요", "관형형": "더운" }` — 해요체 present and past, and the modifier form before a noun (먹는, 더운) |
- `governs`: the particle frame this sense needs, with N for the noun: `"N을/를"`
  (먹다, 만나다), `"N이/가"` (좋다, 있다), `"N에"` (가다). null when nothing is required.
- `honorific`: `{ "높임말": "드시다" }` when the word has its own honorific form
  (먹다 → 드시다, 자다 → 주무시다, 있다 → 계시다, 집 → 댁, 나이 → 연세). null otherwise
  (the regular -(으)시- is not a separate form).
- `tipVi` traps: an irregular stem (덥다 → 더워요), the particle (이/가 vs 을/를), the
  honorific form, batchim-dependent particle choice, a false Sino-Korean friend.

## Japanese (ja)

Card keys, in this order:
```
word, pos, ipa, meaningVi, counter, hanViet,
verbInfo, governs, honorific, collocations, tipVi,
defVi, leadVi, anticipateVi, usageEn, usageVi, topics, exams, emphasisVi
```
- `word`: dictionary form as usually written (食べる, 本, 高い). `ipa`: the reading in
  hiragana, the way the Chinese deck's `ipa` holds pinyin (`"たべる"`).
- `counter`: the 助数詞 for this noun with its reading: 本 → `"冊（さつ）"`, 犬 →
  `"匹（ひき）"`, 紙 → `"枚（まい）"`. Nouns only; null when つ/個 is natural.
- `hanViet`: the Sino-Vietnamese reading of the word's kanji, lowercase, spaced
  (学校 → `"học hiệu"`, 食べる → `"thực"`). null for a kana-only word.
- `verbInfo`, verbs: exactly
  | key | value |
  |---|---|
  | 種類 | `"五段動詞"` \| `"一段動詞"` \| `"カ変動詞"` \| `"サ変動詞"` |
  | 自他 | `"自動詞"` \| `"他動詞"`, followed by its pair when one exists: `"他動詞 ↔ 開く"` (開ける); null if neither applies |
  | 活用形 | `{ "ます形": "食べます", "て形": "食べて", "ない形": "食べない", "た形": "食べた" }` |
- `verbInfo`, adjectives: 種類 `"い形容詞"` \| `"な形容詞"`, and 活用形
  `{ "否定": "高くない", "過去": "高かった", "て形": "高くて" }` (な: `"静かじゃない"`,
  `"静かだった"`, `"静かで"`). No 自他.
- `governs`: the particle frame: `"Nを"` (食べる), `"Nが"` (分かる, 好き), `"Nに会う"`
  when the particle is the trap. null when nothing is required.
- `honorific`: `{ "尊敬語": "召し上がる", "謙譲語": "いただく" }` when the word has its
  own keigo forms (食べる, 行く, 言う, 見る, いる…); include only the keys that exist.
- `tipVi` traps: 五段 verbs that look 一段 (帰る, 入る, 走る), a て-form sound change
  (行く → 行って), が where a Vietnamese learner expects を, い/な adjective endings
  (きれい is な), a counter that is also a word (本).

## Chinese (zh)

Card keys, in this order:
```
word, pos, ipa, meaningVi, counter, traditional, hanViet,
verbInfo, governs, reduplication, collocations, tipVi,
defVi, leadVi, anticipateVi, usageEn, usageVi, topics, exams, emphasisVi
```
- `ipa`: pinyin with tone marks (unchanged from the current zh deck).
- `counter`: the 量词 with pinyin: 书 → `"本 běn"`, 衣服 → `"件 jiàn"`. Nouns only;
  null when 个 is the natural choice.
- `traditional`: the traditional spelling, only when it differs (见面 → `"見面"`);
  null when identical (人).
- `hanViet`: Sino-Vietnamese reading, lowercase, spaced (`"kiến diện"`). Every zh word
  has one; null only for transliterated loanwords (咖啡).
- `verbInfo`: only for separable verbs (离合词): `{ "离合词": "见…面 : 我们见过面" }` —
  the split, then a tiny example with something inside it. null for every other verb.
- `governs`: the frame this sense needs: `"跟 + 人 + 见面"`, `"对 + 人 + 好"`,
  `"给 + 人 + 打电话"`. null when nothing is required.
- `reduplication`: the reduplicated form when it is common: verbs ABAB / AA
  (`"看看"`, `"休息休息"`), adjectives AABB (`"高高兴兴"`). null otherwise.
- `tipVi` traps: a separable verb taking an object (见面他 ✗), a measure word a
  Vietnamese learner would not guess, 的/得/地, a Hán Việt false friend (爱人 = vợ/chồng).

## German, French, Spanish

Unchanged from gen-rules v3 section G, plus the two new shared fields: insert
`comparison` after `plural` (and after `hAspire` in French) and `collocations` before
`tipVi`:
```
de: … plural, comparison, verbInfo, reflexive, governs, collocations, tipVi, …
fr: … plural, comparison, hAspire, verbInfo, reflexive, governs, collocations, tipVi, …
es: … plural, comparison, verbInfo, reflexive, governs, serEstar, collocations, tipVi, …
```

## Rules every new field follows

- Grammar terms inside values and sub-keys are in the target language, never English.
- Vietnamese text (`tipVi`, `serEstar`, `collocations[].vi`) follows D (compact), E
  (marks `_ = |`) and I (sensitive topics). `hanViet` is plain lowercase syllables, no
  marks.
- Values are consistent with `word`, `pos`, `usageEn` and each other.
- A field that does not apply is `null`, never `""`, never omitted from a generated card.
