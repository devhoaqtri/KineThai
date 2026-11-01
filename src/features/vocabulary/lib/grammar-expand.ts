/**
 * The Settings choice to always open the meaning panel's "Nâng cao" grammar section,
 * remembered on this device. Off until the reader turns it on. Opening the section by
 * hand on one word is never remembered: only this choice carries to the next word,
 * because it is also what gives that word's answer its doubled time.
 *
 * Exports: GRAMMAR_EXPAND_KEY, readGrammarExpand, writeGrammarExpand
 */

export const GRAMMAR_EXPAND_KEY = "kinetic.vocab.grammar-expand";

/** @returns true only when the reader turned the choice on; unavailable storage reads off. */
export function readGrammarExpand(): boolean {
  try {
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem(GRAMMAR_EXPAND_KEY) === "1";
  } catch {
    return false;
  }
}

/** Remember the choice; never throws. @param expand Whether the section always opens. */
export function writeGrammarExpand(expand: boolean): void {
  try {
    if (typeof localStorage === "undefined") return;
    if (expand) localStorage.setItem(GRAMMAR_EXPAND_KEY, "1");
    else localStorage.removeItem(GRAMMAR_EXPAND_KEY);
  } catch {
    // Quota or privacy mode — the toggle simply resets next visit.
  }
}
