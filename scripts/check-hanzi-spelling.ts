/**
 * Regression guard for the CJK (Han) stroke-by-stroke spelling coda.
 *
 * The Latin coda is guarded by check-spelling-coda.ts; this pins the Han path: the
 * per-character stroke files cover every Han character the feed can serve, the loader's
 * URLs point at those files, script
 * detection routes Han vs Latin correctly, the fixed draw budget keeps every coda
 * inside the stream's pacing envelope, and the per-stroke solver stays clamped.
 *
 * Usage: npx tsx scripts/check-hanzi-spelling.ts
 * Depends on: ../src/features/vocabulary/lib/hanzi, ../src/features/vocabulary/lib/spelling,
 *             ../src/features/vocabulary/lib/hanzi-strokes (URL scheme),
 *             ../src/features/vocabulary/data (decks), ../public/hanzi (stroke files)
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  HANZI_STROKE_DURATION_NUMERATOR,
  STROKE_DRAW_MAX_SECONDS,
  STROKE_MAX_MS,
  STROKE_MIN_MS,
  STROKE_SETTLE_SECONDS,
  getHanCharCount,
  getStrokeDrawBudgetSeconds,
  getStrokeSpellingDurationMs,
  isHanAnswer,
  solveStrokeTiming,
} from "../src/features/vocabulary/lib/hanzi";
import {
  SPELLING_HOLD_SECONDS,
  SPELLING_REDUCED_MOTION_MS,
} from "../src/features/vocabulary/lib/spelling";
import { hanziStrokeUrl } from "../src/features/vocabulary/lib/hanzi-strokes";
import type { CharacterJson } from "hanzi-writer";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(here, "../src/features/vocabulary/data");
const publicDir = resolve(here, "../public");

let failures = 0;
function check(condition: boolean, message: string): void {
  if (condition) {
    console.log(`OK — ${message}`);
    return;
  }
  failures += 1;
  console.error(`FAIL — ${message}`);
}

/** Every .json deck the feed can serve: base catalog, provider packs, all locale folders. */
function collectDecks(dir: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) found.push(...collectDecks(full));
    else if (name.endsWith(".json")) found.push(full);
  }
  return found;
}

const HAN = /\p{Script=Han}/u;
/** The stroke file the coda would fetch for a character, read off disk; undefined if absent. */
function readStrokeFile(ch: string): CharacterJson | undefined {
  const file = join(publicDir, hanziStrokeUrl(ch));
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as CharacterJson) : undefined;
}

// Gather every Han word and every unique Han character across all served decks.
const hanWords: string[] = [];
const deckChars = new Set<string>();
for (const file of collectDecks(dataDir)) {
  const deck = JSON.parse(readFileSync(file, "utf8")) as { words?: { word?: string }[] };
  for (const entry of deck.words ?? []) {
    const word = entry.word ?? "";
    if (!isHanAnswer(word)) continue;
    hanWords.push(word);
    for (const ch of Array.from(word)) if (HAN.test(ch)) deckChars.add(ch);
  }
}

// The files the coda would fetch for those characters, keyed by character.
const strokes: Record<string, CharacterJson> = {};
for (const ch of deckChars) {
  const entry = readStrokeFile(ch);
  if (entry) strokes[ch] = entry;
}

// ── 1. Dataset coverage ───────────────────────────────────────────────────────
check(deckChars.size > 0, `decks contain Han characters to test (${deckChars.size} unique)`);
const uncovered = [...deckChars].filter((ch) => !strokes[ch]?.strokes?.length);
check(
  uncovered.length === 0,
  `every served Han character has a stroke file at its loader URL (${uncovered.length} missing: ${uncovered.join(" ") || "none"})`,
);

// ── 2. Dataset shape ────────────────────────────────────────────────────────
const malformed = Object.entries(strokes).filter(
  ([, entry]) =>
    !Array.isArray(entry.strokes) ||
    entry.strokes.length === 0 ||
    !Array.isArray(entry.medians) ||
    entry.medians.length !== entry.strokes.length,
);
check(
  malformed.length === 0,
  `every stroke entry has matching non-empty strokes[] and medians[] (${malformed.length} malformed)`,
);

// ── 3. Script detection dispatch ────────────────────────────────────────────
check(isHanAnswer("嫉妒") && isHanAnswer("精疲力尽"), "Han answers are detected as Han");
check(
  !isHanAnswer("resilient") && !isHanAnswer("") && !isHanAnswer("người"),
  "Latin answers are not Han",
);
check(
  getHanCharCount("嫉妒") === 2 && getHanCharCount("精疲力尽") === 4,
  "Han character count is per-glyph",
);
check(getHanCharCount("resilient") === 0, "a Latin word has zero Han characters");

// ── 4. Phase budget ─────────────────────────────────────────────────────────
/** A Han coda must not stall the stream any more than the Latin one may. */
const BUDGET_MS = 12000;
const REDUCED_BUDGET_MS = 4000;
let longest = { word: "", ms: 0 };
const overBudget: string[] = [];
for (const word of hanWords) {
  const ms = getStrokeSpellingDurationMs(word, false);
  if (ms > longest.ms) longest = { word, ms };
  if (ms > BUDGET_MS) overBudget.push(`${word}=${ms}`);
}
check(
  overBudget.length === 0,
  `every Han word's coda fits the ${BUDGET_MS}ms budget (${overBudget.slice(0, 4).join(", ") || "none over"})`,
);
check(
  longest.ms > SPELLING_HOLD_SECONDS * 1000,
  `longest Han coda (${longest.word}=${longest.ms}ms) outlasts the hold`,
);
check(
  hanWords.every((word) => getStrokeSpellingDurationMs(word, true) === SPELLING_REDUCED_MOTION_MS),
  "reduced-motion Han coda is a fixed static beat for every word",
);
check(
  hanWords.every((word) => getStrokeSpellingDurationMs(word, true) <= REDUCED_BUDGET_MS),
  `reduced-motion Han coda stays under ${REDUCED_BUDGET_MS}ms`,
);

