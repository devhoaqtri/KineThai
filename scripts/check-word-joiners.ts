/**
 * Word joiner: deck text joins the syllables of one word with `_`; a reader never sees
 * the underscore, and the word is never split across two lines.
 * Run: npx tsx scripts/check-word-joiners.ts
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getEmphasisPhraseKeysForLayout,
  getVietnameseLayoutMetrics,
  getWords,
} from "../src/features/kinetic-text";
import { getEmphasizedWordIndexes } from "../src/features/post-player/lib/feed-emphasis";
import { buildStages } from "../src/features/vocabulary/lib/stages";
import type { Catalog, VocabularyWord } from "../src/features/vocabulary/lib/schema";
import {
  countJoinedUnits,
  encodeWordJoiners,
  splitPhrases,
  splitWordJoiners,
  stripWordJoiners,
  withWordJoiners,
} from "../src/features/vocabulary/lib/word-joiner";

const NBSP = String.fromCharCode(0xa0);
const WJ = String.fromCharCode(0x2060);

// ── Encoding: the authored underscore becomes a character browsers will not break at.
assert.equal(encodeWordJoiners("Xách ba_lô lên"), `Xách ba${NBSP}lô lên`);
assert.equal(encodeWordJoiners("điều quan_trọng nhất,"), `điều quan${NBSP}trọng nhất,`);
assert.equal(encodeWordJoiners("thình_thịch_thình"), `thình${NBSP}thịch${NBSP}thình`);
// Between two Han glyphs there is no space to keep, only a break to forbid.
assert.equal(encodeWordJoiners("他很诚_实。"), `他很诚${WJ}实。`);
// The answer blank is a RUN of underscores and is left exactly as written.
assert.equal(encodeWordJoiners("I ____ you"), "I ____ you");
assert.equal(encodeWordJoiners("Cô ấy rất _____."), "Cô ấy rất _____.");
assert.equal(encodeWordJoiners("từ__lạ"), "từ__lạ");
// An underscore that is not between letters is not a join.
assert.equal(encodeWordJoiners("_đầu cuối_"), "_đầu cuối_");
// Idempotent, and a no-op without joins.
assert.equal(encodeWordJoiners(encodeWordJoiners("ba_lô")), `ba${NBSP}lô`);
assert.equal(encodeWordJoiners("không có gì"), "không có gì");
console.log("OK — joins encode to no-break characters; blanks are untouched");

// ── Reading joins back, from either form.
for (const source of ["Xách ba_lô lên và đi_bộ.", `Xách ba${NBSP}lô lên và đi${NBSP}bộ.`]) {
  const { text, bound } = splitWordJoiners(source);
  assert.equal(text, "Xách ba lô lên và đi bộ.");
  assert.deepEqual(bound, ["ba lô", "đi bộ."]);
}
assert.deepEqual(splitWordJoiners("他很诚_实。"), { text: "他很诚实。", bound: ["诚实"] });
assert.deepEqual(splitWordJoiners("không có gì"), { text: "không có gì", bound: [] });
assert.equal(stripWordJoiners("ba_lô quan_trọng"), "ba lô quan trọng");
assert.equal(countJoinedUnits("Xách ba_lô lên"), 4);
console.log("OK — joined words are read back as phrases; text comes out plain");

// ── A catalog is made reader-ready once, on the way in.
const word = {
  id: "backpack",
  word: "backpack",
  defVi: "Cái ba_lô để đựng đồ, rất /quan_trọng/ khi đi_học.",
  leadVi: "Sáng nào cũng đeo ba_lô ra cửa.",
  anticipateVi: "Đoán thử_xem!",
  emphasis: ["quan_trọng"],
  pos: "",
  ipa: "",
  topic: "general",
  topics: ["general"],
  usage: [{ en: "I carry a ____ to school.", vi: "Tôi đeo ba_lô đến trường." }],
} as unknown as VocabularyWord;
const catalog = {
  revision: "r",
  name: "n",
  count: 1,
  topics: [],
  levels: [],
  words: [word],
} as Catalog;
const ready = withWordJoiners(catalog).words[0]!;
for (const field of [ready.defVi, ready.leadVi, ready.anticipateVi, ready.usage[0]!.vi]) {
  assert.ok(!/(?<=\p{L})_(?=\p{L})/u.test(field), `an underscore reached a reader: ${field}`);
  assert.ok(field.includes(NBSP), `the join was lost: ${field}`);
}
assert.equal(ready.usage[0]!.en, "I carry a ____ to school.", "the answer blank survives");
assert.deepEqual(ready.emphasis, ["quan trọng"], "highlight phrases are stored plain");
const plain = {
  ...catalog,
  words: [
    { ...word, defVi: "Không có gì", leadVi: "", anticipateVi: "", emphasis: undefined, usage: [] },
  ],
} as Catalog;
assert.equal(withWordJoiners(plain), plain, "a catalog without joins is returned as is");
console.log("OK — catalogs are encoded on load; untouched decks pass through");

// ── Stages: kinetic text is plain, and carries the words that must stay whole.
for (const source of [word, ready]) {
  const stages = buildStages(source, "detective");
  for (const stage of stages) {
    assert.ok(
      !stage.text.includes(NBSP) && !stage.text.includes(WJ),
      `${stage.id}: encoded join in kinetic text`,
    );
    assert.ok(!/(?<=\p{L})_(?=\p{L})/u.test(stage.text), `${stage.id}: underscore in kinetic text`);
  }
  const definition = stages.find((stage) => stage.id.startsWith("definition"))!;
  assert.equal(definition.text, "Cái ba lô để đựng đồ, rất quan trọng khi đi học.");
  assert.deepEqual(definition.boundPhrases, ["ba lô", "quan trọng", "đi học."]);
  assert.deepEqual(definition.dataEmphasis, ["quan trọng"], "a highlight keeps no join");
  const lead = stages.find((stage) => stage.id.startsWith("lead"))!;
  assert.deepEqual(lead.boundPhrases, ["ba lô"]);
}
console.log("OK — stages carry plain text plus the joined words");

// ── Layout: a joined word is one unbreakable segment, at every size.
const sentence = "Xách ba lô lên vai rồi đi học thôi";
const words = getWords(sentence);
const keys = getEmphasisPhraseKeysForLayout(["ba lô", "đi học"]);
for (let size = 40; size <= 120; size += 4) {
  const { lines } = getVietnameseLayoutMetrics(words, 390, size, 1, keys);
  const segmentsOf = lines.flatMap((line) =>
    line.segments.map((segment) => segment.words.map((item) => item.text).join(" ")),
  );
  assert.ok(
    segmentsOf.includes("ba lô"),
    `${size}px: "ba lô" was split (${segmentsOf.join(" | ")})`,
  );
  assert.ok(
    segmentsOf.includes("đi học"),
    `${size}px: "đi học" was split (${segmentsOf.join(" | ")})`,
  );
}
// Without the join the same words are free to part — which is what the marker fixes.
const free = getVietnameseLayoutMetrics(words, 390, 96, 1).lines.flatMap((line) =>
  line.segments.map((segment) => segment.words.length),
);
assert.ok(
  free.every((length) => length === 1),
  "unjoined syllables are separate segments",
);
console.log("OK — a joined word is never split across lines");

// ── Emphasis: a highlight that lands on one syllable covers the whole joined word.
const picked = getEmphasizedWordIndexes(words, ["lô"], ["ba lô"]);
assert.deepEqual(
  [...picked].sort((a, b) => a - b),
  [1, 2],
  "the highlight must cover 'ba lô'",
);
assert.deepEqual(
  [...getEmphasizedWordIndexes(words, ["lô"])],
  [2],
  "without the join it stays on one syllable",
);
console.log("OK — a highlight never covers half a joined word");

// ── A clitic bind breaks like a word join, and reaches no reader.
{
  const text = "Con=mèo nằm trên cái=bàn gỗ.";
  const encoded = encodeWordJoiners(text);
  assert.ok(!/[_=|]/.test(encoded), "no authored mark survives encoding");
  assert.equal(
    [...encoded].filter((character) => character.charCodeAt(0) === 0x00a0).length,
    2,
    "each bind becomes one no-break space",
  );
  assert.equal(
    countJoinedUnits(text),
    countJoinedUnits("Con mèo nằm trên cái bàn gỗ."),
    "a bind must not change a word count",
  );
  assert.deepEqual(
    [...splitWordJoiners(text).bound].sort(),
    // Source casing is preserved, so the sentence-initial classifier stays capitalised.
    ["Con mèo", "cái bàn"].sort(),
    "a bound pair is reported like a joined word, so it is never split",
  );
  console.log("OK — a clitic bind binds the line and changes no count");
}

// ── A phrase mark is stripped, and its edges are readable.
{
  const text = "Chất_lỏng trong suốt | mà ta uống=mỗi ngày.";
  const encoded = encodeWordJoiners(text);
  assert.ok(!encoded.includes("|"), "the phrase mark never reaches a reader");
  assert.equal(countJoinedUnits(text), 9, "a phrase mark must not change a word count either");
  assert.deepEqual(splitPhrases(text), ["Chất lỏng trong suốt", "mà ta uống mỗi ngày."]);
  // Nothing honours the edges yet; this records what a packer will read.
  assert.deepEqual(splitPhrases("không có dấu nào"), ["không có dấu nào"]);
  console.log("OK — a phrase mark is stripped and its edges are exposed");
}

// ── A shipped highlight is one syllable or one two-syllable "_" word.
// Two syllables a space apart are two words, a "=" pair leans but is not one word,
// and three syllables read as a clause even when joined.
{
  const dataDir = join(dirname(fileURLToPath(import.meta.url)), "../src/features/vocabulary/data");
  const decks = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? entry.name === "incoming"
          ? []
          : decks(join(dir, entry.name))
        : entry.name.endsWith(".json")
          ? [join(dir, entry.name)]
          : [],
    );
  let marks = 0;
  const offenders: string[] = [];
  // The legacy English base deck predates this rule; the generated decks are held to it.
  for (const file of decks(dataDir).filter((path) => relative(dataDir, path) !== "catalog.json")) {
    const words = (JSON.parse(readFileSync(file, "utf8")) as { words?: unknown }).words;
    if (!Array.isArray(words)) continue;
    for (const entry of words as Record<string, unknown>[]) {
      for (const field of ["defVi", "leadVi", "anticipateVi"]) {
        for (const match of String(entry[field] ?? "").matchAll(/\/([^/]+)\//g)) {
          marks += 1;
          const phrase = match[1]!.trim();
          if (/[\s=|]/u.test(phrase) || phrase.split("_").length > 2) {
            offenders.push(
              `${relative(dataDir, file)} ${String(entry.id ?? entry.word)}.${field}: ${match[0]}`,
            );
          }
        }
      }
    }
  }
  assert.ok(marks > 0, "the shipped decks carry highlights");
  assert.deepEqual(offenders, [], `highlights that are not one word:\n${offenders.join("\n")}`);
  console.log(`OK — all ${marks} shipped highlights are one syllable or one two-syllable "_" word`);
}

console.log("\nAll word-joiner checks passed.");
