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
 * Exports: FontRequest, FitInput, getSlideFontRequests, loadSlideFonts, findFitProblems,
 *   readLayoutSignature, settleSlide
 * Depends on: ./export-presets SafeInsets (type only)
 */

import type { SafeInsets } from "./export-presets";

/** The weights the kinetic stage paints: body and emphasis. */
const STAGE_WEIGHTS = [800, 900];
/** The weights the panel, brand and labels paint, all in Inter. */
const PANEL_WEIGHTS = [400, 500, 600, 650, 700, 800];

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
 * @returns One request per family and weight
 * @pure true
 */
export function getSlideFontRequests(stageFont: string, texts: readonly string[]): FontRequest[] {
  const text = [...new Set(texts.join(" "))].join("");
  const requests = STAGE_WEIGHTS.map((weight) => ({ family: stageFont, weight, text }));
  for (const weight of PANEL_WEIGHTS) requests.push({ family: "Inter", weight, text });
  return requests;
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
  /** The meaning panel's scroller, when the page has one. */
  panel: { scrollHeight: number; clientHeight: number } | null;
};

/**
 * Name what does not fit.
 * @param input - measurements of the drawn slide
 * @returns Plain descriptions; empty when the slide fits
 * @pure true
 */
export function findFitProblems(input: FitInput): string[] {
  const { width, height, safe, words, panel } = input;
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
    problems.push(`Meaning panel is cut off by ${Math.ceil(lost)} px`);
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
    if (!text) continue;
    const style = getComputedStyle(node);
    const family = style.fontFamily.split(",")[0]!.trim();
    if (!document.fonts.check(`${style.fontWeight} 64px ${family}`, text)) {
      return `The font ${family} ${style.fontWeight} was not ready for “${text.slice(0, 24)}”`;
    }
  }
  return null;
}

function measureFit(stage: HTMLElement, safe: SafeInsets): string[] {
  const origin = stage.getBoundingClientRect();
  const words = [...stage.querySelectorAll("[data-kinetic-word], .vocab-spelling-char")].map(
    (word) => {
      const box = word.getBoundingClientRect();
      return {
        left: box.left - origin.left,
        top: box.top - origin.top,
        right: box.right - origin.left,
        bottom: box.bottom - origin.top,
      };
    },
  );
  const panel = stage.querySelector<HTMLElement>(".vocab-reveal-scroll");
  return findFitProblems({
    width: stage.clientWidth,
    height: stage.clientHeight,
    safe,
    words,
    panel: panel ? { scrollHeight: panel.scrollHeight, clientHeight: panel.clientHeight } : null,
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
