/** Explicit clue stages and answer masking (never infer pages from line breaks). Exports: buildStages, completeUsage, splitEmphasisMarkers. Depends on: schema, word-joiner, highlight-gate, hanzi script detection, kinetic-text emphasis types. */
import type { EmphasisVariant } from "@/features/kinetic-text";
import { answerPattern, type NarrativeStyle, type VocabularyWord } from "./schema";
import { isHanAnswer, isJapaneseWord, isKoreanWord } from "./hanzi";
import { gateHighlight } from "./highlight-gate";
import { paginateText } from "@/features/post-player";
import { splitWordJoiners, stripWordJoiners } from "./word-joiner";

/**
 * The stages written from a deck's Vietnamese clue fields, whose highlight passes the
 * gate. The letters clue is composed here and glows its count; the usage page is in the
 * answer language, where a syllable count means nothing.
 */
const GATED_STAGE_IDS = new Set(["lead", "definition", "anticipation"]);

/**
 * Effect used for the starting initial on the letter-count clue. `frame` draws a
 * box around the glyph, which is the one variant that reads as a container for a
 * single letter rather than as a recolor, so it stays visibly distinct from the
 * mark the letter count already carries.
 */
const INITIAL_EMPHASIS_VARIANT: EmphasisVariant = "frame";

/**
 * Shortest answer that earns the start-and-end letter shape. Showing both ends alongside the
 * length already given spells a short word right out (`hot` → h … t, three letters), so only
 * long-enough answers may frame first-and-last; shorter ones fall back to the count shape.
 */
const EDGES_HINT_MIN_LETTERS = 6;

/**
 * One-in-this-many eligible words keep the older count-and-start clue instead of the new
 * start-and-end one. The variety is deliberate: the hash is deterministic, so a word always
 * rolls the same clue, but neighbouring cards differ and the ladder never reads as the same
 * sentence every time. Raise it to lean harder toward the edges shape, lower for more count.
 */
const LETTER_CLUE_VARIETY_ODDS = 4;

/**
 * Deterministic 31-based string hash — the same convention `pickSpellingVariant` uses — so a
 * stable word id maps to a stable clue choice across renders.
 * @param seed Stable per-word string. @returns A non-negative integer.
 */
function hashWord(seed: string): number {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

export type LearningStage = {
  id: string;
  label: string;
  text: string;
  secondary?: string;
  lang: "vi" | "en" | "zh" | "ja" | "ko";
  reveal?: boolean;
  /**
   * Emphasis phrases extracted from /word/ markers in the source text field. On a clue
   * page this is what passed ./highlight-gate: one word, or an empty list for no highlight.
   */
  dataEmphasis?: string[];
  /**
   * Words the source text joined (see ./word-joiner), each written with plain spaces.
   * Their syllables are one word and must stay on one line.
   */
  boundPhrases?: string[];
  /** Second highlight drawn with its own effect, independent of `dataEmphasis`. */
  secondaryEmphasis?: { phrase: string; variant: EmphasisVariant };
};

/**
 * Parse /word/ emphasis markers and word joins from a text field.
 * Returns the clean text (markers stripped, joins written as plain spaces), the list of
 * marked phrases, and the joined words that must stay whole.
 */
function parseEmphasisMarkers(text: string): { clean: string; markers: string[]; bound: string[] } {
  const markers: string[] = [];
  const unmarked = text.replace(/\/([^/]+)\//g, (_, word) => {
    // A highlight is matched token by token, so it is kept without its joins.
    markers.push(stripWordJoiners(word.trim()));
    return word.trim();
  });
  const { text: clean, bound } = splitWordJoiners(unmarked);
  return { clean, markers, bound };
}

/**
 * Split a deck text field on its /word/ emphasis markers, for surfaces that render
 * the sentence as prose rather than as kinetic text. The markers are an authoring
 * convention and must never reach the screen as literal slashes.
 * @param text - Source field, possibly carrying /word/ markers
 * @returns Ordered runs; `marked` is true for a phrase that sat between markers
 * @pure true
 */
export function splitEmphasisMarkers(text: string): { text: string; marked: boolean }[] {
  const parts: { text: string; marked: boolean }[] = [];
  let cursor = 0;
  for (const match of text.matchAll(/\/([^/]+)\//g)) {
    const start = match.index ?? 0;
    if (start > cursor) parts.push({ text: text.slice(cursor, start), marked: false });
    parts.push({ text: match[1]!.trim(), marked: true });
    cursor = start + match[0].length;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), marked: false });
  return parts;
}

