/**
 * Per-character stroke data for the CJK spelling coda, fetched from static files.
 *
 * scripts/build-hanzi-strokes.ts writes one small JSON per served Han character to
 * public/hanzi/<version>/<codepoint>.json, so the host serves them as plain cached assets
 * and a reader downloads only the characters of the cards they meet. Each character is
 * fetched once per page session: the promise is memoised, so the card's early prefetch and
 * the coda's later load share one request. A failed fetch is forgotten so the next card
 * can try again.
 *
 * Imports no stroke data and no Hanzi Writer, so the card can prefetch without pulling
 * either into the English feed chunk (the bundle-boundary rule in ./hanzi).
 *
 * Exports: hanziStrokeUrl, loadHanziStrokes, prefetchHanziStrokes
 * Depends on: hanzi-writer (types only), ../data/hanzi-strokes-version
 */

import type { CharacterJson } from "hanzi-writer";
import { HANZI_STROKES_VERSION } from "../data/hanzi-strokes-version";

const HAN = /\p{Script=Han}/u;
const loaded = new Map<string, Promise<CharacterJson>>();

/**
 * The static file holding one character's strokes.
 * @param char A single Han character. @returns Root-relative URL.
 * @pure true
 */
export function hanziStrokeUrl(char: string): string {
  return `/hanzi/${HANZI_STROKES_VERSION}/${char.codePointAt(0)!.toString(16)}.json`;
}

function loadOne(char: string): Promise<CharacterJson> {
  const known = loaded.get(char);
  if (known) return known;
  const request = fetch(hanziStrokeUrl(char))
    .then((response) => {
      if (!response.ok) throw new Error(`No stroke data for "${char}" (${response.status})`);
      return response.json() as Promise<CharacterJson>;
    })
    .catch((error: unknown) => {
      loaded.delete(char);
      throw error;
    });
  loaded.set(char, request);
  return request;
}

/**
 * Load the strokes of every Han character in an answer, in order.
 * @param word Revealed answer. @returns One entry per Han character; rejects if any fails.
 */
export function loadHanziStrokes(word: string): Promise<CharacterJson[]> {
  return Promise.all(
    Array.from(word)
      .filter((ch) => HAN.test(ch))
      .map(loadOne),
  );
}

/**
 * Start fetching an answer's strokes in the background, so they are in hand by the time
 * the coda draws. Failures are left for the coda's own load to report.
 * @param word Answer of a card that just mounted.
 */
export function prefetchHanziStrokes(word: string): void {
  loadHanziStrokes(word).catch(() => {});
}
