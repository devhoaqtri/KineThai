/** Fixed-height virtual window anchored on the on-screen word's identity. Exports: useVocabularyWindow. Depends on: React, TanStack Virtual. */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { defaultRangeExtractor, useVirtualizer, type Range } from "@tanstack/react-virtual";
import type { FeedEntry } from "../types";
import { feedLog } from "../lib/feed-log";

/** Fraction of one card the scroll must pass beyond a boundary before the active index may switch. */
const ACTIVE_HYSTERESIS = 0.08;
/** Quiet time after the last scroll event before the scroll is considered at rest. */
const SCROLL_IDLE_MS = 140;

/**
 * Take the feed away from the browser for the length of one programmatic glide.
 *
 * Two native behaviours fight a scripted scroll on a snap container, and both produced the
 * same symptom — the stream showing the next word, being pulled back, then corrected:
 *  - the fling/snap-back the browser starts when a finger lifts, which overrides a scroll
 *    written at touchend (`overflow: hidden` cancels it; scripted scrolling still works);
 *  - re-snapping after layout. A snap container remembers the box it last RESTED on and
 *    returns to it whenever layout changes. Mid-glide that box is still the old word, and
 *    the new word becoming active re-renders the feed — so the glide was thrown back to
 *    where it started the instant it crossed half way. With snapping off there is nothing
 *    to return to.
 * @param element The feed's scroll viewport.
 */
function hold(element: HTMLElement): void {
  element.style.overflowY = "hidden";
  element.style.scrollSnapType = "none";
}

/** Hand the feed back to native scrolling and snapping. @param element The viewport. */
function release(element: HTMLElement): void {
  element.style.overflowY = "";
  element.style.scrollSnapType = "";
}

/**
 * Resolve the active card index with a deadzone so sub-threshold jitter at a snap
 * boundary cannot flip the active card back and forth (which strobes the backdrop
 * and remounts the kinetic word before it finishes playing).
 * @param frac - scroll offset expressed in fractional card units
 * @param current - currently active index
 * @param count - number of retained entries
 * @returns The stable active index
 * @pure true
 */
function resolveActiveIndex(frac: number, current: number, count: number): number {
  if (count <= 0) return 0;
  let index = current;
  if (frac > current + 0.5 + ACTIVE_HYSTERESIS) index = Math.ceil(frac - 0.5);
  else if (frac < current - 0.5 - ACTIVE_HYSTERESIS) index = Math.floor(frac + 0.5);
  return Math.max(0, Math.min(count - 1, index));
}

/**
 * Virtualize a bounded page window without accumulating huge spacers.
 *
 * The window is anchored on the OCCURRENCE that is on screen, never on arithmetic over
 * server positions. The list it is given is filtered (words the history blocks are
 * removed), so positions have gaps: translating "position 40" into a row by subtracting
 * the first row's position lands on the wrong word as soon as one row before it is
 * missing. Every time the list changes — a page arrives, an old one is evicted, a blocked
 * word unlocks — the anchor is looked up again by id and the scroll offset is moved by
 * exactly the number of rows it shifted.
 *
 * It is also the only thing that writes the scroll offset. Every write goes straight to
 * the element; the virtualizer's own scrollToIndex is not used, because it keeps
 * re-asserting "row N" for seconds afterwards, and row N stops meaning the same word the
 * moment the list changes underneath it.
 *
 * @param entries Occurrences to show, in order (gaps in `position` are expected).
 * @param overscan How many words either side of the visible one to keep mounted.
 *   Normally 2, so a flick lands on an already-rendered card; 0 while an overlay
 *   covers the feed, where the neighbours cannot be seen and only cost memory.
 * @returns Viewport bindings.
 */
