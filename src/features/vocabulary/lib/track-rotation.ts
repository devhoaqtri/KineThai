/**
 * Rotate the ambient music as the reader moves through the stream: every
 * WORDS_PER_TRACK words the player hands over to a different track, and the
 * hand-over is placed on a word boundary — the old track fades out as its last
 * word finishes, the new one starts as the next word begins.
 *
 * The count belongs to the track, not to the session. If the track changes for any
 * other reason — it ran out, the reader shuffled, the music was switched off and
 * on — the count starts again, so a fresh track always gets its full run of words.
 *
 * Exports: createTrackRotation, TrackRotation, RotatingPlayer
 * Depends on: ./ambient (constants only; the player is passed in, so this runs under test)
 */

import { FADE_OUT_MS, WORDS_PER_TRACK } from "./ambient";

/** Finish the fade just before the word does, not exactly on it. */
const FADE_LEAD_MS = 150;

/** The parts of the ambient player a rotation drives (lib/ambient AmbientPlayer). */
export type RotatingPlayer = {
  readonly awaitingWord: boolean;
  readonly canChange: boolean;
  readonly trackSerial: number;
  changeTrack: () => number | null;
  fadeOutAndHold: () => void;
};

export type TrackRotation = {
  /** A new word came on screen. */
  wordStarted: () => void;
  /**
   * The on-screen word entered its final page, with the milliseconds left before the
   * stream moves on (0 when the reader pages by hand).
   */
  wordEnding: (remainingMs: number) => void;
  /**
   * The on-screen word left its final page without ending: the reader stepped back, or a
   * looping word went round again. The word is not ending, so the hand-over its ending
   * prepared is called off.
   */
  wordEndingCancelled: () => void;
  /** Drop any timer still pending (the feed unmounted). */
  dispose: () => void;
};

/**
 * Count words against the current track and change track when its run is over.
 * @param music The ambient player, and whether the reader has music on, read when needed.
 */
export function createTrackRotation(music: {
  player: () => RotatingPlayer;
  enabled: () => boolean;
}): TrackRotation {
  let run = { words: 0, serial: -1 };
  let fadeTimer: ReturnType<typeof setTimeout> | null = null;
  /** The track was faded out for the on-screen word's ending, and no word has begun since. */
  let bowedOut = false;
  const cancelFade = () => {
    if (fadeTimer !== null) clearTimeout(fadeTimer);
    fadeTimer = null;
  };

  const wordStarted = () => {
    cancelFade();
    bowedOut = false;
    if (!music.enabled()) {
      run.words = 0;
      return;
    }
    const player = music.player();
    // The old track already bowed out (its run was over, or it simply ran out of
    // music) and the player has been waiting for exactly this moment.
    if (player.awaitingWord) {
      const serial = player.changeTrack();
      if (serial !== null) run = { words: 1, serial };
      return;
    }
    if (player.trackSerial !== run.serial) {
      run = { words: 0, serial: player.trackSerial };
    }
    run.words += 1;
    if (run.words <= WORDS_PER_TRACK) return;
    // The run is over but nothing prepared the hand-over (the reader flicked past the
    // previous word before it finished). Change now; this word is the new track's
    // first. A refused change leaves the count over the limit, so the next word retries.
    const serial = player.changeTrack();
    if (serial !== null) run = { words: 1, serial };
  };

  const wordEnding = (remainingMs: number) => {
    cancelFade();
    if (!music.enabled()) return;
    const player = music.player();
    // Only the last word of a track's run prepares a hand-over, and only when
    // there is another track to hand over to.
    if (player.trackSerial !== run.serial) return;
    if (run.words < WORDS_PER_TRACK || !player.canChange) return;
    const wait = Math.max(0, remainingMs - FADE_OUT_MS - FADE_LEAD_MS);
    fadeTimer = setTimeout(() => {
      fadeTimer = null;
      bowedOut = true;
      music.player().fadeOutAndHold();
    }, wait);
  };

  const wordEndingCancelled = () => {
    // A fade still waiting to start was armed for an ending that is no longer coming.
    cancelFade();
    const faded = bowedOut;
    bowedOut = false;
    if (!faded || !music.enabled()) return;
    const player = music.player();
    // The fade already ran (or is running): the track bowed out for a word the reader took
    // back. The next track starts now, with the page they went back to, rather than leaving
    // the rest of that word silent, and the word counts as the new track's first. A track
    // that simply ran out by itself is not this hand-over, and still waits for a word.
    if (!player.awaitingWord) return;
    const serial = player.changeTrack();
    if (serial !== null) run = { words: 1, serial };
  };

  return { wordStarted, wordEnding, wordEndingCancelled, dispose: cancelFade };
}
