/**
 * The reader's chosen difficulty for one deck, remembered on this device.
 *
 * Each language keeps its own slot in localStorage: the same reader may want
 * different tracks across hosts, and neither visit should clobber the other's
 * stored pick. Its PRESENCE in the current locale's slot is what the feed opens
 * on next visit; a locale with no slot yet still shows the first-load picker
 * (an empty string in the slot is the "every level" choice, not "never chosen").
 * The old device-wide key migrated into whatever locale the reader was on when
 * they first visited after this change, so nobody loses their level on upgrade.
 *
 * Exports: DIFFICULTY_CHOICE_KEY, DIFFICULTY_CHOICE_PREFIX, difficultyChoiceKey,
 *          readDifficultyChoice, writeDifficultyChoice
 * Depends on: ./difficulty (track ids, for validation), ./target-language
 */

import { DIFFICULTY_IDS, tracksFor } from "./difficulty";
import { DEFAULT_TARGET, type TargetLocale } from "./target-language";

export const DIFFICULTY_CHOICE_KEY = "kinetic.vocab.difficulty";
/** Prefix for every locale slot; the full key is prefix + locale code. */
export const DIFFICULTY_CHOICE_PREFIX = "kinetic.vocab.difficulty.";

/** The localStorage key that holds this locale's difficulty choice. */
export function difficultyChoiceKey(locale: TargetLocale): string {
  return `${DIFFICULTY_CHOICE_PREFIX}${locale}`;
}

function sanitize(raw: string, locale?: TargetLocale): string {
  const allowed = locale
    ? new Set(tracksFor(locale).map((track) => track.id))
    : new Set(DIFFICULTY_IDS);
  return raw
    .split(",")
    .map((id) => id.trim())
    .filter((id) => allowed.has(id))
    .join(",");
}

/**
 * Read the stored choice for one locale.
 * @param locale Deck locale (defaults to DEFAULT_TARGET when omitted).
 * @returns Comma-joined track ids ("" = every level), or null when nothing was
 *   chosen for this locale or storage is unavailable. A legacy device-wide pick
 *   migrates into the current locale's slot the first time it is read.
 */
export function readDifficultyChoice(locale: TargetLocale = DEFAULT_TARGET): string | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const key = difficultyChoiceKey(locale);
    const raw = localStorage.getItem(key);
    if (raw !== null) return sanitize(raw, locale);
    const legacy = localStorage.getItem(DIFFICULTY_CHOICE_KEY);
    if (legacy === null) return null;
    localStorage.setItem(key, legacy);
    localStorage.removeItem(DIFFICULTY_CHOICE_KEY);
    return sanitize(legacy, locale);
  } catch {
    return null;
  }
}

/**
 * Remember a choice for one locale; never throws.
 * @param localeOrDifficulty Deck locale (or difficulty string for 1-arg callers).
 * @param maybeDifficulty Comma-joined track ids, "" for all.
 */
export function writeDifficultyChoice(
  localeOrDifficulty: TargetLocale | string,
  maybeDifficulty?: string,
): void {
  const locale = (maybeDifficulty === undefined ? DEFAULT_TARGET : localeOrDifficulty) as TargetLocale;
  const difficulty = maybeDifficulty === undefined ? localeOrDifficulty : maybeDifficulty;
  try {
    if (typeof localStorage !== "undefined")
      localStorage.setItem(difficultyChoiceKey(locale), difficulty);
  } catch {
    // Quota or privacy mode — the picker simply shows again next visit.
  }
}
