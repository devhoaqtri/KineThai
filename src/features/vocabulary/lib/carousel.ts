/**
 * What a word's Instagram carousel is made of, as plain data.
 *
 * One slide per clue page, then the answer with its meaning, then grammar when the word has
 * any, then the spelling page, which closes the post with the handle and address. The first
 * clue is the hook: there is no separate cover. Instagram allows 20 slides and even a word
 * with two grammar slides stays near half of that, so nothing here ever has to drop a page.
 *
 * The answer must stay off slide 1, which is also the profile grid's thumbnail. The pages are
 * already masked, so what remains is the answer hiding inside a longer word ("stay" in
 * "homestay"): the first clue free of that takes slide 1, and a word with none gets a warning.
 *
 * Exports: CarouselSlide, CarouselPlan, MAX_CAROUSEL_SLIDES, hasCoverSpoiler,
 *   buildCarouselSlides, splitGrammarRows, getTextSizeCap, getCarouselFolderName, buildCarouselCaption, buildCarouselAltText
 * Depends on: ./carousel-copy, ./stages (type), ./target-language, ./word-joiner
 */

import type { GrammarRow } from "./grammar";
import type { LearningStage } from "./stages";
import { CAROUSEL_HASHTAGS, CAROUSEL_HOOK, CAROUSEL_SAVE_PROMPT } from "./carousel-copy";
import { siteAddress, type TargetLocale } from "./target-language";
import { stripWordJoiners } from "./word-joiner";

/** Text lines one grammar slide holds at its largest size. */
const GRAMMAR_SLIDE_LINES = 13;
/** Characters a tip fits on a line of that slide. */
const GRAMMAR_TIP_LINE_CHARS = 38;

/** Largest clue size over the smallest, within one word. */
const MAX_TEXT_SIZE_RATIO = 1.35;

/** Instagram's limit, for app and API alike. */
export const MAX_CAROUSEL_SLIDES = 20;

export type CarouselSlide =
  /** `page` is the card's own page to draw. */
  | { kind: "clue"; page: number; hook: boolean }
  | { kind: "answer"; page: number }
  /** `part` picks which of the word's grammar pages this slide shows. */
  | { kind: "grammar"; page: number; part: number }
  | { kind: "closing"; page: number };

export type CarouselPlan = {
  slides: CarouselSlide[];
  /** Said to the operator when no clue could keep the answer off slide 1. */
  warning: string | null;
};

/**
 * Whether a clue shows the answer, even inside a longer word.
 * @param text - the clue as drawn, already masked
 * @param word - the answer
 * @returns True when the answer's letters appear in the text
 * @pure true
 */
export function hasCoverSpoiler(text: string, word: string): boolean {
  const answer = word.trim().toLowerCase();
  // Two Latin letters turn up by chance in almost any clue. A Han word does not.
  const long = answer.length >= 3 || /\p{Script=Han}/u.test(answer);
  return long && text.toLowerCase().includes(answer);
}

/**
 * Put a word's pages in carousel order.
 * @param stages - the word's pages, from buildStages, the reveal last
 * @param word - the answer
 * @param grammarParts - how many grammar slides the word needs, 0 for none
 * @returns The slides, and a warning when slide 1 could not be kept clean
 * @pure true
 */
export function buildCarouselSlides(
  stages: readonly LearningStage[],
  word: string,
  grammarParts: number,
): CarouselPlan {
  const answerPage = stages.findIndex((stage) => stage.reveal);
  const cluePages = stages.flatMap((stage, page) => (stage.reveal ? [] : [page]));
  const clean = cluePages.find((page) => !hasCoverSpoiler(stages[page]!.text, word));
  const first = clean ?? cluePages[0];
  const order = first === undefined ? [] : [first, ...cluePages.filter((page) => page !== first)];
  const slides: CarouselSlide[] = order.map((page, index) => ({
    kind: "clue",
    page,
    hook: index === 0,
  }));
  slides.push({ kind: "answer", page: answerPage });
  for (let part = 0; part < grammarParts; part += 1) {
    slides.push({ kind: "grammar", page: answerPage, part });
  }
  slides.push({ kind: "closing", page: answerPage + 1 });
  return {
    slides,
    warning:
      clean === undefined && first !== undefined
        ? "Every clue contains the answer's letters, so slide 1 may give it away."
        : null,
  };
}

