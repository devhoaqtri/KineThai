/**
 * Prove a still slide is finished before anyone captures it.
 *
 * A fixed delay cannot do this: under load a page was still three words in after 2.6 seconds,
 * and other captures caught a highlight half drawn. So a slide is checked instead of waited
 * for, and a slide that cannot be proved fails with a reason. Every step here fails loudly,
 * because the alternative is a wrong image posted to an audience.
 *
 * Fonts load before the card mounts, not after. The measured layout may step a page's size
 * down once and never back up, so a first pass in a fallback face could leave its mark on
 * the final layout, and the same slide would come out differently from run to run.
 *
 * Exports: FontRequest, FitInput, getSlideFontRequests, loadFontStylesheet, loadSlideFonts,
 *   PRONUNCIATION_FONT, pronunciationText,
 *   findFitProblems,
 *   readLayoutSignature, settleSlide
 * Depends on: ./export-presets SafeInsets (type only)
 */

import type { SafeInsets } from "./export-presets";

/** The weights the kinetic stage paints: body and emphasis. */
const STAGE_WEIGHTS = [800, 900];
/** The weights the panel, brand and labels paint, all in Inter. */
const PANEL_WEIGHTS = [400, 500, 600, 650, 700, 800];

/** The scripts a CJK fallback face has to cover. */
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

/**
 * Draws the pronunciation line. Google's ranged subsets leave out the combining marks German
 * and Spanish transcriptions use (i̯, t͡s), so the line asks for exactly its own characters
 * from one face. One face for the whole line also keeps each mark seated on its letter.
 */
export const PRONUNCIATION_FONT = "Noto Sans";

/**
 * The characters of a transcription that PRONUNCIATION_FONT draws. A Japanese deck writes
 * its reading in kana, which Noto Sans has none of: Google answers a subset with no glyphs
 * by refusing it, which the page sees as a network error. The CJK face draws those instead,
 * so they are left out here, and a reading with nothing else asks this face for nothing.
 * @param transcription - the word's transcription, in whatever script the deck wrote it
 * @returns Its non-CJK characters, or "" when only whitespace is left
 * @pure true
 */
export function pronunciationText(transcription: string): string {
  const text = [...transcription].filter((glyph) => !CJK.test(glyph)).join("");
  return text.trim() ? text : "";
}

/** Gap between layout samples. A timer, because frames stall in a background tab. */
const SAMPLE_MS = 50;
/** Matching samples in a row that count as stable. */
const STABLE_SAMPLES = 3;
const SETTLE_TIMEOUT_MS = 6000;
/** A rounding error's worth of room, in layout pixels. */
const FIT_TOLERANCE_PX = 0.5;

export type FontRequest = { family: string; weight: number; text: string };

/**
 * Every face a slide can paint, with the text it will paint. The text has to be named:
 * Vietnamese and CJK are separate subsets, fetched only when asked for.
 * @param stageFont - the theme's display family
 * @param texts - all the words the slide may show
 * @param cjkFont - the deck's CJK face, if it has one
 * @param pronunciation - the word's transcription
 * @returns One request per family and weight
 * @pure true
 */
export function getSlideFontRequests(
  stageFont: string,
  texts: readonly string[],
  cjkFont?: string,
  pronunciation = "",
): FontRequest[] {
  const text = [...new Set(texts.join(" "))].join("");
  const requests = STAGE_WEIGHTS.map((weight) => ({ family: stageFont, weight, text }));
  for (const weight of PANEL_WEIGHTS) requests.push({ family: "Inter", weight, text });
  const cjk = [...text].filter((glyph) => CJK.test(glyph)).join("");
  if (cjkFont && cjk) {
    for (const weight of [...STAGE_WEIGHTS, ...PANEL_WEIGHTS]) {
      requests.push({ family: cjkFont, weight, text: cjk });
    }
  }
  if (pronunciation) {
    requests.push({ family: PRONUNCIATION_FONT, weight: 400, text: pronunciation });
  }
  return requests;
}

/**
 * Add a face's stylesheet to the page and wait for it. Google splits the big fonts into
 * about a hundred files, so `load` then fetches only the slices the slide's text needs.
 * @param family - the family to fetch
 * @param text - fetch exactly these characters at the regular weight, instead of the range
 * @throws When the stylesheet cannot be loaded
 */