/**
 * Fill a deck's deliberate answer blank. @param text Example sentence. @param word Target.
 * @param fill The form that fills the blank when it is not the target (します for する).
 * @returns Completed sentence.
 */
export function completeUsage(text: string, word: string, fill?: string): string {
  return text.replace(/_{2,}/g, fill ?? word);
}

/** A kana glyph with any small kana or long-vowel mark riding on it (きょ, コー). */
const KANA_UNIT =
  /[\p{Script=Hiragana}\p{Script=Katakana}][ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮー]*/gu;

/**
 * The letter clue for a Japanese word: how long its kana reading is, and the sound it
 * opens with, plus the kanji count when it is written in kanji. The opening sound is
 * held back when it would be the whole reading (お, 目 → め).
 */
function japaneseLettersStage(word: VocabularyWord, hanCount: number): LearningStage {
  const reading = hanCount > 0 ? (word.ipa ?? "") : word.word;
  const kanaCount = (reading.match(/[\p{Script=Hiragana}\p{Script=Katakana}ー]/gu) ?? []).length;
  const units = reading.match(KANA_UNIT) ?? [];
  const initial = units.length > 1 ? units[0]! : "";
  const opening = initial ? `, bắt đầu bằng ${initial}` : "";
  return {
    id: "letters",
    label: hanCount > 0 ? "Đếm chữ Hán" : "Đếm chữ cái",
    text:
      hanCount > 0
        ? `Gồm ${hanCount} chữ Hán, đọc thành ${kanaCount} chữ kana${opening}`
        : `Gồm ${kanaCount} chữ kana${opening}`,
    lang: "vi",
    secondaryEmphasis: initial ? { phrase: initial, variant: INITIAL_EMPHASIS_VARIANT } : undefined,
  };
}

/** Initial consonants of a Hangul syllable, in Unicode order. */
const HANGUL_INITIALS = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";

/**
 * The letter clue for a Korean word: its syllable count and the consonant it opens
 * with. The first syllable would give away a one-syllable word (것, 집), so only its
 * initial consonant is named.
 */
function koreanLettersStage(word: VocabularyWord): LearningStage {
  const syllables = word.word.match(/[\uac00-\ud7a3]/gu) ?? [];
  const first = syllables[0];
  const initial = first ? HANGUL_INITIALS[Math.floor((first.codePointAt(0)! - 0xac00) / 588)]! : "";
  return {
    id: "letters",
    label: "Đếm âm tiết",
    text: initial
      ? `Gồm ${syllables.length} âm tiết, bắt đầu bằng ${initial}`
      : `Gồm ${syllables.length} âm tiết`,
    lang: "vi",
    secondaryEmphasis: initial ? { phrase: initial, variant: INITIAL_EMPHASIS_VARIANT } : undefined,
  };
}

