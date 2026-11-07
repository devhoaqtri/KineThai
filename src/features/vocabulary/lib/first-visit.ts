/**
 * A first visit opens on a demo, not on the level picker.
 *
 * Someone who has never seen the feed cannot judge "vỡ lòng" against "chuyên sâu" before
 * they know what a word here even is, so the very first thing they get is the feed itself:
 * real words from the easiest level the deck has, each opened by the same "Từ gì mà ..."
 * badge a recorded clip opens with, held over the card until the first clue may start.
 * They can scroll to another demo word as often as they like. The first one that plays to
 * its end hands them to the level picker, and the feed carries on as normal from there.
 *
 * The demo is shown once per browser, not per language like the difficulty choice: once
 * someone has watched how a word plays, they know it on every host. It is marked seen the
 * moment it starts, so it never comes back, not even for a reader who left halfway (they
 * open on the picker instead); only clearing the site's storage brings it back.
 *
 * Exports: WORD_HOOK, DEMO_BADGE_MS, DEMO_SEEN_KEY, readDemoSeen, writeDemoSeen,
 *          demoDifficulty
 * Depends on: ./difficulty, ./level-ladder (type), ./target-language (type)
 */

import { DIFFICULTY_ALL, countTrackWords, isTrackAvailable, tracksFor } from "./difficulty";
import type { LevelLadder } from "./level-ladder";
import type { TargetLocale } from "./target-language";

/** The question a word opens with: the demo's badge, and a recorded clip's. */
export const WORD_HOOK = "Từ gì mà ...";

/**
 * How long the badge holds the card back, in ms. The badge's whole timeline is written as
 * shares of this one number (`--demo-badge-dur`, .vocab-demo-badge in vocabulary.css), so
 * the card starts exactly as the veil has lifted.
 */
export const DEMO_BADGE_MS = 1600;

/** localStorage key that records that this browser has been shown the demo. */
export const DEMO_SEEN_KEY = "kinetic.vocab.demo-seen";

/** Whether this browser has already been shown the demo; false without storage. */
export function readDemoSeen(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(DEMO_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

/** Remember that the demo was shown; never throws. */
export function writeDemoSeen(): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(DEMO_SEEN_KEY, "1");
  } catch {
    // Quota or privacy mode: nothing can be remembered, so the demo plays again next visit.
  }
}

/**
 * The difficulty the demo streams: the easiest track this deck has words for, so a
 * newcomer's first word is one they have a real chance of guessing.
 * @param locale Deck locale. @param ladder The bundled level ladder for that locale.
 * @returns A track id, or "" (every level) when no track has words.
 * @pure true
 */
export function demoDifficulty(locale: TargetLocale, ladder: LevelLadder): string {
  const track = tracksFor(locale).find(
    (candidate) =>
      isTrackAvailable(candidate, ladder.levels) &&
      countTrackWords([candidate.id], ladder.levelCounts, ladder.levels) > 0,
  );
  return track?.id ?? DIFFICULTY_ALL;
}
