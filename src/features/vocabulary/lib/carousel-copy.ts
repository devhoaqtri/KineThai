/**
 * The words a carousel adds of its own. Everything else on a slide comes from the deck.
 *
 * Vietnamese for every language, like the rest of the app's interface: the reader is
 * Vietnamese whichever language they are learning.
 *
 * Exports: CAROUSEL_HOOK, CAROUSEL_SWIPE_CUE, CAROUSEL_SAVE_PROMPT, CAROUSEL_GRAMMAR_TITLE,
 *   CAROUSEL_HASHTAGS
 * Depends on: ./first-visit (WORD_HOOK), ./target-language (type)
 */

import { WORD_HOOK } from "./first-visit";
import type { TargetLocale } from "./target-language";

/** Also the opening badge of a recorded clip and of the feed's demo, so a word opens the
 * same way in all three. */
export const CAROUSEL_HOOK = WORD_HOOK;
export const CAROUSEL_SWIPE_CUE = "Vuốt để đoán";
export const CAROUSEL_SAVE_PROMPT = "Vuốt hết để xem đáp án. Lưu lại để ôn, gửi bạn thử đoán.";
export const CAROUSEL_GRAMMAR_TITLE = "Nâng cao";

export const CAROUSEL_HASHTAGS: Record<TargetLocale, string> = {
  en: "#hoctienganh #tuvungtienganh #doantu",
  zh: "#hoctiengtrung #tuvungtiengtrung #doantu",
  ko: "#hoctienghan #tuvungtienghan #doantu",
  ja: "#hoctiengnhat #tuvungtiengnhat #doantu",
  fr: "#hoctiengphap #tuvungtiengphap #doantu",
  de: "#hoctiengduc #tuvungtiengduc #doantu",
  es: "#hoctiengtaybannha #tuvungtiengtaybannha #doantu",
};
