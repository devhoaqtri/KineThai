/**
 * The music bows out with the last word of a track's run: its fade is armed when the word
 * reaches its final page (the spelling coda). A reader who steps back off that page has
 * taken the word back, so the fade must not land under the page they went back to, and a
 * track that already bowed out must not leave the replayed word silent.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { FADE_OUT_MS, WORDS_PER_TRACK } from "../ambient";
import { createTrackRotation, type RotatingPlayer } from "../track-rotation";

/** The spelling coda's length when the word reaches it with autoplay on. */
const CODA_MS = 4000;

type FakePlayer = {
  awaitingWord: boolean;
  canChange: boolean;
  trackSerial: number;
  changeTrack: Mock<() => number | null>;
  fadeOutAndHold: Mock<() => void>;
};

function fakeMusic() {
  const player: FakePlayer = {
    awaitingWord: false,
    canChange: true,
    trackSerial: 1,
    changeTrack: vi.fn(() => {
      player.awaitingWord = false;
      player.trackSerial += 1;
      return player.trackSerial;
    }),
    fadeOutAndHold: vi.fn(() => {
      player.awaitingWord = true;
    }),
  };
  let enabled = true;
  const rotation = createTrackRotation({
    player: (): RotatingPlayer => player,
    enabled: () => enabled,
  });
  const playWords = (count: number) => {
    for (let index = 0; index < count; index += 1) rotation.wordStarted();
  };
  return { player, rotation, playWords, setEnabled: (on: boolean) => (enabled = on) };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("track rotation", () => {
  it("fades the track out as the last word of its run ends", () => {
    const { player, rotation, playWords } = fakeMusic();
    playWords(WORDS_PER_TRACK);
    rotation.wordEnding(CODA_MS);
    vi.advanceTimersByTime(CODA_MS - FADE_OUT_MS - 200);
    expect(player.fadeOutAndHold).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(player.fadeOutAndHold).toHaveBeenCalledTimes(1);
    rotation.wordStarted();
    expect(player.changeTrack).toHaveBeenCalledTimes(1);
  });

  it("prepares no hand-over before the run is over", () => {
    const { player, rotation, playWords } = fakeMusic();
    playWords(WORDS_PER_TRACK - 1);
    rotation.wordEnding(CODA_MS);
    vi.advanceTimersByTime(CODA_MS * 2);
    expect(player.fadeOutAndHold).not.toHaveBeenCalled();
  });
});

describe("stepping back off the last word's coda", () => {
  it("calls the fade off, and arms it again only when the word reaches its end again", () => {
    const { player, rotation, playWords } = fakeMusic();
    playWords(WORDS_PER_TRACK);
    rotation.wordEnding(CODA_MS);
    vi.advanceTimersByTime(300);
    rotation.wordEndingCancelled();
    vi.advanceTimersByTime(CODA_MS * 3);
    expect(player.fadeOutAndHold).not.toHaveBeenCalled();
    expect(player.changeTrack).not.toHaveBeenCalled();
    // The word plays forward to its coda again: the hand-over is prepared as usual.
    rotation.wordEnding(CODA_MS);
    vi.advanceTimersByTime(CODA_MS);
    expect(player.fadeOutAndHold).toHaveBeenCalledTimes(1);
  });

  it("starts the next track when the music had already bowed out, and counts the word as its first", () => {
    const { player, rotation, playWords } = fakeMusic();
    playWords(WORDS_PER_TRACK);
    // Turned by hand onto the coda: nothing tells how long is left, so it bows out at once.
    rotation.wordEnding(0);
    vi.advanceTimersByTime(0);
    expect(player.awaitingWord).toBe(true);
    rotation.wordEndingCancelled();
    expect(player.changeTrack).toHaveBeenCalledTimes(1);
    expect(player.awaitingWord).toBe(false);
    // The replayed word was the new track's first, so its run ends four words on.
    playWords(WORDS_PER_TRACK - 1);
    rotation.wordEnding(CODA_MS);
    vi.advanceTimersByTime(CODA_MS);
    expect(player.fadeOutAndHold).toHaveBeenCalledTimes(2);
    expect(player.changeTrack).toHaveBeenCalledTimes(1);
  });

  it("leaves a track that ran out by itself waiting for the next word", () => {
    const { player, rotation, playWords } = fakeMusic();
    playWords(2);
    player.awaitingWord = true;
    rotation.wordEndingCancelled();
    expect(player.changeTrack).not.toHaveBeenCalled();
  });

  it("does nothing with the music off", () => {
    const { player, rotation, playWords, setEnabled } = fakeMusic();
    playWords(WORDS_PER_TRACK);
    rotation.wordEnding(0);
    vi.advanceTimersByTime(0);
    setEnabled(false);
    rotation.wordEndingCancelled();
    expect(player.changeTrack).not.toHaveBeenCalled();
  });
});
