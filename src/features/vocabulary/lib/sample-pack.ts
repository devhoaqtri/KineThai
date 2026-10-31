/**
 * The pack-generation kit: one Markdown file combining the full LLM prompt and a sample
 * pack. Users paste their word list into the marked section, hand the whole file to an
 * AI, and import the result (lib/custom-pack.ts accepts this flat word shape).
 *
 * The rules mirror the word-refinery generator (src/lib/prompt.ts, contract.ts) and the
 * deck conventions in docs/word-joiner-generation-handoff.md and
 * docs/phrase-break-reader-handoff.md; change them there first, then here.
 *
 * Exports: PACK_KIT_MD, downloadPackKit
 */
import { EXAMS, TOPICS } from "./taxonomy";

const TOPIC_LIST = TOPICS.map((t) => `\`${t.id}\``).join(", ");
const EXAM_LIST = EXAMS.map((e) => `\`${e.id}\``).join(", ");

const SAMPLE_PACK_JSON = `{
  "meta": { "name": "Gói mẫu của tôi" },
  "words": [
    {
      "word": "imagine",
      "level": "A1",
      "pos": "verb",
      "ipa": "/ɪˈmædʒ.ɪn/",
      "defVi": "Tự hình_dung trong đầu | những điều chưa thấy tận_mắt.",
      "leadVi": "Chỉ cần nhắm mắt, thấy mình đang=nằm trên bãi_biển.",
      "anticipateVi": "Bay_bổng trong đầu nào!",
      "usageEn": "Can you _____ life without the internet?",
      "usageVi": "Bạn có tưởng_tượng nổi | cuộc_sống không có mạng không?",
      "topics": ["thinking"],
      "exams": [],
      "emphasisVi": ["hình dung", "bãi biển"]
    },
    {
      "word": "explain",
      "level": "A1",
      "pos": "verb",
      "ipa": "/ɪkˈspleɪn/",
      "defVi": "Trình_bày, giải_thích | để người khác hiểu rõ điều gì.",
      "leadVi": "Bà hỏi cách chuyển_khoản, cháu kiên_nhẫn chỉ từng bước.",
      "anticipateVi": "Hiểu rồi thì nói luôn!",
      "usageEn": "Can you _____ this rule to me?",
      "usageVi": "Bạn giải_thích luật này | cho mình được không?",
      "topics": ["communication", "study"],
      "exams": [],
      "emphasisVi": ["giải thích", "kiên nhẫn"]
    },
    {
      "word": "water",
      "level": "A1",
      "pos": "noun",
      "ipa": "/ˈwɔː.tər/",
      "defVi": "Chất_lỏng trong suốt | mà ta uống=mỗi ngày.",
      "leadVi": "Có thứ này thì cây_cối mới sống được.",
      "anticipateVi": "Thứ gì chảy được nhỉ?",
      "usageEn": "Please bring me a glass of _____.",
      "usageVi": "Làm ơn mang cho tôi | một cốc nước.",
      "topics": ["nature", "daily"],
      "exams": [],
      "emphasisVi": ["Chất lỏng", "cây cối"]
    }
  ]
}`;

/**
 * One self-contained Markdown file: a short brief, the word-list slot and a sample output
 * first, so a reader reaches what they act on; every detailed rule follows under
 * "## Detailed rules" (topics as ###, sub-topics as ####).
 */