export function useVocabularyWindow(
  entries: readonly Pick<FeedEntry, "occurrenceId">[],
  overscan = 2,
) {
  const viewport = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(() =>
    typeof window === "undefined" ? 800 : window.innerHeight,
  );
  // The anchor. null until the first word arrives, when it falls back to the first row.
  const [activeId, setActiveId] = useState<string | null>(null);
  const direction = useRef<"next" | "previous">("next");
  const lastTop = useRef(0);
  const adjusting = useRef(false);
  // Where the anchor sat on the previous render, so a row the list dropped out from under
  // the reader can be replaced by its nearest surviving neighbour instead of row 0.
  const lastIndex = useRef(0);
  const found = activeId === null ? -1 : entries.findIndex((e) => e.occurrenceId === activeId);
  const activeIndex =
    found >= 0 ? found : Math.max(0, Math.min(entries.length - 1, lastIndex.current));
  const rangeExtractor = useCallback(
    (range: Range) => {
      const indexes = defaultRangeExtractor(range);
      // Keep the active occurrence mounted while the layout effect rebases the scroll offset.
      if (activeIndex < range.count && !indexes.includes(activeIndex)) {
        indexes.push(activeIndex);
        indexes.sort((a, b) => a - b);
      }
      return indexes;
    },
    [activeIndex],
  );
  const getItemKey = useCallback((index: number) => entries[index].occurrenceId, [entries]);
  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => viewport.current,
    estimateSize: () => height,
    getItemKey,
    rangeExtractor,
    overscan,
  });

  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const measure = () => setHeight(Math.max(1, element.clientHeight));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  /** Write the scroll offset, shielding onScroll from the echo of our own write. */
  const writeTop = useCallback((top: number) => {
    const element = viewport.current;
    if (!element) return;
    adjusting.current = true;
    element.scrollTop = top;
    lastTop.current = top;
  }, []);

  // Rebase: keep the anchored word under the reader when the list or the row height
  // changes. `previous` remembers the geometry the current scroll offset was written in.
  const previous = useRef({ index: 0, height, id: null as string | null });
  useLayoutEffect(() => {
    const element = viewport.current;
    const old = previous.current;
    const id = entries[activeIndex]?.occurrenceId ?? null;
    previous.current = { index: activeIndex, height, id };
    lastIndex.current = activeIndex;
    // The anchor vanished (or there was none yet): adopt the row now standing in its place.
    const adopted = id !== activeId;
    if (adopted) setActiveId(id);
    if (!element || !entries.length) return;
    // Three things call for a rebase, and the reader scrolling to another word is NOT one
    // of them — that changes the anchor, not the geometry, and writing the offset then
    // would yank the feed out from under a finger that is still dragging it.
    const shifted = old.id === id && old.index !== activeIndex; // rows moved under the anchor
    const resized = old.height !== height;
    if (!shifted && !resized && !adopted) return;
    // How far the reader had dragged away from the anchor, in rows of the OLD geometry.
    const drift = old.id === id ? element.scrollTop / old.height - old.index : 0;
    // A resize is never mid-gesture, and a fractional rest would let rounding flip the
    // active card on the next scroll event — so settle on the whole row unless the reader
    // is visibly between two cards.
    const keepDrift = !resized && Math.abs(drift) > 0.02 && Math.abs(drift) < 1;
    const top = Math.round((activeIndex + (keepDrift ? drift : 0)) * height);
    if (resized) virtualizer.measure();
    writeTop(top);
    // Clear the guard on the next frame, with a timeout backstop so a throttled/hidden
    // rAF can never leave `adjusting` stuck true (which would freeze onScroll and move()).
    const frame = requestAnimationFrame(() => {
      adjusting.current = false;
    });
    const backstop = setTimeout(() => {
      adjusting.current = false;
    }, 120);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(backstop);
      adjusting.current = false;
    };
  }, [entries, activeIndex, activeId, height, virtualizer, writeTop]);

  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const heightRef = useRef(height);
  heightRef.current = height;
  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;

  // A gesture's destination, held until the scroll comes to rest. See `flick`.
  const pending = useRef<number | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const settle = useCallback(() => {
    const element = viewport.current;
    const target = pending.current;
    pending.current = null;
    if (!element || target === null) return;
    const list = entriesRef.current;
    const index = Math.max(0, Math.min(list.length - 1, target));
    const top = index * heightRef.current;
    // Anything still short of the destination is finished here, once, now that nothing
    // else is moving the scroll — then the feed is handed back to native scrolling.
    const short = Math.round(element.scrollTop - top);
    feedLog("settle", { to: index, offBy: short });
    if (Math.abs(element.scrollTop - top) > 1) element.scrollTo({ top, behavior: "auto" });
    release(element);
  }, []);
  const armIdle = useCallback(() => {
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(settle, SCROLL_IDLE_MS);
  }, [settle]);
  useEffect(
    () => () => {
      clearTimeout(idleTimer.current);
    },
    [],
  );

  const onScroll = useCallback(() => {
    const element = viewport.current;
    if (!element) return;
    if (pending.current !== null) armIdle();
    if (adjusting.current) return;
    const top = element.scrollTop;
    if (Math.abs(top - lastTop.current) > 1)
      direction.current = top > lastTop.current ? "next" : "previous";
    lastTop.current = top;
    const list = entriesRef.current;
    const index = resolveActiveIndex(top / heightRef.current, activeIndexRef.current, list.length);
    const id = list[index]?.occurrenceId ?? null;
    if (id !== null) setActiveId(id);
  }, [armIdle]);

  /** Jump straight to a row. The one programmatic way the stream changes word. */
  const moveTo = useCallback((index: number, cause = "jump") => {
    const run = () => {
      const element = viewport.current;
      const list = entriesRef.current;
      if (!element || !list.length) return;
      const target = Math.max(0, Math.min(list.length - 1, index));
      direction.current = target < activeIndexRef.current ? "previous" : "next";
      feedLog("move", {
        cause,
        from: activeIndexRef.current,
        to: target,
        deferred: adjusting.current,
      });
      element.scrollTo({ top: target * heightRef.current, behavior: "auto" });
    };
    // Never stack an advance on top of an in-flight scroll rebase; defer one frame.
    if (adjusting.current) requestAnimationFrame(run);
    else run();
  }, []);
  const move = useCallback(
    (delta: number, cause = "step") => moveTo(activeIndexRef.current + delta, cause),
    [moveTo],
  );

  /**
   * Move on from one specific word. A card finishing its answer asks to advance past
   * ITSELF, not past "whatever is on screen": if the reader has already swiped on, the
   * late request must not push them one further.
   * @param occurrenceId The word that finished.
   */
  const advanceFrom = useCallback(
    (occurrenceId: string) => {
      const list = entriesRef.current;
      const index = list.findIndex((entry) => entry.occurrenceId === occurrenceId);
      if (index < 0 || index !== activeIndexRef.current) {
        // A word finished after the reader had already moved on: logged, not followed.
        feedLog("advance-skipped", { finished: index, onScreen: activeIndexRef.current });
        return;
      }
      moveTo(index + 1, "auto");
    },
    [moveTo],
  );

  /**
   * Finish a touch flick that began on row `from`.
   *
   * The browser scrolls and snaps the feed natively while the finger is down and after it
   * lifts. A flick handler that also called move(±1) at touchend was a second driver of the
   * same scroll: relative to a row the native drag might already have changed (so one swipe
   * went two words), and written an instant before the browser began its own snap animation
   * (so the stream jumped to the next word and was dragged back — a burst of backgrounds, and
   * a word marked seen that nobody saw). So the destination is fixed from where the gesture
   * STARTED, the feed glides there, and it is only enforced once the scroll has come to rest.
   * @param from Row that was on screen when the finger went down.
   * @param delta +1 for the next word, -1 for the previous.
   * @param smooth False to jump (reduced motion).
   */
  const flick = useCallback(
    (from: number, delta: number, smooth = true) => {
      const element = viewport.current;
      const list = entriesRef.current;
      if (!element || !list.length) return;
      const target = Math.max(0, Math.min(list.length - 1, from + delta));
      pending.current = target;
      direction.current = delta < 0 ? "previous" : "next";
      feedLog("move", {
        cause: "swipe",
        from,
        to: target,
        onScreen: activeIndexRef.current,
        glide: activeIndexRef.current !== target && smooth,
      });
      // The drag itself already carried the feed onto the destination: the browser's own
      // snap is gliding there, so leave it alone and only check the result at rest.
      if (activeIndexRef.current === target) {
        armIdle();
        return;
      }
      hold(element);
      element.scrollTo({ top: target * heightRef.current, behavior: smooth ? "smooth" : "auto" });
      armIdle();
    },
    [armIdle],
  );

  /**
   * A finger went down. If an earlier flick is still gliding, it is committed on the spot —
   * jumped to its destination — rather than abandoned: handing a half-finished glide back to
   * the browser makes it re-snap to the word the glide STARTED on, which is one more
   * needless change of word, and leaves the new gesture measuring from the wrong row.
   * @returns The row under the finger now, for the gesture that is starting.
   */
  const touchStarted = useCallback((): number => {
    clearTimeout(idleTimer.current);
    const element = viewport.current;
    if (!element) return activeIndexRef.current;
    if (pending.current !== null) {
      // A new touch landed while a swipe was still gliding: the glide is committed here.
      feedLog("touch-during-glide", { to: pending.current });
      settle();
    } else release(element);
    const count = entriesRef.current.length;
    return Math.max(0, Math.min(count - 1, Math.round(element.scrollTop / heightRef.current)));
  }, [settle]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (
      event.target instanceof HTMLElement &&
      event.target.closest("button, input, select, textarea, a")
    )
      return;
    if (["ArrowDown", "PageDown", "ArrowUp", "PageUp"].includes(event.key)) {
      event.preventDefault();
      move(event.key === "ArrowDown" || event.key === "PageDown" ? 1 : -1, "keyboard");
    }
  };
  return {
    viewport,
    height,
    activeIndex,
    direction,
    adjusting,
    virtualizer,
    onScroll,
    onKeyDown,
    move,
    advanceFrom,
    flick,
    touchStarted,
  };
}