// ── 5. Draw budget is capped and grows with characters ──────────────────────
const oneChar = getStrokeDrawBudgetSeconds("水");
const fourChar = getStrokeDrawBudgetSeconds("精疲力尽");
check(oneChar < fourChar, "a longer word gets a larger draw budget");
check(
  hanWords.every((word) => getStrokeDrawBudgetSeconds(word) <= STROKE_DRAW_MAX_SECONDS + 0.001),
  "the draw budget never exceeds its ceiling",
);

// ── 6. Per-stroke solver stays clamped ──────────────────────────────────────
// The solver targets a NOMINAL slot of drawMs + delay and sets speed = 500/drawMs, so
// recovering 500/speed + delay must land inside [STROKE_MIN_MS, STROKE_MAX_MS]. Hanzi
// Writer's REAL per-stroke time is length-dependent; section 7 checks that against the
// actual medians, so this only pins the solver's own clamping intent.
const clampCases = [1, 2, 4, 8, 16, 32, 64, 128];
const clampBroken: string[] = [];
for (const totalStrokes of clampCases) {
  const budget = getStrokeDrawBudgetSeconds("精疲力尽") * 1000;
  const timing = solveStrokeTiming(totalStrokes, budget);
  const perStroke =
    HANZI_STROKE_DURATION_NUMERATOR / timing.strokeAnimationSpeed + timing.delayBetweenStrokes;
  if (perStroke < STROKE_MIN_MS - 2 || perStroke > STROKE_MAX_MS + 2) {
    clampBroken.push(`${totalStrokes}strokes=${perStroke.toFixed(0)}ms`);
  }
}
check(
  clampBroken.length === 0,
  `per-stroke pacing stays within [${STROKE_MIN_MS}, ${STROKE_MAX_MS}]ms (${clampBroken.join(", ") || "all clamped"})`,
);
check(
  solveStrokeTiming(0, 1000).strokeAnimationSpeed > 0 &&
    solveStrokeTiming(10, 0).strokeAnimationSpeed > 0,
  "a degenerate stroke count or budget falls back to a positive default speed",
);

// ── 7. Wait-for-completion: the coda page must outlast the real drawing ──────────
// The card advances on getStrokeSpellingDurationMs; Hanzi Writer draws each stroke in
// (medianLength + 600) / (3 * speed) ms (dist animateStroke + Stroke.getLength), plus a
// strokeFadeDuration hide per character, delayBetweenStrokes between strokes, a completion
// highlight, and this coda's 160ms inter-character beat. Modelled from the real medians so
// the guard proves the actual animation — not an average — finishes before the page turns.
const INTER_CHAR_GAP_MS = 160; // mirrors HanziStrokeSpelling's between-character beat
const STROKE_FADE_MS = 400; // Hanzi Writer default strokeFadeDuration
const HIGHLIGHT_MS = 300; // conservative completion flash per character
const medianLength = (median: number[][]): number => {
  let len = 0;
  for (let i = 1; i < median.length; i += 1) {
    len += Math.hypot(median[i]![0]! - median[i - 1]![0]!, median[i]![1]! - median[i - 1]![1]!);
  }
  return len;
};
const overrun: string[] = [];
for (const word of hanWords) {
  const chars = Array.from(word).filter((ch) => HAN.test(ch));
  const totalStrokes = chars.reduce((n, ch) => n + (strokes[ch]?.strokes.length ?? 0), 0);
  const budget = getStrokeDrawBudgetSeconds(word) * 1000;
  const speed = solveStrokeTiming(totalStrokes, budget).strokeAnimationSpeed;
  const delay = solveStrokeTiming(totalStrokes, budget).delayBetweenStrokes;
  let draw = 0;
  for (const ch of chars) {
    const medians = strokes[ch]?.medians ?? [];
    draw += STROKE_FADE_MS;
    medians.forEach((median, i) => {
      if (i > 0) draw += delay;
      draw += (medianLength(median) + 600) / (3 * speed);
    });
    draw += HIGHLIGHT_MS;
  }
  draw += Math.max(0, chars.length - 1) * INTER_CHAR_GAP_MS;
  const page = getStrokeSpellingDurationMs(word, false);
  if (draw > page) overrun.push(`${word}: draw ${Math.round(draw)}ms > page ${page}ms`);
}
check(
  overrun.length === 0,
  `every Han word finishes drawing inside its coda page (${overrun.slice(0, 3).join("; ") || "none over"})`,
);
check(
  hanWords.every(
    (word) =>
      getStrokeSpellingDurationMs(word, false) >
      getStrokeDrawBudgetSeconds(word) * 1000 + STROKE_SETTLE_SECONDS * 1000,
  ),
  "the page always leaves a settle beat after the draw budget",
);

if (failures > 0) {
  console.error(`\n${failures} hanzi-spelling check(s) failed.`);
  process.exitCode = 1;
} else {
  console.log("\nAll hanzi-spelling bounds hold.");
}
