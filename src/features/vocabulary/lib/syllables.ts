/**
 * How many syllables a word has, across every deck's script.
 *
 * Hangul writes one syllable per block and Chinese one per glyph. A Japanese deck's
 * reading is in kana, one beat each (a small kana rides on the one before). Everything
 * else is counted from the IPA, whose vowels are written as said: the spelling of
 * "awesome" or "interesse" says nothing reliable about them. A word with no reading falls
 * back to its spelling's vowel groups.
 *
 * Exports: countSyllables
 * Depends on: none (leaf module)
 */

const HANGUL = /\p{Script=Hangul}/gu;
const HAN = /\p{Script=Han}/gu;
const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
/** One beat of a reading; a small kana or the long-vowel mark belongs to the one before. */
const KANA_BEAT =
  /[\p{Script=Hiragana}\p{Script=Katakana}][ぁぃぅぇぉゃゅょゎァィゥェォャュョヮー]*/gu;
const IPA_VOWEL = "[aeiouyæɐɑɒɔəɘɚɛɜɝɞɤɨɪɯʉʊʌʏøœɶ]";
/** Length, half-length, nasal and non-syllabic marks. */
const IPA_MARK = "(?:ː|ˑ|\\u0303|\\u032F)";
/**
 * One spoken vowel: a run of vowel symbols with their marks, so a diphthong counts once.
 * A stress mark or a syllable dot ends the run.
 */
const IPA_NUCLEUS = new RegExp(`(?:${IPA_VOWEL}${IPA_MARK}*)+`, "gu");
/** A consonant said as its own syllable, as in /ˈbɒtl̩/. */
const IPA_SYLLABIC_CONSONANT = /̩/gu;
const SPELLED_VOWELS = /[aeiouyàáâãäåæèéêëìíîïòóôõöøœùúûüýÿ]+/gu;

function count(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

/**
 * @param entry - a word and its reading
 * @returns The word's syllables, 0 when nothing in it can be counted
 * @pure true
 */
export function countSyllables({ word, ipa }: { word: string; ipa?: string }): number {
  const hangul = count(word, HANGUL);
  if (hangul > 0) return hangul;
  if (ipa && KANA.test(ipa)) return count(ipa, KANA_BEAT);
  if (KANA.test(word)) return count(word, KANA_BEAT);
  const han = count(word, HAN);
  if (han > 0) return han;
  if (ipa) {
    const spoken = count(ipa, IPA_NUCLEUS) + count(ipa, IPA_SYLLABIC_CONSONANT);
    if (spoken > 0) return spoken;
  }
  return count(word.toLowerCase(), SPELLED_VOWELS);
}