export function loadFontStylesheet(family: string, text?: string): Promise<void> {
  const name = family.replaceAll(" ", "+");
  const href = text
    ? `https://fonts.googleapis.com/css2?family=${name}&text=${encodeURIComponent(text)}`
    : `https://fonts.googleapis.com/css2?family=${name}:wght@400..900&display=swap`;
  if (document.querySelector(`link[href="${href}"]`)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.onload = () => resolve();
    link.onerror = () => reject(new Error(`The font ${family} could not be fetched.`));
    document.head.append(link);
  });
}

/**
 * Fetch every requested face. There is no timeout fallback, unlike the feed's: a reader
 * should never wait on a font, and an export should never ship without one.
 * @param requests - from getSlideFontRequests
 * @throws When a family has no face for this text
 */
export async function loadSlideFonts(requests: readonly FontRequest[]): Promise<void> {
  await Promise.all(
    requests.map(async ({ family, weight, text }) => {
      const faces = await document.fonts.load(`${weight} 64px "${family}"`, text);
      if (faces.length === 0) throw new Error(`The font ${family} ${weight} did not load.`);
    }),
  );
  await document.fonts.ready;
}

/** Everything that decides whether a slide fits, measured in stage coordinates. */
export type FitInput = {
  width: number;
  height: number;
  safe: SafeInsets;
  /** Boxes of the words on the page. */
  words: readonly { left: number; top: number; right: number; bottom: number }[];
  /** The meaning panel's scroller or the grammar slide, when the page has one. */
  panel: { scrollHeight: number; clientHeight: number } | null;
  /** Two parts of a slide that must not touch, as the upper's bottom and the lower's top. */
  stacked?: readonly { upperBottom: number; lowerTop: number; name: string }[];
};

/**
 * Name what does not fit.
 * @param input - measurements of the drawn slide
 * @returns Plain descriptions; empty when the slide fits
 * @pure true
 */
export function findFitProblems(input: FitInput): string[] {
  const { width, height, safe, words, panel, stacked = [] } = input;
  const problems: string[] = [];
  const left = width * safe.left - FIT_TOLERANCE_PX;
  const right = width * (1 - safe.right) + FIT_TOLERANCE_PX;
  const top = height * safe.top - FIT_TOLERANCE_PX;
  const bottom = height * (1 - safe.bottom) + FIT_TOLERANCE_PX;
  if (words.some((box) => box.left < left || box.right > right)) {
    problems.push("Text runs into the side margin");
  }
  if (words.some((box) => box.top < top || box.bottom > bottom)) {
    problems.push("Text runs into the top or bottom margin");
  }
  if (panel && panel.scrollHeight > panel.clientHeight) {
    const lost = panel.scrollHeight - panel.clientHeight;
    problems.push(`Panel is cut off by ${Math.ceil(lost)} px`);
  }
  for (const { upperBottom, lowerTop, name } of stacked) {
    if (upperBottom > lowerTop + FIT_TOLERANCE_PX) problems.push(`${name} overlap`);
  }
  return problems;
}

/**
 * A fingerprint of everything that moves while a page finds its layout.
 * @param stage - the slide's stage element
 * @returns A string that changes whenever a word, its size or a drawn stroke changes
 */
export function readLayoutSignature(stage: HTMLElement): string {
  const origin = stage.getBoundingClientRect();
  const parts: string[] = [];
  for (const word of stage.querySelectorAll<HTMLElement>(
    "[data-kinetic-word], .vocab-spelling-char, .vocab-stroke-char, .vocab-reveal-details",
  )) {
    const box = word.getBoundingClientRect();
    parts.push(
      [box.left - origin.left, box.top - origin.top, box.width, box.height]
        .map((value) => value.toFixed(2))
        .join(","),
      getComputedStyle(word).fontSize,
    );
  }
  parts.push(String(stage.querySelectorAll(".vocab-stroke-char path").length));
  return parts.join("|");
}

function runningAnimations(stage: HTMLElement): string[] {
  return stage
    .getAnimations({ subtree: true })
    .filter((animation) => animation.playState === "running")
    .map((animation) =>
      animation instanceof CSSAnimation ? animation.animationName : animation.constructor.name,
    );
}

/** The page's kind of content is on the stage, or the reason it never will be. */
function contentProblem(stage: HTMLElement): string | null {
  const card = stage.querySelector<HTMLElement>(".vocab-card");
  if (!card) return "The card did not mount";
  if (stage.querySelector("[data-carousel-grammar]")) return null;
  if (card.dataset.stage !== "spelling") {
    return stage.querySelector("[data-kinetic-word]") ? null : "The page has no text yet";
  }
  if (stage.querySelector(".vocab-spelling-char")) return null;
  if (stage.querySelector(".vocab-stroke-char[data-plain]")) {
    return "The strokes could not be loaded, so the page shows plain characters";
  }
  return stage.querySelector(".vocab-stroke-char path") ? null : "The spelling has not drawn yet";
}

