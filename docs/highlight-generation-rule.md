# HANDOFF: the strict highlight and connector rule

**For:** the wording agent, and anything else that writes Vietnamese clue text for a deck.
**Replaces:** every earlier highlight instruction. Where this disagrees with
[word-joiner-generation-handoff.md](word-joiner-generation-handoff.md), this wins.

## Why it is this strict

The reader glows a word only when the deck wrote it inside `/…/`, as two connected
syllables (`lib/highlight-gate.ts`). A connector alone proves nothing: `_` also stops a line
break, so the decks hold joins like `cả_lớp` that are not words. The app never picks a word
for you. A field without a valid mark shows no highlight.

Audit of the 27,759 clue fields. Rows overlap; the first two are from before the repair
pass that added 12,356 marks, the others from after it:

| Error                                             | Fields | Example                    |
| ------------------------------------------------- | ------ | -------------------------- |
| No mark at all                                    | 14,960 | `Kẹt \| xe \| à?`          |
| Marked one syllable instead of a word             | 4,809  | `mình /hỏi/ thầy`          |
| `\|` after nearly every word, so no word survives | 1,197  | `Đang \| đá \| hăng, \| …` |
| Still dark after the repair, four words or fewer  | 3,252  | `Được chưa ạ?`             |
| Marked a loose phrase, not a word                 | 980    | `/mười_tám/`, `/cao_nhất/` |

## Text to paste into the wording agent's prompt

```
HIGHLIGHT AND CONNECTOR RULES. MANDATORY.
These override any other instruction. A field that breaks one rule is REJECTED. Rewrite it;
never return it and never leave it for later.

RULE 1. ONE MARK IN EVERY CLUE FIELD
Every defVi, leadVi and anticipateVi contains exactly one mark, written inline as /x_y/.
- Exactly two syllables, exactly one connector, inside the slashes.
- No field may have zero marks. No field may have two.
- Each clue field is one sentence.

RULE 2. THE MARKED WORD MUST PASS ALL FOUR TESTS
1. DICTIONARY: it is a headword in a Vietnamese dictionary, on its own.
2. INSEPARABLE: no word can sit between the two syllables without breaking the meaning.
3. WHOLE: it is not part of a longer word. Never ký_túc from ký_túc_xá, never câu_lạc from
   câu_lạc_bộ, never sô_cô from sô_cô_la.
4. POINT: if the sentence were cut down to two syllables, these two would have to survive.
If you hesitate on any test, it fails. Choose another word.

RULE 3. NEVER MARK THESE
- One syllable: /hỏi/, /phanh/, /gắt/
- Two words with a space: /nắng gắt/
- Three or more syllables, even real words: /thời_khóa_biểu/, /ký_túc_xá/
- Number + anything: ba_lần, năm_phút, mười_tám, hai_bên
- Quantifier + anything: mỗi_ngày, cả_lớp, mọi_lúc, nhiều_lần, vài_trang, từng_chữ, ít_tiền
- Tense, degree or negation + anything: đã_xong, đang_làm, sẽ_đi, rất_cao, không_đúng,
  chưa_hết, bị_trêu, được_khen, cũng_vậy
- Classifier + noun: cái_bàn, con_mèo, chiếc_áo, cuốn_sách, tờ_giấy, quả_trứng
- Verb + direction or result: nhớ_ra, nghĩ_ra, xem_lại, chia_ra, đặt_xuống, bỏ_đi, làm_xong,
  chịu_được
- Comparison: cao_nhất, tốt_hơn, nhiều_hơn
- Pointing or asking: lúc_nào, chỗ_khác, người_khác, ở_đâu, thế_nào
- Noun + plain adjective, or any free pairing: máy_cũ, sách_cũ, mưa_to, ghi_tên, gọt_táo,
  biển_xanh
- Time phrases: mỗi_tối, tháng_tám, đầu_tuần, tối_qua
- Place and person names: đà_lạt, sa_pa
- Anything holding và, hoặc, nhưng
A whole word that merely starts or ends like this is fine, because it passes Rule 2:
ba_lô, một_mình, không_khí, còn_lại, xảy_ra, nhận_ra, duy_nhất, ngược_lại.

RULE 4. NO VALID WORD MEANS REWRITE THE SENTENCE
Never mark a weak word to fill the slot. Never glue two words to make one. Write the
sentence again around a real word, keeping its meaning, tone and length limit. This applies
to the shortest lines too: anticipateVi needs a word as much as defVi does.
- Wrong: Được chưa ạ?               Right: /Chắc_chắn/ chưa ạ?
- Wrong: Về trễ, đứng ngoài cổng?   Right: Về trễ, /cửa_chính/ đã khóa?

RULE 5. CONNECTORS
- _ joins the syllables of ONE real word and nothing else. Join EVERY real multi-syllable
  word in the sentence, marked or not.
- = keeps two separate words on one line: cả=lớp, nhớ=tên, ăn=đủ, con=mèo, rất=đẹp.
- Never use _ to stop a line break. That is what = is for.
  Wrong: cả_lớp, nhớ_tên, mua_và_bán, không_có_việc.
- /x=y/ is a last resort: only a fixed verb-object pair (/ăn=cơm/), only when Rule 4 cannot
  find a _ word. Never on anything listed in Rule 3.
- Inside a chain, the mark wraps the word only: đã=/bắt_chuyện/.
- Slashes wrap the whole word. Never /quan/_trọng, never quan_/trọng/.
- Punctuation stays outside: /quan_trọng/, never /quan_trọng,/

RULE 6. PHRASE EDGES
- | goes only between phrases, with a space each side.
- Every phrase is at least two syllables. Usually one or two | per sentence, never one after
  every word.
- | never splits a word. Wrong: Kẹt | xe | à?   Right: /Kẹt_xe/ à?
- A mark never crosses |, a comma or a full stop.

RULE 7. emphasisVi
If your format has emphasisVi, list the marked words in field order (defVi, leadVi,
anticipateVi), plain, with a space where the text has the connector: /quan_trọng/ becomes
"quan trọng". It repeats the inline marks and never replaces them.

RULE 8. EVERY CLUE IS A WHOLE SENTENCE. NEVER DELETE A WORD TO HIDE THE ANSWER.
- A clue may contain the Vietnamese meaning. If you would rather not use it, write a
  different sentence that does not need it. Never take a sentence and cut the word out.
- Clue fields have no blanks. The usage sentence's _____ is the only blank, and only in
  English.
- Nothing may be left without its head: no sải without bơi, no pin without đèn, no
  classifier (ổ, tấm, cuốn, chiếc) without its noun, no ghi / đặt / lật / bật without its
  object.
- Wrong: Hè này, tôi | ra hồ /trường_học/ sải mỗi=sáng.      (bơi was cut)
  Right: Hè này, tôi | ra hồ /trường_học/ | bơi sải mỗi=sáng.
- Wrong: Đi /dã_ngoại/, tôi | gói sẵn mấy ổ kẹp trứng.        (bánh_mì was cut)
  Right: Đi /dã_ngoại/, tôi | gói sẵn mấy ổ=bánh_mì kẹp trứng.

CHECK EVERY FIELD BEFORE RETURNING. ANY "NO" MEANS REWRITE.
1. Exactly one /x_y/ in this field?
2. Does it pass all four tests in Rule 2?
3. Is it absent from every list in Rule 3?
4. Is every real multi-syllable word joined with _, and every _ on a real word?
5. Is every | between phrases of two syllables or more, and none inside a word?
6. Is it one sentence, inside its length limit?
7. Does removing every mark leave a natural sentence?
8. Read cold, by someone who has never seen the card: is it complete, with no word cut out?
```

