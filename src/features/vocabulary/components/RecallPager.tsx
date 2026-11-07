/**
 * The memory sheet's word pages, swiped sideways, and the bar that shows where you are.
 *
 * The swipe is the browser's own scroll snapping, as in the word library's SwipePages, so
 * a finger gets native momentum and a trackpad just works. Unlike there every page stays
 * mounted: the sheet measures its rows to cut the pages, and its zoom animates the rows
 * of the page in view. The bar under the pages follows the strip's scroll position as it
 * moves, and a tap on any part of it goes to that page.
 *
 * A finished page moves on by itself, in one deliberate gesture on a single Web
 * Animations playhead: a beat in which a light runs down the page's timeline through
 * every answer, then a spring slide to the next page while its rows come in one after
 * another and the bar's thumb springs along in step. Only when it lands does the strip
 * scroll there for real, so the browser never sees a half-way scroll. A hand on the
 * strip during the beat calls the move off; later, it lands at once. Reduced motion
 * gets a short crossfade instead.
 *
 * Exports: RecallPager, RecallPagerHandle
 * Depends on: React, ../lib/recall-pages, ../lib/ui-copy, ../lib/useLocale
 */
import {
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type ReactNode,
  type Ref,
} from "react";
import { springEasing, type RecallPage, type RecallSlice } from "../lib/recall-pages";
import { t } from "../lib/ui-copy";
import { useLocale } from "../lib/useLocale";

/** The pause that acknowledges a finished page before it moves. */
const BEAT_MS = 420;
const SLIDE_MS = 660;
/** A tap on the bar goes straight there, with no beat. */
const JUMP_MS = 560;
const REDUCED_HOLD_MS = 240;
const REDUCED_FADE_MS = 140;
/** Rows of the incoming page start this share of the slide apart. */
const ROW_STAGGER = 0.045;
/** How far behind the page each incoming row starts. */
const ROW_SHIFT_PX = 28;
/** Space between the bar's segments, in px; matches .vocab-recall-dots's gap. */
const SEGMENT_GAP = 4;
const ENTER = "cubic-bezier(0.16, 1, 0.3, 1)";
const SPRING_EASING =
  typeof CSS !== "undefined" && CSS.supports?.("transition-timing-function", "linear(0, 1)")
    ? springEasing()
    : "cubic-bezier(0.3, 1.25, 0.4, 1)";

export type RecallPagerHandle = {
  /** The page in view is finished: acknowledge it and move to the next. */
  advance: () => void;
  /** Call off an advance still in its beat; one already sliding lands. */
  cancelAdvance: () => void;
  /** Go to a page; instantly, or with the same spring as an advance. */
  jump: (page: number, instant?: boolean) => void;
  /** Land any move in flight now, before something measures the sheet. */
  settle: () => void;
  /** The rows of the page in view, in order. */
  currentRows: () => HTMLElement[];
  /** The page bar, or null when there is one page. */
  indicator: () => HTMLElement | null;
};

type Move = { animations: Animation[]; to: number; beatMs: number; extras: HTMLElement[] };

/**
 * @param props.pages - The pages, as slices of the sheet's day groups
 * @param props.page - The page in view
 * @param props.onPage - The strip came to rest on another page, or passed the half-way
 * @param props.done - Which pages have every row answered
 * @param props.capacity - The height a page fills, in px
 * @param props.reducedMotion - Crossfade instead of sliding
 * @param props.renderSlice - Draw one day's run of rows on a page
 * @param props.handle - Imperative controls for the sheet
 */
