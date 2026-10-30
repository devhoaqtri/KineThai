/**
 * Japanese deck format: the reader strips the display marks, draws 文節 flush, breaks
 * pages only on whole chunks, and treats a chunk edge as a phrase edge in line layout.
 * Run: npx tsx scripts/check-japanese-layout.ts
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getDataEmphasisWordSpans,
  getJapaneseLayoutMetrics,
  getJapaneseMoraTokens,
  getWords,
  isLikelyJapaneseText,
  solveMeasuredLines,
  type MeasuredLineBounds,
  type MeasuredSegment,
} from "../src/features/kinetic-text";
import { getEmphasizedWordIndexes } from "../src/features/post-player/lib/feed-emphasis";
import {
  paginateJapaneseChunks,
  parseJapaneseMarkup,
  stripJapaneseMarks,
} from "../src/features/vocabulary/lib/ja-text";
import { encodeWordJoiners } from "../src/features/vocabulary/lib/word-joiner";
import { buildStages } from "../src/features/vocabulary/lib/stages";
import {
  mergeCatalogs,
  normalizeDeck,
  splitJapaneseDeck,
} from "../src/features/vocabulary/lib/schema";
import type { VocabularyWord } from "../src/features/vocabulary/lib/schema";
import { readCatalogPage } from "../src/features/vocabulary/lib/paging";
import { CEFR_TRACKS, formatLevelBand, tracksFor } from "../src/features/vocabulary/lib/difficulty";

// ── Detection: kana is the signal; Vietnamese, English and Chinese never trigger.
assert.equal(isLikelyJapaneseText("目を とじるだけで、"), true);
assert.equal(isLikelyJapaneseText("カタカナ"), true);
assert.equal(isLikelyJapaneseText("Chất lỏng trong suốt"), false);
assert.equal(isLikelyJapaneseText("a quiet morning"), false);
assert.equal(isLikelyJapaneseText("他很诚实。"), false);
console.log("OK — kana marks a Japanese page");

// ── Mora split: the feed player reveals a 文節 one glyph at a time (getJapaneseMoraTokens).
// Layout still packs whole 文節; this finer split only drives the entrance cascade.
assert.deepEqual(getJapaneseMoraTokens("ひこうきが"), ["ひ", "こ", "う", "き", "が"]);
// Spaces between 文節 drop; a kanji splits per glyph exactly like a kana.
assert.deepEqual(getJapaneseMoraTokens("ひこうきが 空へ"), [
  "ひ",
  "こ",
  "う",
  "き",
  "が",
  "空",
  "へ",
]);
// A closing mark glues to the glyph before it — it never stands alone or opens a unit.
assert.deepEqual(getJapaneseMoraTokens("とび立ち、"), ["と", "び", "立", "ち、"]);
// A masked answer blank (and any Latin run) stays whole.
assert.deepEqual(getJapaneseMoraTokens("見た_____"), ["見", "た", "_____"]);
// The units always reconstruct the visible text.
assert.equal(getJapaneseMoraTokens("頭の中で").join(""), "頭の中で");
console.log("OK — a Japanese 文節 splits into per-mora entrance units");

// ── Display: spaces, `_`, `=` and `|` never reach a reader.
const marked = "まだ 見た=ことの ない ものを | 頭の 中で | 思いうかべる=こと。";
assert.equal(stripJapaneseMarks(marked), "まだ見たことのないものを頭の中で思いうかべること。");
// Full-width space and the encoder's stand-in characters are display marks too.
assert.equal(stripJapaneseMarks("まだ\u3000見た\u00a0こと\u2060の"), "まだ見たことの");
console.log("OK — Japanese prose carries no display marks");

// ── Parsing: `_`/`=` join a token; `|` starts a chunk at a token index.
const imagined = parseJapaneseMarkup(marked);
assert.deepEqual(imagined.chunks, [
  ["まだ", "見たことの", "ない", "ものを"],
  ["頭の", "中で"],
  ["思いうかべること。"],
]);
assert.equal(imagined.text, "まだ 見たことの ない ものを 頭の 中で 思いうかべること。");
assert.deepEqual(imagined.phraseEdges, [4, 6]);
assert.deepEqual(parseJapaneseMarkup("気が_付く | 見えて=くる"), {
  text: "気が付く 見えてくる",
  chunks: [["気が付く"], ["見えてくる"]],
  phraseEdges: [1],
});
// A base field has already been through the catalog encoder: its joins are NBSP/WJ,
// which must stay inside the token rather than split it. (The `|` edge is gone there.)
assert.deepEqual(parseJapaneseMarkup(encodeWordJoiners("気が_付く 見えて=くる")).chunks, [
  ["気が付く", "見えてくる"],
]);
console.log("OK — marks are read as tokens and phrase edges");

// ── Pagination: a short field stays whole; a long one splits only between chunks.
const short = parseJapaneseMarkup("どこから | 飛び立つのかな？");
assert.equal(paginateJapaneseChunks(short.chunks, 7).length, 1);

const chunks = [
  ["あ", "い", "う"],
  ["え", "お", "か"],
  ["き", "く", "け"],
  ["さ", "し", "す"],
  ["せ", "そ", "た。"],
];
const pages = paginateJapaneseChunks(chunks, 7);
assert.deepEqual(
  pages.map((page) => getWords(page.text).length),
  [6, 6, 3],
);
assert.deepEqual(pages[0]!.phraseEdges, [3]);
assert.deepEqual(pages[1]!.phraseEdges, [3]);
assert.deepEqual(pages[2]!.phraseEdges, []);
// Reassembling the pages loses nothing, and no page starts inside a chunk.
assert.deepEqual(
  pages.flatMap((page) => getWords(page.text)),
  chunks.flat(),
);
console.log("OK — pages break only on whole chunks");

// ── Metrics: 文節 are packed flush and every token survives in order.
const tokens = ["まだ", "見たことの", "ない", "ものを", "頭の", "中で", "思いうかべること。"];
const layout = getJapaneseLayoutMetrics(tokens, 390, 48);
assert.deepEqual(
  layout.lines.flatMap((line) => line.segments.flatMap((seg) => seg.words.map((w) => w.text))),
  tokens,
);
assert.ok(layout.lines.length >= 2, "a seven-token clue should wrap");
assert.ok(layout.suggestedFitScale <= 1);
console.log("OK — Japanese tokens pack into staggered lines with no gap");

// ── Phrase edges in the solver: a break on the edge wins; zero gap fits one more unit.
function segments(count: number, widthEm = 1): MeasuredSegment[] {
  return Array.from({ length: count }, (_, index) => ({
    segment: { key: String(index), words: [{ text: `t${index}`, index }] },
    widthEm,
    heightEm: 1.25,
  }));
}
const bounds = (gapEm: number): MeasuredLineBounds => ({
  lineWidthPx: 4.1,
  hardHeightPx: 3.2,
  budgetHeightPx: 3.2,
  budgetLineEm: 1.25,
  maxFontPx: 100,
  floorFontPx: 10,
  gapEm,
  lineGapEm: 0,
});
const lengths = (solved: ReturnType<typeof solveMeasuredLines>) =>
  solved ? solved.lines.map((line) => line.segments.length) : [];

// A break one 文節 before the edge would fit three-and-three; the edge itself wins.
assert.deepEqual(lengths(solveMeasuredLines(segments(6), bounds(0), { phraseEdges: [4] })), [4, 2]);
// With the Vietnamese gap the same page only fits three per line, and the edge is there.
assert.deepEqual(
  lengths(solveMeasuredLines(segments(6), bounds(0.24), { phraseEdges: [3] })),
  [3, 3],
);
console.log("OK — a phrase edge is preferred over a break one 文節 away");

// ── End to end: a Japanese-led word (no Vietnamese lead) still builds every clue stage.
const word = {
  id: "airport",
  word: "airport",
  pos: "noun",
  ipa: "/ˈeə.pɔːt/",
  defVi: "Sân bay",
  leadVi: "",
  anticipateVi: "",
  localized: {
    ja: {
      lead: "スーツケースを /引いて 荷物検査を/ 通り、 | 出発ロビーで 待つ。",
      def: chunks.map((chunk) => chunk.join(" ")).join(" | "),
      guess: "どこから | 飛び立つのかな？",
    },
  },
  usage: [],
  emphasis: [],
} as unknown as VocabularyWord;

const stages = buildStages(word, "detective", "ja");
const definitionPages = stages.filter((stage) => stage.id.startsWith("definition"));
assert.equal(definitionPages.length, 3, "a 15-token definition should make three pages");
assert.deepEqual(
  definitionPages.map((page) => page.text.split(/\s+/).length),
  [6, 6, 3],
);
assert.deepEqual(definitionPages[0]!.phraseEdges, [3]);
assert.deepEqual(definitionPages[1]!.phraseEdges, [3]);
for (const page of definitionPages) {
  assert.ok(!/[_=|]/.test(page.text), `display marks leaked: ${page.text}`);
}
assert.ok(
  stages.some((stage) => stage.id.startsWith("lead")),
  "a Japanese-only lead renders",
);
assert.ok(
  stages.some((stage) => stage.id.startsWith("anticipation")),
  "a Japanese-only hook renders",
);
console.log("OK — buildStages carries Japanese pages, chunks and edges");

// ── A flat generated deck (defJa/leadJa/anticipateJa/usageJa/emphasisJa) is lifted
//    into the schema: marks stay on localized.ja for the reader, base fields are clean.
const flatDeck = [
  {
    word: "airport",
    pos: "noun",
    ipa: "/ˈeə.pɔːt/",
    kanjiTier: 1,
    meaningJa: "空港",
    defJa: "飛行機が 飛び立ち、 | 人を 乗せたり | 降ろしたり する 場所。",
    leadJa: "スーツケースを 引いて | 荷物検査を 通り、 | 出発ロビーで 待つ。",
    anticipateJa: "どこから | 飛び立つのかな？",
    usageEn: "We arrived at the _____ two hours early.",
    usageJa: "わたしたちは | 二時間 早く | 空港に 着いた。",
    topics: ["travel"],
    exams: ["toeic"],
    emphasisJa: ["飛び立ち", "荷物検査"],
  },
];
const [flatWord] = normalizeDeck(flatDeck).words;
assert.equal(flatWord!.id, "airport");
assert.equal(flatWord!.meaningJP, "空港");
assert.equal(flatWord!.defVi, "飛行機が飛び立ち、人を乗せたり降ろしたりする場所。");
assert.equal(
  flatWord!.localized?.ja?.def,
  "飛行機が 飛び立ち、 | 人を 乗せたり | 降ろしたり する 場所。",
);
assert.equal(flatWord!.usage[0]?.vi, "わたしたちは二時間早く空港に着いた。");
assert.equal(flatWord!.usage[0]?.glosses?.ja, "わたしたちは | 二時間 早く | 空港に 着いた。");
assert.deepEqual(flatWord!.emphasis, ["飛び立ち", "荷物検査"]);
const flatStages = buildStages(flatWord!, "detective", "ja");
const flatDefinition = flatStages.find((stage) => stage.id.startsWith("definition"));
assert.deepEqual(flatDefinition?.phraseEdges, [2, 4]);
assert.deepEqual(flatDefinition?.dataEmphasis, ["飛び立ち", "荷物検査"]);
assert.deepEqual(
  [...getEmphasizedWordIndexes(getWords(flatDefinition!.text), flatDefinition!.dataEmphasis)],
  [1],
  "Japanese kanji-bearing emphasisJa matches its 文節 token instead of splitting per glyph",
);
// Stem annotations match the 文節 carrying an attached particle or conjugation suffix.
assert.deepEqual(getDataEmphasisWordSpans(["飛行機が", "離着陸し、", "乗客が"], ["離着陸"]), [
  { start: 1, length: 1 },
]);
assert.deepEqual(getDataEmphasisWordSpans(["電車で", "目当ての", "場所に"], ["目当て"]), [
  { start: 1, length: 1 },
]);
assert.deepEqual(getDataEmphasisWordSpans(["自分の", "手さえ", "見えない"], ["さえ"]), [
  { start: 1, length: 1 },
]);
assert.ok(!/[_=|]/.test(flatDefinition!.text), "flat deck marks leaked into the page");
assert.ok(
  flatStages.some((stage) => stage.id.startsWith("lead")),
  "the flat lead reaches the reader",
);
const [named] = normalizeDeck([
  { word: "bank", defJa: "銀行が ある 場所。", meaningJa: "ぎんこう", meaningJP: "銀行" },
]).words;
assert.equal(named!.meaningJP, "銀行", "meaningJP wins over meaningJa");
const [kanjiOnly] = normalizeDeck([
  { word: "robbery", defJa: "銀行から お金を 盗む こと。", meaningJa: "銀行_強盗" },
]).words;
assert.equal(kanjiOnly!.meaningJP, "銀行強盗", "a kanji-only gloss is stored in display form");
console.log("OK — a flat generated Japanese deck normalizes and plays");

// ── A 0B multi-level deck becomes one flat deck per reader level, then merges back so
//    every level keeps its own card for the same English word.
const multiDeck = {
  words: [
    {
      word: "airport",
      pos: "noun",
      usageEn: "We arrived at the _____ two hours early.",
      topics: ["travel"],
      exams: ["toeic"],
      defaultLevel: "JHIGH",
      cefr: "A2",
      levels: {
        JPRIM: {
          kanjiTier: 0,
          meaningJP: "空港",
          defJa: "ひこうきが 空へ とび立ち、 | 人を 乗せたり | おろしたり する 場所。",
          leadJa: "大きな かばんを 引いて、 | ひこうきに のる 前に | ロビーで 待つ。",
          anticipateJa: "どこから | とび立つのかな？",
          usageJa: "わたしたちは | 二時間 早く | 空港に 着いた。",
          emphasisJa: ["とび立ち", "かばん", "空港"],
        },
        JSEC: {
          kanjiTier: 1,
          meaningJP: "空港",
          defJa: "飛行機が 飛び立ち、 | 人を 乗せたり | 降ろしたり する 場所。",
          leadJa: "スーツケースを 引いて、 | 飛行機に 乗る 前に | ロビーで 待つ。",
          anticipateJa: "どこから | 飛び立つのかな？",
          usageJa: "私たちは | 二時間 早く | 空港に 着いた。",
          emphasisJa: ["飛び立ち", "スーツケース", "空港"],
        },
        JHIGH: {
          kanjiTier: 2,
          meaningJP: "空港",
          defJa: "飛行機が 飛び立ち、 | 乗客を 乗せたり | 降ろしたり する 場所。",
          leadJa: "スーツケースを 引いて、 | 飛行機に 乗る 前に | ロビーで 待つ。",
          anticipateJa: "どこから | 飛び立つのかな？",
          usageJa: "私たちは | 二時間 早く | 空港に 着いた。",
          emphasisJa: ["飛び立ち", "スーツケース", "空港"],
        },
        JCOLL: {
          kanjiTier: 3,
          meaningJP: "空港",
          defJa: "飛行機が 離着陸し、 | 乗客が | 乗り降りする 場所。",
          leadJa: "スーツケースを 引いて、 | 搭乗前に | 出発ロビーで 待つ。",
          anticipateJa: "どこから | 飛び立つのかな？",
          usageJa: "私たちは | 二時間 早く | 空港に 到着した。",
          emphasisJa: ["離着陸", "スーツケース", "空港"],
        },
      },
      defVi: "Sân bay. Nơi máy bay cất cánh, đón và trả hành khách.",
      leadVi: "Kéo va li, ngồi chờ ở sảnh trước khi lên máy bay.",
      anticipateVi: "Máy bay cất cánh từ đâu nhỉ?",
    },
  ],
};
const split = splitJapaneseDeck(multiDeck);
assert.deepEqual(
  split?.map((deck) => deck.level),
  ["JPRIM", "JSEC", "JHIGH", "JCOLL"],
);
const splitWords = split!.map(({ level, input }) => {
  const word = normalizeDeck(input).words[0]!;
  assert.equal(word.id, `airport-${level.toLowerCase()}`);
  assert.equal(word.level, level);
  assert.equal(word.cefr, "A2");
  assert.equal(word.meaningJP, "空港");
  assert.ok(word.localized?.ja?.def);
  assert.equal(word.defVi, "Sân bay. Nơi máy bay cất cánh, đón và trả hành khách.");
  return word;
});
assert.equal(splitJapaneseDeck(flatDeck), null, "a flat deck is not split");
const multiCatalog = mergeCatalogs(
  ...split!.map(({ level, input }) => ({
    revision: level,
    name: level,
    ...normalizeDeck(input),
  })),
);
assert.equal(multiCatalog.words.length, 4, "same headword survives at every reader level");
assert.equal(new Set(multiCatalog.words.map((word) => word.word)).size, 1);
const multiPage = readCatalogPage(multiCatalog, {
  seed: "multi-level",
  topic: "",
  level: "",
  difficulty: "",
  position: 0,
  limit: 4,
});
assert.equal(multiPage.total, 1, "the catalog summary counts unique words");
assert.equal(multiPage.matching, 1, "the feed shows one card per headword");
assert.equal(multiPage.entries[0]!.word.level, "JHIGH", "the default level is preferred");
assert.equal(multiPage.entries[0]!.word.cefr, "A2", "the English CEFR level survives the split");
assert.deepEqual(multiCatalog.trackLevels, ["A2"]);
assert.equal(splitWords.length, 4);
console.log("OK — a 0B multi-level deck splits, merges and streams once per word");

// ── Japanese school ids are internal: no reader-facing band carries them.
assert.equal(formatLevelBand(["JPRIM"]), "");
assert.equal(formatLevelBand(["JPRIM", "JCOLL"]), "");
assert.equal(formatLevelBand(["A1", "A2"]), "A1–A2");
assert.equal(formatLevelBand(["JPRIM", "A1"]), "A1");
assert.deepEqual(
  tracksFor("ja").map((track) => track.id),
  CEFR_TRACKS.map((track) => track.id),
  "the title difficulty picker uses the English usage tracks for Japanese",
);
console.log("OK — Japanese level ids stay out of reader bands; CEFR drives the title picker");

// ── Shipped data/ja/*.json packs: every clue page highlights, and each pack's
// authored emphasisJa[0] is real Japanese the page can show.
// A clue page of four tokens or fewer is a short sentence: the reader keeps the single
// earliest highlight there (limitShortSentenceEmphasis), so emphasisJa[0] may lose to a
// sibling annotation on that page. On any longer page that carries the phrase it must win.
const jaDir = fileURLToPath(new URL("../src/features/vocabulary/data/ja", import.meta.url));
const jaFiles = readdirSync(jaDir)
  .filter((name) => name.endsWith(".json"))
  .sort();
assert.ok(jaFiles.length > 0, "no shipped Japanese packs found");
let shippedWords = 0;
let shortPageDeferrals = 0;
for (const file of jaFiles) {
  const pack = JSON.parse(readFileSync(join(jaDir, file), "utf8")) as {
    count?: number;
    words: VocabularyWord[];
  };
  assert.equal(
    pack.count ?? pack.words.length,
    pack.words.length,
    `${file}: count disagrees with words`,
  );
  for (const entry of pack.words) {
    shippedWords += 1;
    assert.ok(entry.emphasis && entry.emphasis.length >= 2, `${entry.id}: missing emphasis`);
    const targetKey = entry.emphasis[0]!.replace(/《[^》]*》/g, "").replace(/[^\p{L}\p{N}]+/gu, "");
    const cluePages = buildStages(entry, "detective", "ja").filter(
      (stage) => stage.id.startsWith("lead") || stage.id.startsWith("definition"),
    );
    let inClueText = false;
    for (const stage of cluePages) {
      const pageWords = getWords(stage.text);
      const indexes = [
        ...getEmphasizedWordIndexes(pageWords, stage.dataEmphasis, stage.boundPhrases),
      ];
      assert.ok(indexes.length > 0, `${entry.id}: clue page ${stage.id} highlights nothing`);
      if (
        !stage.text
          .replace(/《[^》]*》/g, "")
          .replace(/[^\p{L}\p{N}]+/gu, "")
          .includes(targetKey)
      )
        continue;
      inClueText = true;
      const highlighted = indexes.some((idx) => {
        const wordKey = pageWords[idx]!.replace(/《[^》]*》/g, "").replace(/[^\p{L}\p{N}]+/gu, "");
        return wordKey.includes(targetKey) || targetKey.includes(wordKey);
      });
      if (highlighted) continue;
      assert.ok(
        pageWords.length <= 4,
        `${entry.id}: emphasis "${entry.emphasis[0]}" did not highlight on clue page ${stage.id}`,
      );
      shortPageDeferrals += 1;
    }
    assert.ok(
      inClueText,
      `${entry.id}: emphasis "${entry.emphasis[0]}" is not in any authored Japanese clue`,
    );
  }
}
console.log(
  `OK — all ${shippedWords} shipped Japanese entries carry their emphasisJa on a clue page` +
    (shortPageDeferrals
      ? ` (${shortPageDeferrals} short pages defer to their first highlight)`
      : ""),
);

console.log("\nAll Japanese layout checks passed.");