## Worked fixes

| Wrong                                                                     | Breaks | Right                                                       |
| ------------------------------------------------------------------------- | ------ | ----------------------------------------------------------- |
| `Nghe giảng về vũ_trụ, mình /hỏi/ thầy \| đến hết giờ.`                   | 3      | `Nghe giảng về /vũ_trụ/, mình hỏi thầy \| đến hết giờ.`     |
| `Đi phượt, \| bạn kiểm_tra \| /phanh/, đèn trước khi chạy.`               | 3      | `Đi phượt, \| bạn /kiểm_tra/ \| phanh, đèn trước khi chạy.` |
| `Đang \| đá \| hăng, \| Nam \| ôm \| chân \| ngồi \| bệt \| xuống \| cỏ.` | 1, 6   | `Đang đá hăng, \| Nam ôm chân \| /ngồi_bệt/ xuống cỏ.`      |
| `Kẹt \| xe \| à?`                                                         | 1, 6   | `/Kẹt_xe/ à?`                                               |
| `Vân tay mỗi người \| chẳng ai \| trùng với ai.`                          | 1, 5   | `/Vân_tay/ mỗi người \| chẳng ai \| trùng với ai.`          |
| `Có buýt điện, \| tôi đi=học \| rẻ hẳn mỗi=tháng.`                        | 1      | `Có buýt điện, \| tôi /đi_học/ \| rẻ hẳn mỗi=tháng.`        |
| `Bạn sẽ dậy /mỗi_ngày/ lúc mấy giờ?`                                      | 3      | `Bạn sẽ /thức_dậy/ mỗi=ngày lúc mấy giờ?`                   |

## For whoever runs the wording agent

- **Where marks are read:** only from `/…/` in the text. A flat batch's `emphasisVi` is
  written into the text on import, but only where the word is already joined with `_`.
- **Acceptance:** `npm run check:emphasis-runs` fails if a page breaks the gate, or if the
  number of dark clue pages rises above `MAX_DARK_CLUE_PAGES`. Lower that number whenever a
  pass over the decks brings it down. Never raise it to let a deck through.
- **The bar for a rewritten deck:** zero dark pages.
- **Rewrites live in the source too:** a re-import replaces the served deck, so a sentence
  fixed only in `src/features/vocabulary/data/` is lost. Fix the source batch as well.