/**
 * The folder and file stem for one export. A share code, never the word: a name can
 * neither spoil the answer nor collapse to nothing for a word with no Latin letters.
 * @param locale - the deck
 * @param id - the word's share code, or its id when it has none
 * @param format - the format id
 * @returns For example "hoa-chayla-2BB-4x5"
 * @pure true
 */
export function getCarouselFolderName(locale: TargetLocale, id: string, format: string): string {
  return `${siteAddress(locale).split(".")[0]}-chayla-${id}-${format}`;
}

/** A row's height in text lines: a term and its gloss take two. */
function grammarRowLines(row: GrammarRow): number {
  switch (row.kind) {
    case "line":
      return 2;
    case "table":
      return row.forms.length * 2;
    case "list":
      return Math.max(2, row.items.length * 2);
    case "tip":
      return 2 + Math.ceil(row.value.length / GRAMMAR_TIP_LINE_CHARS);
  }
}

/**
 * Share a word's grammar across slides. A long verb table is real content, and shrinking it
 * to fit one slide makes it unreadable on a phone, so it flows onto the next instead. A row
 * is never split, and the fit check still guards what this estimates.
 * @param rows - from grammarRows
 * @returns One list of rows per slide; empty when the word has no grammar
 * @pure true
 */
export function splitGrammarRows(rows: readonly GrammarRow[]): GrammarRow[][] {
  const parts: GrammarRow[][] = [];
  let used = 0;
  for (const row of rows) {
    const lines = grammarRowLines(row);
    if (!parts.length || used + lines > GRAMMAR_SLIDE_LINES) {
      parts.push([]);
      used = 0;
    }
    parts[parts.length - 1]!.push(row);
    used += lines;
  }
  return parts;
}

/**
 * The ceiling that keeps a word's clue slides close in size. Each page solves its own size,
 * so a short page can land far above a long neighbour, and a swipe shows that as a jump.
 * @param sizes - each clue page's solved size
 * @returns The ceiling, or undefined when the sizes are already close
 * @pure true
 */
export function getTextSizeCap(sizes: readonly number[]): number | undefined {
  if (!sizes.length) return undefined;
  const cap = Math.min(...sizes) * MAX_TEXT_SIZE_RATIO;
  return Math.max(...sizes) > cap ? Math.round(cap * 10) / 10 : undefined;
}

/**
 * The post's caption. It never names the answer, because a caption shows beside slide 1.
 * @param options.locale - the deck
 * @param options.firstClue - slide 1's text
 * @param options.address - the address the closing slide shows
 * @param options.handle - the account, if one was given
 * @returns Text ready to paste
 * @pure true
 */
export function buildCarouselCaption(options: {
  locale: TargetLocale;
  firstClue: string;
  address: string;
  handle?: string;
}): string {
  const { locale, firstClue, address, handle } = options;
  return [
    `${CAROUSEL_HOOK} ${stripWordJoiners(firstClue)}`,
    CAROUSEL_SAVE_PROMPT,
    [handle, address].filter(Boolean).join(" · "),
    CAROUSEL_HASHTAGS[locale],
  ].join("\n\n");
}

/**
 * One line of alt text per slide, in order, for Instagram's accessibility field.
 * @param slides - the plan's slides
 * @param stages - the word's pages
 * @param answer - the word and its meaning, used only from the answer slide on
 * @returns One line per slide
 * @pure true
 */
export function buildCarouselAltText(
  slides: readonly CarouselSlide[],
  stages: readonly LearningStage[],
  answer: { word: string; meaning: string },
): string[] {
  return slides.map((slide, index) => {
    const number = `Ảnh ${index + 1}`;
    switch (slide.kind) {
      case "clue":
        return `${number}: ${stripWordJoiners(stages[slide.page]!.text).replaceAll(/_{2,}/g, "chỗ trống")}`;
      case "answer":
        return `${number}: đáp án là ${answer.word}, nghĩa là ${stripWordJoiners(answer.meaning)}.`;
      case "grammar":
        return `${number}: ghi chú ngữ pháp của từ ${answer.word}.`;
      case "closing":
        return `${number}: đánh vần lại từ ${answer.word}.`;
    }
  });
}