export const PACK_KIT_MD = `# Vocabulary Pack Generator

- You write Vietnamese vocabulary cards for a mobile "learn one English word at a time" app.
- The reader is a Vietnamese learner: the Vietnamese clues come first and the English word only later, so every card is a small guessing game.
- Make one card for every word in my list below, shaped like the sample output.
- Follow every one of the detailed rules at the end of this file.
- Output ONE valid JSON object and nothing else — no markdown fences, no headings, no commentary.

## My word list (separated by commas, new lines or anything else — treat every token as one word)

<PASTE YOUR WORD LIST HERE>

## Sample output (a valid three-word pack)

\`\`\`json
${SAMPLE_PACK_JSON}
\`\`\`

## Detailed rules

### Output format

\`\`\`json
{
  "meta": { "name": "<short pack name>" },
  "words": [ <one object per word, in the order of my list> ]
}
\`\`\`

### Each word object

\`\`\`json
{
  "word": "the English headword",        // copied exactly from my list, lowercase; letters with an inner ' or - only
  "level": "A1",                          // how hard the English word is: A1 A2 B1 B2 C1 C2
  "pos": "verb",                          // one of noun, verb, adj, adv, prep, conj, phrase
  "ipa": "/ɪˈmædʒ.ɪn/",                   // IPA between slashes
  "defVi": "Vietnamese definition",       // ONE sentence, exactly 8–11 words, at most 140 characters
  "leadVi": "Vietnamese teaser",          // hints at the meaning without naming it; 8–11 words, at most 120 characters
  "anticipateVi": "playful invitation",   // 3–8 words, at most 60 characters; different for every word in the pack
  "usageEn": "Can you _____ it?",         // ONE natural English sentence, at most 20 words, the word replaced by exactly five underscores
  "usageVi": "Vietnamese translation",    // faithful Vietnamese meaning of usageEn
  "topics": ["thinking"],                 // 1–3 tags from the closed list below, most relevant first
  "exams": [],                            // exam tags from the closed list below; [] for everyday words
  "emphasisVi": ["phrase one", "phrase two"] // 2 phrases that glow on screen: one from defVi, one from leadVi
}
\`\`\`

### Field rules

- \`word\`: copy it exactly as I wrote it, in lowercase. One word per object; skip exact duplicates. Multi-word expressions are not supported.
- \`level\`: judge the CEFR level of the English word. The level also tells you how simple the Vietnamese must be — plain everyday Vietnamese for A1–A2.
- \`defVi\`: defines the word in ONE Vietnamese sentence of exactly 8–11 words. It must define this sense precisely, not drift to a near-synonym.
- \`leadVi\`: a small scene or situation that points at the meaning without naming it, exactly 8–11 words. Sharp enough to be guessable, never a giveaway.
- \`anticipateVi\`: a short, lively invitation to guess, 3–8 words. Every word in the pack gets a DIFFERENT line with a different opening. Never fall back on a stock phrase like "Đoán xem nào…".
- \`usageEn\`: one natural sentence of at most 20 words where the target word is replaced by exactly \`_____\` (five underscores). The target word must not appear anywhere else in the sentence.
- \`usageVi\`: a faithful translation of that sentence, with the meaning of the word filled in.
- \`topics\` and \`exams\`: only tags from the lists in "Topics and exams" below. A wrong exam tag is worse than none.

### Breaking marks — required in defVi, leadVi, anticipateVi and usageVi

Vietnamese is written one syllable at a time, so nothing in the text says where a word or a phrase ends, and the app may break a line in the worst place. Three invisible marks tell it. The reader never sees them, and none of them changes a word count.

- \`_\` — ONE WORD. Join the syllables of a single word: \`ba_lô\`, \`học_sinh\`, \`quan_trọng\`.
- \`=\` — LEANS ON ITS NEIGHBOUR. Two words that must stay on one line but are NOT one word: \`con=mèo\`, \`đã=đi\`, \`của=tôi\`.
- \`|\` — PHRASE EDGE. Between two phrases, with a space on each side: \`Chất_lỏng trong suốt | mà ta uống=mỗi ngày.\`

#### Joining syllables with _

- A join is ONE underscore with a letter directly on both sides — no space before or after it.
- Join compounds (\`học_sinh\`, \`điện_thoại\`, \`sức_khỏe\`), reduplicated words (\`thình_thịch\`, \`lấp_lánh\`, \`nhẹ_nhàng\`), loanwords spelled as syllables (\`cà_phê\`, \`ba_lô\`, \`ô_tô\`), multi-syllable function words (\`bởi_vì\`, \`tuy_nhiên\`, \`mặc_dù\`) and proper names (\`Việt_Nam\`, \`Hà_Nội\`).
- Quick test: can another word sit between the two syllables without breaking the meaning? "ăn [nhiều] cơm" works, so those are two words. Nothing fits inside "ba … lô", so that is one word.
- A joined word is normally two syllables, occasionally three, NEVER more than four. Join the real words inside a phrase, not the phrase itself: \`công_nghệ thông_tin\`, never \`công_nghệ_thông_tin\`.

#### Binding neighbours with =

- Use \`=\`, never \`_\`, for a function word and what it leans on: \`của=tôi\`, \`rất=đẹp\`, \`đã=đi\`, \`sẽ=về\`, \`không=biết\`, \`đang=ngủ\`.
- Use \`=\` for a classifier and its noun: \`con=mèo\`, \`cái=bàn\`, \`chiếc=xe\`, \`quyển=sách\`.
- Use \`=\` for a free verb-object pair: \`ăn=cơm\`, \`đọc=sách\`, \`uống=nước\`. Only when the pair means something its parts do not is it one word with \`_\`: \`ăn_mừng\` (celebrate), \`ăn_năn\` (repent).
- Not sure two syllables are one word? Use \`=\`. Not sure they belong together at all? Leave a plain space. A missing mark only allows a line break; a wrong one glues words into a block that cannot wrap and shrinks the whole card.

#### Phrase edges with |

- Put \`|\` where the sentence naturally pauses: between subject and predicate, before a prepositional or time phrase, before a relative clause.
- Every phrase must be at least TWO syllables long. An 8–11 word sentence usually wants one or two \`|\` — never one after every word.
- A comma, full stop or semicolon is already an edge; do not add \`|\` right next to one.

#### Counting and other uses

- Marks never change a count: \`quan_trọng\` is TWO of the 8–11 words. Count syllables as if every mark were a space.
- Punctuation stays outside a join: \`ba_lô,\` not \`ba_lô_,\`.
- Never use an underscore for anything else — no snake_case, no decoration.
- NEVER put \`_\`, \`=\` or \`|\` in \`usageEn\` or in \`word\`. usageEn carries the five-underscore blank, and a mark beside it would be read as part of the blank.
- Wrong: \`Xách_ba_lô lên và đi!\` (joins a verb to its object). Right: \`Xách ba_lô lên và đi!\`
- Wrong: \`Cô ấy ăn_cơm rất_nhanh.\` Right: \`Cô ấy ăn=cơm rất=nhanh.\`
- Wrong: \`điều quan _trọng\` (space beside the join). Right: \`điều quan_trọng\`

### Highlighted phrases (emphasisVi)

- Give exactly 2 phrases: one copied from defVi, one copied from leadVi. Only these glow, so a sentence without one shows no highlight.
- Each phrase is ONE real two-syllable word, joined with \`_\` in the text. Never one syllable, never three or more, never two words that are merely neighbours.
- Choose by MEANING first: if the sentence were cut down to two syllables, which two would have to survive? Those.
- It must pass all of these: it is a headword in a Vietnamese dictionary, nothing can sit between its syllables, and it is not part of a longer word (never \`ký_túc\` from \`ký_túc_xá\`).
- Copy it EXACTLY, diacritics included, but write it PLAIN, with a space where the text has a join: for \`quan_trọng\` in defVi, the entry is "quan trọng".
- Never pick filler: a classifier and its noun ("con mèo"), a number and anything ("hai người"), a quantifier ("mỗi ngày", "cả lớp"), a verb with a direction or result ("nhớ ra", "xem lại"), a comparison ("cao nhất"), a noun with a plain adjective ("sách cũ"), a time phrase, a place name, a function word (và, là, của, có, được, trong, cho, với, một, rất, cũng, đã, đang, sẽ, không, những, các, thì, mà), or anything that spans a \`=\`, a \`|\` or a comma.
- If no word in the sentence passes, rewrite the sentence around one that does.
- At most 30 characters each, and the two must differ.

### Language and guessing rules

- Correct Vietnamese with full diacritics in every Vietnamese field.
- Never put the English word, or any English word, in defVi, leadVi or anticipateVi.
- Never define a word with itself, a cognate or a transliteration — that gives the answer away.
- Write fluent, natural Vietnamese a native speaker would say, not translationese. Warm and conversational beats stiff and formal.
- Be specific to this word: a clue that would fit dozens of other words is a defect.

### Topics and exams

- topics (pick 1–3, most relevant first): ${TOPIC_LIST}.
- exams (only when the word genuinely belongs to that exam's list; most words have none): ${EXAM_LIST}.
- Never invent a tag outside these lists.

### Check before you answer

- The output parses with JSON.parse: double quotes, no trailing commas, no comments, no markdown fences.
- Every word from my list appears exactly once, in my order.
- defVi and leadVi have 8–11 words each (counting syllables), anticipateVi 3–8, usageEn at most 20 words with exactly one \`_____\`.
- Every \`_\` has a letter on both sides; no joined unit is longer than four syllables; no mark appears in usageEn or word.
- Stripping every mark (\`_\` and \`=\` become spaces, \`|\` disappears) gives back a natural sentence, unchanged.
- A Vietnamese sentence of six syllables or more almost always contains a multi-syllable word — if yours has no \`_\` at all, look again.
- No anticipateVi line repeats; no English word appears in a Vietnamese clue.
`;

/** Download the kit as a single Markdown file (same-origin blob, works everywhere). */
export function downloadPackKit() {
  const blob = new Blob([PACK_KIT_MD], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "tao-goi-tu-vung.md";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
