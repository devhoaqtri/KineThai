/**
 * The letters (jamo) inside each Hangul block, worked out on the device from any Korean
 * string: 학교 → [ㅎ ㅏ ㄱ] [ㄱ ㅛ]. Pure arithmetic over the Unicode syllable block, no
 * library and nothing stored on the card.
 *
 * A block is built initial consonant, vowel, then an optional final (받침). Letters are
 * the COMPATIBILITY jamo (U+3131–U+318E), which stand alone; the conjoining jamo NFD
 * produces render badly on their own.
 *
 * This is how a word is WRITTEN. How it is said ([학꾜]) comes from the card's
 * pronunciation and never changes the letters.
 *
 * Exports: JamoRole, Jamo, BlockShape, HangulSegment, JamoLevel, decomposeHangul,
 *   blockLetters, blockShape, vowelParts
 * Depends on: nothing
 */

const SYLLABLE_BASE = 0xac00;
const SYLLABLE_COUNT = 11172;

const INITIALS = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
const VOWELS = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ";
/** Index 0 is "no final". */
const FINALS = ["", ..."ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ"];

/** Level 2 splits these; tense consonants (ㄲ ㄸ ㅃ ㅆ ㅉ) and ㅐ ㅔ ㅒ ㅖ stay whole. */
const COMPOUND_VOWELS: Record<string, string> = {
  ㅘ: "ㅗㅏ",
  ㅙ: "ㅗㅐ",
  ㅚ: "ㅗㅣ",
  ㅝ: "ㅜㅓ",
  ㅞ: "ㅜㅔ",
  ㅟ: "ㅜㅣ",
  ㅢ: "ㅡㅣ",
};
const DOUBLE_FINALS: Record<string, string> = {
  ㄳ: "ㄱㅅ",
  ㄵ: "ㄴㅈ",
  ㄶ: "ㄴㅎ",
  ㄺ: "ㄹㄱ",
  ㄻ: "ㄹㅁ",
  ㄼ: "ㄹㅂ",
  ㄽ: "ㄹㅅ",
  ㄾ: "ㄹㅌ",
  ㄿ: "ㄹㅍ",
  ㅀ: "ㄹㅎ",
  ㅄ: "ㅂㅅ",
};

const BELOW_VOWELS = new Set("ㅗㅛㅜㅠㅡ");
const WRAP_VOWELS = new Set("ㅘㅙㅚㅝㅞㅟㅢ");

export type JamoRole = "initial" | "vowel" | "final";
export type Jamo = { letter: string; role: JamoRole };
/** Where the vowel sits against the initial; a final always sits at the bottom. */
export type BlockShape = "right" | "below" | "wrap";
/** 1: the letters as written (값 → ㄱ ㅏ ㅄ). 2: compound vowels and double finals split too. */
export type JamoLevel = 1 | 2;

export type HangulSegment =
  | {
      kind: "block";
      syllable: string;
      initial: string;
      vowel: string;
      final: string | null;
      shape: BlockShape;
    }
  | { kind: "text"; text: string };

/**
 * @param vowel A compatibility-jamo vowel
 * @returns Where it sits against the initial consonant
 * @pure true
 */
export function blockShape(vowel: string): BlockShape {
  if (WRAP_VOWELS.has(vowel)) return "wrap";
  return BELOW_VOWELS.has(vowel) ? "below" : "right";
}

/**
 * Split a string into Hangul blocks and the runs between them. Spaces, Latin letters,
 * digits and anything else pass through unchanged as text runs.
 * @param text Any string
 * @returns Blocks and text runs, in order
 * @pure true
 */
export function decomposeHangul(text: string): HangulSegment[] {
  const segments: HangulSegment[] = [];
  for (const char of text.normalize("NFC")) {
    const code = char.codePointAt(0)! - SYLLABLE_BASE;
    if (code < 0 || code >= SYLLABLE_COUNT) {
      const last = segments.at(-1);
      if (last?.kind === "text") last.text += char;
      else segments.push({ kind: "text", text: char });
      continue;
    }
    const vowel = VOWELS[Math.floor((code % 588) / 28)]!;
    segments.push({
      kind: "block",
      syllable: char,
      initial: INITIALS[Math.floor(code / 588)]!,
      vowel,
      final: FINALS[code % 28] || null,
      shape: blockShape(vowel),
    });
  }
  return segments;
}

/**
 * The letters of one block in writing order, each with its part of the block.
 * @param block A block from decomposeHangul
 * @param level 1 as written, 2 with compound vowels and double finals split
 * @returns The letters
 * @pure true
 */
export function blockLetters(
  block: Extract<HangulSegment, { kind: "block" }>,
  level: JamoLevel = 1,
): Jamo[] {
  const split = (letter: string, table: Record<string, string>) =>
    level === 2 && table[letter] ? Array.from(table[letter]) : [letter];
  return [
    { letter: block.initial, role: "initial" as const },
    ...split(block.vowel, COMPOUND_VOWELS).map((letter) => ({ letter, role: "vowel" as const })),
    ...(block.final
      ? split(block.final, DOUBLE_FINALS).map((letter) => ({ letter, role: "final" as const }))
      : []),
  ];
}

/**
 * A wrapping vowel drawn as the block draws it: the stroke under the initial, then the
 * one to its right (ㅘ → ㅗ, ㅏ). Any other vowel is one part.
 * @param vowel A compatibility-jamo vowel
 * @returns Its parts in writing order
 * @pure true
 */
export function vowelParts(vowel: string): string[] {
  return WRAP_VOWELS.has(vowel) ? Array.from(COMPOUND_VOWELS[vowel]!) : [vowel];
}
