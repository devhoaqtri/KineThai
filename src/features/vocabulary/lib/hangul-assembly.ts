/**
 * The plan for the Korean spelling coda. Each Hangul block's letters appear side by side
 * at the SAME size and weight as the syllable they become (one em, never scaled), then
 * snap into one character. Pure: the card reads the duration for its page timer and
 * HangulAssembly reads the same plan to animate, so the two cannot disagree.
 *
 * Positions are em, relative to a letter's own one-em box. Times are seconds from the
 * block's start. The next block starts the moment this one has become its syllable.
 *
 * Exports: assemblyPlan, hangulAssemblyDurationMs, ASSEMBLY_HOLD_SECONDS, types
 * Depends on: ./hangul-jamo, ./spelling
 */
import { decomposeHangul, vowelParts, type JamoRole } from "./hangul-jamo";
import { SPELLING_HOLD_SECONDS, SPELLING_REDUCED_MOTION_MS } from "./spelling";

export type AssemblyPiece = {
  letter: string;
  role: JamoRole;
  /** Seconds after the block starts that the letter begins to appear. */
  appear: number;
  /** When it is fully shown, still standing apart. */
  snapAt: number;
  loose: { x: number; y: number };
  /** Where it rests, still one em, as the block closes over it. */
  packed: { x: number; y: number };
};

export type AssemblySegment =
  | {
      kind: "block";
      syllable: string;
      /** Seconds into the coda that this block opens. */
      start: number;
      /** Width of the row while the letters stand apart, in em. */
      looseWidth: number;
      combineAt: number;
      /** The syllable starts replacing the letters. */
      fadeAt: number;
      /** The syllable is fully there and the slot is one em. */
      mergeAt: number;
      end: number;
      pieces: AssemblyPiece[];
    }
  | { kind: "text"; text: string };

// The same family of timing as the Latin spelling coda (lib/spelling): about a third of a
// second between letters, a beat to look at them, then the shared three-second hold.
const LEAD = 0.12;
const STAGGER = 0.32;
const POP = 0.22;
const READ = 0.9;
const GATHER = 0.6;
const FADE = 0.38;
/** How long the finished word stays before the card moves on. Same hold as the other codas. */
export const ASSEMBLY_HOLD_SECONDS = SPELLING_HOLD_SECONDS;

/** Offsets of each one-em letter inside the finished block. A letter is never resized. */
const PLACES: Record<string, { x: number; y: number }[]> = {
  right: [
    { x: -0.16, y: 0 },
    { x: 0.2, y: 0 },
  ],
  "right+final": [
    { x: -0.18, y: -0.16 },
    { x: 0.2, y: -0.16 },
    { x: 0, y: 0.22 },
  ],
  below: [
    { x: 0, y: -0.16 },
    { x: 0, y: 0.2 },
  ],
  "below+final": [
    { x: 0, y: -0.22 },
    { x: 0, y: 0 },
    { x: 0, y: 0.24 },
  ],
  wrap: [
    { x: -0.16, y: -0.14 },
    { x: -0.12, y: 0.16 },
    { x: 0.2, y: -0.02 },
  ],
  "wrap+final": [
    { x: -0.16, y: -0.2 },
    { x: -0.12, y: 0.02 },
    { x: 0.2, y: -0.08 },
    { x: 0, y: 0.22 },
  ],
};

/**
 * @param word - the headword; non-Hangul runs come back as text and take no time
 * @returns the segments in order, and the seconds until the last block has merged
 */
export function assemblyPlan(word: string): { segments: AssemblySegment[]; seconds: number } {
  let clock = 0;
  let seconds = 0;
  const segments = decomposeHangul(word).map((segment): AssemblySegment => {
    if (segment.kind === "text") return segment;
    const letters: { letter: string; role: JamoRole }[] = [
      { letter: segment.initial, role: "initial" },
      ...(segment.shape === "wrap" ? vowelParts(segment.vowel) : [segment.vowel]).map((letter) => ({
        letter,
        role: "vowel" as const,
      })),
      ...(segment.final ? [{ letter: segment.final, role: "final" as const }] : []),
    ];
    const places = PLACES[segment.final ? `${segment.shape}+final` : segment.shape]!;
    const combineAt = LEAD + (letters.length - 1) * STAGGER + POP + READ;
    const mergeAt = combineAt + GATHER;
    // The syllable replaces the letters over the end of the snap, so nothing waits in between.
    const pieces = letters.map(({ letter, role }, index): AssemblyPiece => ({
      letter,
      role,
      appear: LEAD + index * STAGGER,
      snapAt: LEAD + index * STAGGER + POP,
      loose: { x: index, y: 0 },
      packed: places[index]!,
    }));
    const block: AssemblySegment = {
      kind: "block",
      syllable: segment.syllable,
      start: clock,
      looseWidth: letters.length,
      combineAt,
      fadeAt: combineAt + GATHER * 0.45,
      mergeAt,
      end: combineAt + GATHER * 0.45 + FADE,
      pieces,
    };
    seconds = clock + block.end;
    clock += mergeAt;
    return block;
  });
  return { segments, seconds };
}

/** Milliseconds the Korean coda page lasts: every block merged, then a short hold. */
export function hangulAssemblyDurationMs(word: string, reducedMotion: boolean): number {
  if (reducedMotion) return SPELLING_REDUCED_MOTION_MS;
  return Math.round((assemblyPlan(word).seconds + ASSEMBLY_HOLD_SECONDS) * 1000);
}
