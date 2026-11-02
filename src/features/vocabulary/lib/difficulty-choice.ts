/**
 * The reader's chosen difficulty for one deck, remembered on this device.
 *
 * Each language keeps its own slot in localStorage: the same reader may want
 * TOPIK1 on the Korean host and B1 on the Spanish host, and neither visit should
 * clobber the other's stored pick. Its PRESENCE in the current locale's slot is
 * what the feed opens on next visit; a locale with no slot yet still shows the
 * first-load picker (an empty string in the slot is the "every level" choice,
 * not "never chosen"). The old device-wide key migrated into whatever locale the
 * reader was on when they first visited after this change, so nobody loses their
 * level on upgrade — every other locale still opens on onboarding, which is the
 * whole point of per-language picks.
 *
 * Exports: DIFFICULTY_CHOICE_PREFIX, difficultyChoiceKey, readDifficultyChoice,
 *          writeDifficultyChoice
 * Depends on: ./difficulty (track ids, for validation), ./target-language
 */

import { DIFFICULTY_IDS } from "./difficulty";
import type { TargetLocale } from "./target-language";

/** Prefix for every locale slot; the full key is prefix + locale code. */
export const DIFFICULTY_CHOICE_PREFIX = "kinetic.vocab.difficulty.";
/** The pre-scoping device-wide key. Read once, then deleted on migration. */
const LEGACY_DIFFICULTY_CHOICE_KEY = "kinetic.vocab.difficulty";

/** The localStorage key that holds this locale's difficulty choice. */
export function difficultyChoiceKey(locale: TargetLocale): string {
  return `${DIFFICULTY_CHOICE_PREFIX}${locale}`;
}

/** Trim, drop unknown ids, rejoin. Same shape the pre-scoping reader used. */
function sanitize(raw: string): string {
  return raw
    .split(",")
    .map((id) => id.trim())
    .filter((id) => DIFFICULTY_IDS.includes(id))
    .join(",");
}

/**
 * Read the stored choice for one locale.
 * @param locale Deck locale (as `deckLocaleFor(host)` gives it).
 * @returns Comma-joined track ids ("" = every level), or null when nothing was
 *   chosen for this locale or storage is unavailable. A legacy device-wide pick
 *   migrates into the current locale's slot the first time it is read.
 */
export function readDifficultyChoice(locale: TargetLocale): string | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const key = difficultyChoiceKey(locale);
    const raw = localStorage.getItem(key);
    if (raw !== null) return sanitize(raw);
    const legacy = localStorage.getItem(LEGACY_DIFFICULTY_CHOICE_KEY);
    if (legacy === null) return null;
    localStorage.setItem(key, legacy);
    localStorage.removeItem(LEGACY_DIFFICULTY_CHOICE_KEY);
    return sanitize(legacy);
  } catch {
    return null;
  }
}

/**
 * Remember a choice for one locale; never throws.
 * @param locale Deck locale. @param difficulty Comma-joined track ids, "" for all.
 */
export function writeDifficultyChoice(locale: TargetLocale, difficulty: string): void {
  try {
    if (typeof localStorage !== "undefined")
      localStorage.setItem(difficultyChoiceKey(locale), difficulty);
  } catch {
    // Quota or privacy mode — the picker simply shows again next visit.
  }
}