/** Text a loaded font does not cover falls back silently; this catches a face we never asked for. */
function fontProblem(stage: HTMLElement): string | null {
  for (const node of stage.querySelectorAll<HTMLElement>("p, span, div")) {
    const text = [...node.childNodes]
      .filter((child) => child.nodeType === Node.TEXT_NODE)
      .map((child) => child.textContent ?? "")
      .join("")
      .trim();
    if (!text || node.closest(".sr-only")) continue;
    const style = getComputedStyle(node);
    const [face, fallback] = style.fontFamily.split(",").map((family) => family.trim());
    // Each script against the face that draws it. Asked about the whole stack at once, the
    // browser also wants the CJK face's Latin slices, which nothing here paints.
    const glyphs = [...text];
    const parts = [
      { family: face, part: glyphs.filter((glyph) => !CJK.test(glyph)).join("") },
      { family: fallback, part: glyphs.filter((glyph) => CJK.test(glyph)).join("") },
    ];
    for (const { family, part } of parts) {
      // The browser calls a generic family ready, and then paints this in a system font.
      if (part && (!family || family === "sans-serif")) {
        return `No face was asked for “${part.slice(0, 24)}”`;
      }
      if (part && !document.fonts.check(`${style.fontWeight} 64px ${family}`, part)) {
        return `The font ${family} ${style.fontWeight} was not ready for “${part.slice(0, 24)}”`;
      }
    }
  }
  return null;
}

function measureFit(stage: HTMLElement, safe: SafeInsets): string[] {
  const origin = stage.getBoundingClientRect();
  const words = [
    ...stage.querySelectorAll("[data-kinetic-word], .vocab-spelling-char, .vocab-stroke-char"),
  ].map((word) => {
    const box = word.getBoundingClientRect();
    return {
      left: box.left - origin.left,
      top: box.top - origin.top,
      right: box.right - origin.left,
      bottom: box.bottom - origin.top,
    };
  });
  const panel = stage.querySelector<HTMLElement>(".vocab-reveal-scroll, [data-carousel-grammar]");
  const stacked: { upperBottom: number; lowerTop: number; name: string }[] = [];
  const pair = (upper: Element | null, lower: Element | null, name: string) => {
    if (!upper || !lower) return;
    const upperBottom = upper.getBoundingClientRect().bottom;
    stacked.push({ upperBottom, lowerTop: lower.getBoundingClientRect().top, name });
  };
  pair(
    stage.querySelector("[data-kinetic-word]"),
    stage.querySelector(".vocab-reveal-details"),
    "The answer and the meaning panel",
  );
  pair(
    stage.querySelector(".vocab-spelling-word, .vocab-stroke-row"),
    stage.querySelector(".carousel-closing"),
    "The spelling and the handle",
  );
  return findFitProblems({
    width: stage.clientWidth,
    height: stage.clientHeight,
    safe,
    words,
    panel: panel ? { scrollHeight: panel.scrollHeight, clientHeight: panel.clientHeight } : null,
    stacked,
  });
}

/**
 * Wait until a mounted slide is provably finished and correct.
 * @param stage - the slide's stage element
 * @param safe - the margins it must keep
 * @returns Problems in plain words; empty when the slide may be captured
 */
export async function settleSlide(stage: HTMLElement, safe: SafeInsets): Promise<string[]> {
  const deadline = performance.now() + SETTLE_TIMEOUT_MS;
  let previous = "";
  let matches = 0;
  for (;;) {
    const content = contentProblem(stage);
    const moving = runningAnimations(stage);
    const signature = readLayoutSignature(stage);
    matches = !content && !moving.length && signature === previous ? matches + 1 : 0;
    previous = signature;
    if (matches >= STABLE_SAMPLES) break;
    if (performance.now() > deadline) {
      if (content) return [content];
      if (moving.length) return [`Still animating: ${[...new Set(moving)].join(", ")}`];
      return ["The layout never stopped changing"];
    }
    await new Promise((resolve) => window.setTimeout(resolve, SAMPLE_MS));
  }
  const font = fontProblem(stage);
  return font ? [font] : measureFit(stage, safe);
}
