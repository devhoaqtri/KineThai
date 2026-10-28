/**
 * Whether the reader keeps the meaning panel's "Nâng cao" grammar section open,
 * remembered on this device. Closed until they open it.
 *
 * Exports: GRAMMAR_OPEN_KEY, readGrammarOpen, writeGrammarOpen
 */

export const GRAMMAR_OPEN_KEY = "kinetic.vocab.grammar-open";

/** @returns true only when the reader left the section open; unavailable storage reads closed. */
export function readGrammarOpen(): boolean {
  try {
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem(GRAMMAR_OPEN_KEY) === "1";
  } catch {
    return false;
  }
}

/** Remember the section's state; never throws. @param open Whether it is open. */
export function writeGrammarOpen(open: boolean): void {
  try {
    if (typeof localStorage === "undefined") return;
    if (open) localStorage.setItem(GRAMMAR_OPEN_KEY, "1");
    else localStorage.removeItem(GRAMMAR_OPEN_KEY);
  } catch {
    // Quota or privacy mode — the section simply starts closed next time.
  }
}