/** Create the supplied seven-stage flow, skipping absent optional content. @param word Catalog entry. @param style Narrative preset. @returns Ordered stages. */
export function buildStages(word: VocabularyWord, style: NarrativeStyle): LearningStage[] {
  const mask = (text: string) => text.replace(answerPattern(word.word), "_____");
  // The answer language drives <p lang> and font selection on the pages that render the
  // target script: a Han deck writes its usage sentence and reveal in Chinese (or
  // Japanese), not English.
  const japanese = isJapaneseWord(word.word, word.ipa);
  const korean = isKoreanWord(word.word);
  const answerLang = japanese ? "ja" : korean ? "ko" : isHanAnswer(word.word) ? "zh" : "en";
  const stages: LearningStage[] = [];
  const leadLabels: Record<NarrativeStyle, string> = {
    detective: "Bối cảnh",
    speed: "Sẵn sàng chưa?",
    confession: "Có quen không?",
    minimal: "Một suy nghĩ",
  };
  if (word.leadVi) {
    const { clean, markers, bound } = parseEmphasisMarkers(word.leadVi);
    stages.push({
      id: "lead",
      label: leadLabels[style],
      text: mask(clean),
      lang: "vi",
      dataEmphasis: markers.length ? markers : undefined,
      boundPhrases: bound.length ? bound : undefined,
    });
  }
  {
    const { clean, markers, bound } = parseEmphasisMarkers(word.defVi);
    stages.push({
      id: "definition",
      label: "Ý nghĩa",
      text: mask(clean),
      lang: "vi",
      dataEmphasis: markers.length ? markers : undefined,
      boundPhrases: bound.length ? bound : undefined,
    });
  }
  const hanCount = (word.word.match(/\p{Script=Han}/gu) ?? []).length;
  if (japanese) stages.push(japaneseLettersStage(word, hanCount));
  else if (korean) stages.push(koreanLettersStage(word));
  else if (hanCount > 0) {
    // Chinese: the first character would give away half a 2-character word, so the
    // clue is the character count plus the first pinyin letter.
    const pinyinInitial = (word.ipa?.trim()[0] ?? "").toUpperCase();
    stages.push({
      id: "letters",
      label: "Đếm chữ Hán",
      text: pinyinInitial
        ? `Gồm ${hanCount} chữ Hán, pinyin bắt đầu bằng ${pinyinInitial}`
        : `Gồm ${hanCount} chữ Hán`,
      lang: "vi",
      secondaryEmphasis: pinyinInitial
        ? { phrase: pinyinInitial, variant: INITIAL_EMPHASIS_VARIANT }
        : undefined,
    });
  }
  const latinLetters = word.word.match(/\p{L}/gu) ?? [];
  const count = latinLetters.length;
  const initial = word.word[0].toUpperCase();
  const final = (latinLetters[count - 1] ?? "").toUpperCase();
  if (hanCount === 0 && !japanese && !korean) {
    // One letter-shape clue per word, chosen deterministically from its id so the ladder varies
    // from card to card but never reshuffles for the same word. Two shapes today:
    //   · count — how many letters, plus the opening one (the original clue);
    //   · edges — the whole word framed from first letter to last (no count).
    // `edges` needs a genuine far end: skipped on short answers, where count + first + last
    // would spell the word out, and when both ends are the same glyph (`level` → l … l).
    const canUseEdges = count >= EDGES_HINT_MIN_LETTERS && !!final && final !== initial;
    const edges = canUseEdges && hashWord(word.id) % LETTER_CLUE_VARIETY_ODDS !== 0;
    if (!edges) {
      stages.push({
        id: "letters",
        label: "Đếm chữ cái",
        text: `Gồm ${count} chữ cái, bắt đầu bằng ${initial}`,
        lang: "vi",
        // The count keeps the primary mark on purpose — getWordImportance scores a
        // standalone number above everything so the digits always win this sentence.
        // The initial is added as a second, differently-drawn mark rather than
        // replacing it, so one page carries both facts.
        secondaryEmphasis: { phrase: initial, variant: INITIAL_EMPHASIS_VARIANT },
      });
    } else {
      stages.push({
        id: "letters",
        label: "Đầu & cuối",
        text: `Bắt đầu bằng ${initial}, kết thúc bằng ${final}`,
        lang: "vi",
        // Two letters, two marks: the opening letter is the primary annotation (an explicit
        // mark beats the importance heuristic on this numberless page), and the closing letter
        // is drawn with the same boxed `frame` effect the count shape uses for its initial.
        dataEmphasis: [initial],
        secondaryEmphasis: { phrase: final, variant: INITIAL_EMPHASIS_VARIANT },
      });
    }
  }
  const example = word.usage[0];
  if (example) {
    const { clean: enClean, markers: enMarkers, bound: enBound } = parseEmphasisMarkers(example.en);
    const { clean: viClean } = parseEmphasisMarkers(example.vi);
    stages.push({
      id: "usage",
      label: "Trong câu",
      text: mask(enClean),
      secondary: mask(viClean),
      lang: answerLang,
      dataEmphasis: enMarkers.length ? enMarkers : undefined,
      boundPhrases: enBound.length ? enBound : undefined,
    });
  }
  if (word.anticipateVi) {
    const { clean, markers, bound } = parseEmphasisMarkers(word.anticipateVi);
    stages.push({
      id: "anticipation",
      label: "Bạn đoán gì?",
      text: mask(clean),
      lang: "vi",
      dataEmphasis: markers.length ? markers : undefined,
      boundPhrases: bound.length ? bound : undefined,
    });
  }
  stages.push({ id: "reveal", label: "Đây rồi!", text: word.word, lang: answerLang, reveal: true });
  return stages.flatMap((stage) => {
    if (stage.reveal) return [stage];
    // Pages break like lines: never one word away from a comma, full stop or semicolon.
    return paginateText(stage.text, { keepPhraseEdges: true }).map((text, index) => ({
      ...stage,
      id: `${stage.id}-${index}`,
      text,
      // Per page: a mark pagination moved elsewhere leaves this page free to pick its own.
      ...(GATED_STAGE_IDS.has(stage.id)
        ? { dataEmphasis: gateHighlight(text, stage.dataEmphasis, stage.boundPhrases) }
        : {}),
    }));
  });
}