export function RecallPager({
  pages,
  page,
  onPage,
  done,
  capacity,
  reducedMotion,
  renderSlice,
  handle,
}: {
  pages: RecallPage[];
  page: number;
  onPage: (page: number) => void;
  done: boolean[];
  capacity: number;
  reducedMotion: boolean;
  renderSlice: (slice: RecallSlice) => ReactNode;
  handle: Ref<RecallPagerHandle>;
}) {
  const ui = useLocale();
  const paged = pages.length > 1;
  const strip = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const dots = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLSpanElement>(null);
  const move = useRef<Move | null>(null);
  const live = useRef({ page, onPage, count: pages.length, reducedMotion });
  live.current = { page, onPage, count: pages.length, reducedMotion };

  const pitch = () => {
    const width = dots.current?.clientWidth ?? 0;
    return (width + SEGMENT_GAP) / Math.max(1, live.current.count);
  };
  const placeThumb = useCallback((progress: number) => {
    if (thumb.current) thumb.current.style.transform = `translateX(${progress * pitch()}px)`;
  }, []);
  const pageElement = (index: number) =>
    track.current?.children.item(index) as HTMLElement | null | undefined;

  const land = useCallback(() => {
    const current = move.current;
    const element = strip.current;
    if (!current) return;
    move.current = null;
    // Transforms off first: scroll snapping reads the moved pages, so a scroll set under
    // them would snap to the page beside the one meant, and re-snap a page further on.
    for (const animation of current.animations) animation.cancel();
    for (const extra of current.extras) extra.remove();
    if (element) {
      element.scrollLeft = current.to * element.clientWidth;
      // Snapping back on only once the strip stands exactly on a page.
      element.style.scrollSnapType = "";
    }
    placeThumb(current.to);
    live.current.onPage(current.to);
  }, [placeThumb]);

  const abandon = useCallback(() => {
    const current = move.current;
    if (!current) return;
    move.current = null;
    for (const animation of current.animations) animation.cancel();
    for (const extra of current.extras) extra.remove();
    if (strip.current) strip.current.style.scrollSnapType = "";
  }, []);

  /** A light runs down each rail of the finished page, and every node it passes lifts. */
  const beatParts = (
    outgoing: HTMLElement,
    beatShare: number,
    timing: KeyframeAnimationOptions,
  ) => {
    const animations: Animation[] = [];
    const extras: HTMLElement[] = [];
    const frame = outgoing.getBoundingClientRect();
    const sweepEnd = beatShare * 0.78;
    for (const rail of outgoing.querySelectorAll<HTMLElement>(".vocab-recall-rail")) {
      const nodes = [...rail.querySelectorAll<HTMLElement>(".vocab-recall-node")];
      const first = nodes[0]?.getBoundingClientRect();
      const last = nodes.at(-1)?.getBoundingClientRect();
      if (!first || !last) continue;
      const sweep = document.createElement("span");
      sweep.className = "vocab-recall-sweep";
      sweep.setAttribute("aria-hidden", "true");
      sweep.style.left = `${first.left + first.width / 2 - frame.left}px`;
      sweep.style.top = `${first.top + first.height / 2 - frame.top}px`;
      sweep.style.height = `${Math.max(1, last.top - first.top)}px`;
      outgoing.append(sweep);
      extras.push(sweep);
      animations.push(
        sweep.animate(
          [
            {
              transform: "scaleY(0)",
              opacity: 1,
              offset: 0,
              easing: "cubic-bezier(0.5, 0, 0.3, 1)",
            },
            { transform: "scaleY(1)", opacity: 1, offset: sweepEnd },
            { transform: "scaleY(1)", opacity: 0, offset: Math.min(1, beatShare + 0.12) },
            { transform: "scaleY(1)", opacity: 0, offset: 1 },
          ],
          timing,
        ),
      );
      nodes.forEach((node, index) => {
        const at = (nodes.length > 1 ? index / (nodes.length - 1) : 1) * sweepEnd;
        animations.push(
          node.animate(
            [
              { transform: "scale(1)", offset: 0 },
              { transform: "scale(1)", offset: at, easing: "cubic-bezier(0.3, 0, 0.2, 1)" },
              { transform: "scale(1.32)", offset: Math.min(1, at + 0.05) },
              { transform: "scale(1)", offset: Math.min(1, at + 0.16) },
              { transform: "scale(1)", offset: 1 },
            ],
            // Added on top of the node's own ignite, which may still be running.
            { ...timing, composite: "add" },
          ),
        );
      });
    }
    return { animations, extras };
  };

  const go = useCallback(
    (to: number, beat: boolean) => {
      const element = strip.current;
      const lane = track.current;
      const from = live.current.page;
      if (!element || !lane || move.current) return;
      if (to < 0 || to >= live.current.count || to === from) return;
      const width = element.clientWidth;
      // No snapping while the pages move under transforms. Once the strip has snapped
      // to a page, the browser follows that page wherever a transform takes it and
      // scrolls back under the slide, so it lands in one flash instead of sliding.
      element.style.scrollSnapType = "none";

      if (live.current.reducedMotion) {
        const fade = element.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: REDUCED_FADE_MS,
          delay: beat ? REDUCED_HOLD_MS : 0,
          easing: "ease",
          fill: "forwards",
        });
        move.current = { animations: [fade], to, beatMs: beat ? REDUCED_HOLD_MS : 0, extras: [] };
        void fade.finished
          .then(() => {
            if (move.current?.animations[0] !== fade) return;
            element.animate([{ opacity: 0 }, { opacity: 1 }], {
              duration: REDUCED_FADE_MS,
              easing: "ease",
            });
            land();
          })
          .catch(() => {
            // Called off or landed early.
          });
        return;
      }

      const beatMs = beat ? BEAT_MS : 0;
      const total = beatMs + (beat ? SLIDE_MS : JUMP_MS);
      const start = beatMs / total;
      // One clock: every part runs for the whole move and keys its own stretch of it.
      const timing: KeyframeAnimationOptions = {
        duration: total,
        easing: "linear",
        fill: "forwards",
      };
      const step = pitch();
      const animations: Animation[] = [
        lane.animate(
          [
            { transform: "translateX(0px)", offset: 0 },
            { transform: "translateX(0px)", offset: start, easing: SPRING_EASING },
            { transform: `translateX(${(from - to) * width}px)`, offset: 1 },
          ],
          timing,
        ),
      ];
      if (thumb.current) {
        animations.push(
          thumb.current.animate(
            [
              { transform: `translateX(${from * step}px)`, offset: 0 },
              { transform: `translateX(${from * step}px)`, offset: start, easing: SPRING_EASING },
              { transform: `translateX(${to * step}px)`, offset: 1 },
            ],
            timing,
          ),
        );
      }
      const extras: HTMLElement[] = [];
      const outgoing = pageElement(from);
      if (outgoing) {
        animations.push(
          outgoing.animate(
            [
              { opacity: 1, offset: 0 },
              { opacity: 1, offset: start, easing: "cubic-bezier(0.4, 0, 0.6, 1)" },
              { opacity: 0.15, offset: start + (1 - start) * 0.55 },
              { opacity: 0.15, offset: 1 },
            ],
            timing,
          ),
        );
        if (beat) {
          const parts = beatParts(outgoing, start, timing);
          animations.push(...parts.animations);
          extras.push(...parts.extras);
        }
      }
      const incoming = pageElement(to);
      const rows = incoming ? [...incoming.querySelectorAll<HTMLElement>(".vocab-recall-row")] : [];
      const sign = to > from ? 1 : -1;
      rows.forEach((row, index) => {
        const enter = Math.min(
          0.9,
          start + (0.06 + Math.min(index, 7) * ROW_STAGGER) * (1 - start),
        );
        animations.push(
          row.animate(
            [
              { opacity: 0, transform: `translateX(${sign * ROW_SHIFT_PX}px)`, offset: 0 },
              {
                opacity: 0,
                transform: `translateX(${sign * ROW_SHIFT_PX}px)`,
                offset: enter,
                easing: ENTER,
              },
              { opacity: 1, transform: "none", offset: Math.min(1, enter + 0.5 * (1 - start)) },
              { opacity: 1, transform: "none", offset: 1 },
            ],
            timing,
          ),
        );
      });
      const current: Move = { animations, to, beatMs, extras };
      move.current = current;
      void Promise.all(animations.map((animation) => animation.finished))
        .then(() => {
          if (move.current === current) land();
        })
        .catch(() => {
          // Called off, or landed early by a hand on the strip.
        });
    },
    [land],
  );

  /** A hand on the strip: during the beat it calls the move off, after it the move lands. */
  const takeOver = useCallback(() => {
    const current = move.current;
    if (!current) return;
    const at = Number(current.animations[0]?.currentTime ?? 0);
    if (at < current.beatMs) abandon();
    else land();
  }, [abandon, land]);

  useImperativeHandle(
    handle,
    () => ({
      advance: () => go(live.current.page + 1, true),
      cancelAdvance: () => {
        const current = move.current;
        if (current && Number(current.animations[0]?.currentTime ?? 0) < current.beatMs) abandon();
      },
      jump: (to, instant) => {
        if (!instant) return go(to, false);
        land();
        const element = strip.current;
        if (element) element.scrollLeft = to * element.clientWidth;
        placeThumb(to);
      },
      settle: land,
      currentRows: () => [
        ...(pageElement(live.current.page)?.querySelectorAll<HTMLElement>(".vocab-recall-row") ??
          []),
      ],
      indicator: () => bar.current,
    }),
    [abandon, go, land, placeThumb],
  );

  // A new layout or a new width: stand on the page in view, whole.
  useLayoutEffect(() => {
    const element = strip.current;
    if (!element || !paged) return;
    element.scrollLeft = live.current.page * element.clientWidth;
    placeThumb(live.current.page);
  }, [paged, pages, capacity, placeThumb]);

  useLayoutEffect(() => () => abandon(), [abandon]);

  const onScroll = () => {
    const element = strip.current;
    if (!element?.clientWidth || move.current) return;
    const progress = element.scrollLeft / element.clientWidth;
    placeThumb(progress);
    const near = Math.min(live.current.count - 1, Math.max(0, Math.round(progress)));
    if (near !== live.current.page) live.current.onPage(near);
  };

  return (
    <div className="vocab-recall-pages" data-paged={paged || undefined}>
      <div
        ref={strip}
        className="vocab-recall-pages-strip"
        onScroll={paged ? onScroll : undefined}
        onTouchStart={takeOver}
        onPointerDown={takeOver}
        onWheel={takeOver}
        onKeyDown={(event) => {
          if (!paged) return;
          if (event.key === "ArrowRight") go(page + 1, false);
          if (event.key === "ArrowLeft") go(page - 1, false);
        }}
      >
        <div ref={track} className="vocab-recall-track">
          {pages.map((slices, index) => (
            <div
              key={index}
              className="vocab-recall-page"
              data-current={(paged && index === page) || undefined}
              style={paged ? { minHeight: capacity } : undefined}
              role={paged ? "group" : undefined}
              aria-roledescription={paged ? t(ui, "recall.pageRole") : undefined}
              aria-label={
                paged ? t(ui, "recall.pageOf", { page: index + 1, total: pages.length }) : undefined
              }
            >
              {slices.map(renderSlice)}
            </div>
          ))}
        </div>
      </div>
      {paged && (
        <div ref={bar} className="vocab-recall-pager">
          <div
            ref={dots}
            className="vocab-recall-dots"
            role="group"
            aria-label={t(ui, "recall.selectPage")}
            style={{ "--pages": pages.length } as React.CSSProperties}
          >
            {pages.map((_, index) => (
              <button
                key={index}
                type="button"
                data-done={done[index] || undefined}
                aria-current={index === page ? "page" : undefined}
                aria-label={
                  done[index]
                    ? t(ui, "recall.pageDoneAria", { page: index + 1 })
                    : t(ui, "recall.pageButtonAria", { page: index + 1 })
                }
                onClick={() => go(index, false)}
              >
                <i />
              </button>
            ))}
            <span ref={thumb} className="vocab-recall-thumb" aria-hidden="true" />
          </div>
          <span className="vocab-recall-pageno" aria-hidden="true">
            {page + 1}/{pages.length}
          </span>
        </div>
      )}
    </div>
  );
}
