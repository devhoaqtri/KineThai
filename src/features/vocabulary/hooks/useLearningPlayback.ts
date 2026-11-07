/** Visibility-aware clue playback that auto-plays pages and finishes the card. Exports: useLearningPlayback. Depends on: React. */
import { useEffect, useRef, useState } from "react";

/** How long after a word stops being on screen its card rewinds to the first page: past a swipe's glide, so the card is already out of view. */
const REWIND_AFTER_LEAVE_MS = 700;

/** Advance clues while visible; once the reveal is reached, signal the stream to load the next word. @param options Playback configuration. @returns Stage state and navigation. */
export function useLearningPlayback(options: {
  count: number;
  active: boolean;
  /**
   * Whether this card is the word on screen at all, playing or not. `active` drops while
   * an overlay covers the feed; `current` does not. The difference is what separates a
   * pause (keep the page's clock) from the reader leaving the word (start it afresh).
   * Defaults to `active`.
   */
  current?: boolean;
  autoplay: boolean;
  reducedMotion: boolean;
  durations: number[];
  canAdvance: boolean;
  /**
   * Page that `reveal()` jumps to. Defaults to the last page; the vocabulary
   * card passes the reveal stage index because it appends a spelling coda after
   * it, and "reveal" must land on the answer rather than on the coda.
   */
  revealPage?: number;
  /** Replay the word from its first page instead of finishing when the last page ends. */
  loop?: boolean;
  /** Page to open on; a still image starts on the page it shows. */
  initialPage?: number;
  onFinish?: () => void;
}) {
  const [page, setPage] = useState(options.initialPage ?? 0);
  const [replay, setReplay] = useState(0);
  const [visible, setVisible] = useState(() => typeof document === "undefined" || !document.hidden);
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  // A physical rotation can strand `visible`: the rotate-to-portrait gate releases the
  // screen wake lock while it is up, so a phone left in landscape may dim or sleep. On
  // rotate-back the matching `visibilitychange -> visible` can be missed or race this
  // hook's listeners, leaving `visible` stuck false — which keeps `playing` (and so the
  // auto-advance timer) permanently off even though the card is active again. Re-read the
  // authoritative `document.hidden` the moment the card becomes active, plus on focus and
  // bfcache restore, so playback always resumes without needing a manual tap.
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (options.active) setVisible(!document.hidden);
    const resync = () => setVisible(!document.hidden);
    window.addEventListener("focus", resync);
    window.addEventListener("pageshow", resync);
    return () => {
      window.removeEventListener("focus", resync);
      window.removeEventListener("pageshow", resync);
    };
  }, [options.active]);
  const playing = options.active && visible && options.autoplay && !options.reducedMotion;
  const isLast = page >= options.count - 1;
  const duration = options.durations[page] ?? 3200;
  // Keep the latest finish callback without retriggering the timer every render.
  const finishRef = useRef(options.onFinish);
  useEffect(() => {
    finishRef.current = options.onFinish;
  }, [options.onFinish]);
  // A pause must be a pause. The timer used to be re-armed with the page's FULL duration
  // every time playback resumed, so closing a sheet restarted the page's clock (and, with
  // the text remounting alongside it, replayed the page). `elapsed` carries the time a page
  // has already been shown across pauses, and is reset only when the page itself changes.
  const elapsed = useRef(0);
  const pageKey = `${page}:${replay}`;
  const lastPageKey = useRef(pageKey);
  // Remember the previous `playing` state so a resume can be detected inside the
  // timer effect. On the last page the reader must have actually SEEN the answer
  // for its clock to count; a scroll-away-and-return pause leaves `elapsed` near
  // `duration` and the resume fires `onFinish` in ~0ms — the card auto-skips with
  // a burst of gradient pans the reader never looked at. Intermediate pages keep
  // their banked partial time so pausing a clue mid-way still resumes in the middle.
  const wasPlaying = useRef(false);
  useEffect(() => {
    if (lastPageKey.current !== pageKey) {
      lastPageKey.current = pageKey;
      elapsed.current = 0;
    } else if (playing && !wasPlaying.current && isLast) {
      elapsed.current = 0;
    }
    wasPlaying.current = playing;
    if (!playing || !options.autoplay) return;
    // Wait for a buffered next word; retry/reconnect must not strand the reveal.
    if (isLast && !options.loop && !options.canAdvance) return;
    const startedAt = performance.now();
    const timer = setTimeout(
      () => {
        // A timer the browser held back (screen dimmed, tab frozen) must not fire a
        // page turn nobody can see; the visibility listener re-arms it on return.
        if (typeof document !== "undefined" && document.hidden) return;
        if (isLast && options.loop) {
          setPage(0);
          setReplay((current) => current + 1);
        } else if (isLast) finishRef.current?.();
        else setPage((current) => Math.min(current + 1, options.count - 1));
      },
      Math.max(0, duration - elapsed.current),
    );
    return () => {
      clearTimeout(timer);
      // Bank at most the page's own length, and nothing for time spent with the page
      // hidden — otherwise a long pause returns with the clock already spent.
      const shown =
        typeof document !== "undefined" && document.hidden ? 0 : performance.now() - startedAt;
      elapsed.current = Math.min(duration, elapsed.current + shown);
    };
  }, [
    playing,
    options.autoplay,
    options.loop,
    options.count,
    options.canAdvance,
    duration,
    isLast,
    pageKey,
  ]);
  // Declared after the timer effect on purpose: its cleanup has just banked the time this
  // page was shown, and a word the reader has LEFT must not keep that — coming back to a
  // finished card would otherwise find its clock already spent and bounce straight off it.
  const current = options.current ?? options.active;
  // A word the reader comes back to starts again from its first page. Its card stays
  // mounted while it is a neighbour, and it used to keep its page: a finished word is left
  // on the spelling coda, so scrolling back replayed only the coda, finished, and pushed
  // the reader forward again, every time they tried. The rewind waits until the card has
  // slid out of view so it never jumps while still on screen; a reader who comes straight
  // back before then gets it the moment the card is the word on screen again.
  const rewindDue = useRef(false);
  const shownOnce = useRef(false);
  useEffect(() => {
    if (!current) {
      elapsed.current = 0;
      // Nothing to rewind on a neighbour that has not been on screen yet, nor on a still
      // image, which keeps the page it shows.
      if (!shownOnce.current || options.initialPage !== undefined) return;
      rewindDue.current = true;
      const timer = setTimeout(() => {
        if (!rewindDue.current) return;
        rewindDue.current = false;
        setPage(0);
        setReplay((count) => count + 1);
      }, REWIND_AFTER_LEAVE_MS);
      return () => clearTimeout(timer);
    }
    shownOnce.current = true;
    if (rewindDue.current) {
      rewindDue.current = false;
      setPage(0);
      setReplay((count) => count + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);
  return {
    page,
    playing,
    duration,
    replay,
    previous: () => setPage((current) => Math.max(0, current - 1)),
    next: () => setPage((current) => Math.min(options.count - 1, current + 1)),
    reveal: () => setPage(options.revealPage ?? options.count - 1),
    restart: () => {
      setPage(0);
      setReplay((current) => current + 1);
    },
  };
}
