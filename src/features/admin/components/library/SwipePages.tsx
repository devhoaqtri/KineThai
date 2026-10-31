/**
 * Pages laid side by side and swiped horizontally, under the app's segmented progress bar.
 *
 * The swipe is the browser's own scroll snapping, so a trackpad or a finger just works; the
 * buttons, the bar and the arrow keys cover a mouse, and sit above the table so they stay
 * in reach of a 50-row page. Only the showing page and its neighbours are mounted, so a
 * folder of a hundred pages holds three tables at most and a swipe never lands on an empty
 * one.
 *
 * Exports: SwipePages
 * Depends on: React, lucide-react
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/** How long scrolling must rest before the swipe counts as landed on a page. */
const SETTLE_MS = 120;

/**
 * @param props.pageCount - how many pages there are
 * @param props.page - the page showing, from 0
 * @param props.onPage - a swipe or a control landed on another page
 * @param props.label - what the pages hold, for assistive tech
 * @param props.caption - the line beside the controls
 * @param props.renderPage - draw one page
 * @returns The swipeable pages and their controls
 */
export function SwipePages({
  pageCount,
  page,
  onPage,
  label,
  caption,
  renderPage,
}: {
  pageCount: number;
  page: number;
  onPage: (page: number) => void;
  label: string;
  caption: ReactNode;
  renderPage: (page: number) => ReactNode;
}): React.ReactElement {
  const strip = useRef<HTMLDivElement>(null);
  const settle = useRef<number | undefined>(undefined);
  // The page a control is sliding to. Until it arrives, resting partway is not a swipe.
  const heading = useRef<number | null>(null);
  const [near, setNear] = useState(page);

  const pageInView = () => {
    const element = strip.current;
    return element && element.clientWidth
      ? Math.round(element.scrollLeft / element.clientWidth)
      : 0;
  };

  // A deep link opens on its page with no slide across the ones before it.
  useLayoutEffect(() => {
    const element = strip.current;
    if (element) element.scrollLeft = page * element.clientWidth;
    // Only on arrival: after that the effect below follows `page`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const element = strip.current;
    if (element && pageInView() !== page) {
      heading.current = page;
      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      element.scrollTo({ left: page * element.clientWidth, behavior: still ? "auto" : "smooth" });
    }
  }, [page]);

  useEffect(() => () => window.clearTimeout(settle.current), []);

  const onScroll = useCallback(() => {
    setNear(pageInView());
    window.clearTimeout(settle.current);
    settle.current = window.setTimeout(() => {
      if (heading.current !== null && pageInView() !== heading.current) return;
      heading.current = null;
      onPage(pageInView());
    }, SETTLE_MS);
  }, [onPage]);

  // A hand on the strip takes over from any slide in progress.
  const takeOver = () => {
    heading.current = null;
  };

  const go = (next: number) => onPage(Math.min(pageCount - 1, Math.max(0, next)));

  return (
    <div className="space-y-3">
      {pageCount > 1 && (
        <div className="flex h-1.5 gap-0.5" aria-hidden="true">
          {Array.from({ length: pageCount }, (_, index) => (
            <button
              key={index}
              type="button"
              tabIndex={-1}
              className={`h-full min-w-0 flex-1 rounded-full ${
                index <= page ? "bg-foreground" : "bg-muted hover:bg-muted-foreground/40"
              }`}
              onClick={() => go(index)}
            />
          ))}
        </div>
      )}
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span className="tabular-nums">{caption}</span>
        {pageCount > 1 && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="rounded-md border border-border p-1.5 hover:bg-muted disabled:opacity-40"
              onClick={() => go(page - 1)}
              disabled={page === 0}
              aria-label="Previous page"
            >
              <ChevronLeft size={15} />
            </button>
            <span className="px-2 tabular-nums">
              Page {page + 1} of {pageCount}
            </span>
            <button
              type="button"
              className="rounded-md border border-border p-1.5 hover:bg-muted disabled:opacity-40"
              onClick={() => go(page + 1)}
              disabled={page >= pageCount - 1}
              aria-label="Next page"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        )}
      </div>

      <div
        ref={strip}
        className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="group"
        aria-label={label}
        tabIndex={0}
        onScroll={onScroll}
        onWheel={takeOver}
        onTouchStart={takeOver}
        onPointerDown={takeOver}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") go(page + 1);
          if (event.key === "ArrowLeft") go(page - 1);
        }}
      >
        {Array.from({ length: pageCount }, (_, index) => (
          <div key={index} className="w-full shrink-0 snap-start snap-always">
            {Math.abs(index - near) <= 1 || index === page ? renderPage(index) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
