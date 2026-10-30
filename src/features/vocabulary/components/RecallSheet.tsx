/**
 * The memory cell, expanded: the words behind one count, and nothing else.
 *
 * Ten words to a page. Further pages sit beside it and are swiped in; the page
 * never grows a scrollbar for the eleventh word. Each row is the headword alone —
 * no gloss, no level — with a check and a cross. Only a check counts as still
 * remembering; the question above keeps the tally.
 *
 * Exports: RecallSheet, RECALL_PAGE_SIZE
 * Depends on: recall-marks, lucide-react
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, ChevronLeft, X } from "lucide-react";
import { loadRecallMarks, saveRecallMarks, type RecallChoice } from "../lib/recall-marks";
import type { HistoryWindow } from "../lib/history";

export const RECALL_PAGE_SIZE = 10;

/** Where the cell's own label and count sit, so the heading can travel from them. */
export type RecallFrom = {
  label: { left: number; top: number; width: number; height: number };
  count: { left: number; top: number; width: number; height: number };
};

const TITLES: Record<HistoryWindow, string> = {
  yesterday: "Hôm qua",
  today: "Hôm nay",
  week: "Tuần này",
};

export function RecallSheet({
  window,
  words,
  from,
  closing,
  reducedMotion,
  onClose,
}: {
  window: HistoryWindow;
  /** Headword per history id, newest first. */
  words: { id: string; label: string }[];
  /** The tapped cell's label and count, in viewport coordinates. */
  from: RecallFrom | null;
  closing: boolean;
  reducedMotion: boolean;
  onClose: () => void;
}) {
  const back = useRef<HTMLButtonElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const ghostName = useRef<HTMLElement>(null);
  const ghostTally = useRef<HTMLElement>(null);
  const fly = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const [marks, setMarks] = useState(() => loadRecallMarks());
  const pages: { id: string; label: string }[][] = [];
  for (let index = 0; index < words.length; index += RECALL_PAGE_SIZE) {
    pages.push(words.slice(index, index + RECALL_PAGE_SIZE));
  }
  const pageCount = pages.length;

  useEffect(() => {
    if (!closing) back.current?.focus();
  }, [closing]);

  // The heading starts on the cell's own text. A transition then moves it and
  // scales it to the seat the hidden copy is holding. The word rows are not
  // part of that trip; they fade in as the cell fills.
  useLayoutEffect(() => {
    const root = sheet.current;
    const layer = fly.current;
    const panel = root?.parentElement;
    if (!root || !layer || !panel || !from || !ghostName.current || !ghostTally.current) return;
    const border = Number.parseFloat(getComputedStyle(panel).borderTopWidth) || 0;
    const origin = panel.getBoundingClientRect();
    const frame = root.getBoundingClientRect();
    const point = (left: number, top: number) => ({ x: `${left}px`, y: `${top}px` });
    const shift = (box: RecallFrom["label"]) =>
      point(box.left - origin.left - border, box.top - origin.top - border);
    const seatOf = (ghost: HTMLElement) => {
      const g = ghost.getBoundingClientRect();
      return point(g.left - frame.left, g.top - frame.top);
    };
    const fromName = shift(from.label);
    const fromCount = shift(from.count);
    const seatName = seatOf(ghostName.current);
    const seatCount = seatOf(ghostTally.current);
    layer.style.setProperty("--from-name-x", fromName.x);
    layer.style.setProperty("--from-name-y", fromName.y);
    layer.style.setProperty("--from-count-x", fromCount.x);
    layer.style.setProperty("--from-count-y", fromCount.y);
    layer.style.setProperty("--seat-name-x", seatName.x);
    layer.style.setProperty("--seat-name-y", seatName.y);
    layer.style.setProperty("--seat-count-x", seatCount.x);
    layer.style.setProperty("--seat-count-y", seatCount.y);
    if (reducedMotion) {
      layer.setAttribute("data-placed", "");
      return;
    }
    const id = requestAnimationFrame(() => layer.setAttribute("data-placed", ""));
    return () => cancelAnimationFrame(id);
  }, [from, reducedMotion]);

  useEffect(() => {
    if (closing) fly.current?.removeAttribute("data-placed");
  }, [closing]);

  const choose = (id: string, choice: RecallChoice) => {
    setMarks((current) => {
      const next = { ...current };
      // The same button again clears it. A check and a cross cannot both stand.
      if (next[id] === choice) delete next[id];
      else next[id] = choice;
      saveRecallMarks(next);
      return next;
    });
  };
  const remembered = words.filter((word) => marks[word.id] === "yes").length;

  const showPage = (index: number) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({
      left: index * el.clientWidth,
      behavior: reducedMotion ? "auto" : "smooth",
    });
  };

  const onScroll = () => {
    const el = scroller.current;
    if (!el || el.clientWidth === 0) return;
    const next = Math.round(el.scrollLeft / el.clientWidth);
    setPage((current) => (current === next ? current : next));
  };

  const countLabel =
    words.length === 0 ? "Chưa có từ" : words.length === 1 ? "1 từ" : `${words.length} từ`;

  return (
    <>
      <div
        ref={sheet}
        className="vocab-recall"
        data-window={window}
        data-closing={closing || undefined}
        role="region"
        aria-label={`${TITLES[window]}, ${countLabel}`}
      >
        <div className="vocab-recall-fit">
          <header className="vocab-recall-head">
            <button
              ref={back}
              type="button"
              className="vocab-recall-back"
              onClick={onClose}
              aria-label="Thu lại"
            >
              <ChevronLeft size={18} />
            </button>
            {/* Holds the heading's final place. The visible copy travels separately. */}
            <div className="vocab-recall-title" aria-hidden="true">
              <strong ref={ghostName}>{TITLES[window]}</strong>
              <small ref={ghostTally}>
                <span>{words.length}</span>
                <span> từ</span>
              </small>
            </div>
          </header>
          {words.length > 0 && (
            <p className="vocab-recall-ask">
              <span>Bạn còn nhớ nghĩa chứ?</span>
              <span key={remembered} className="vocab-recall-score">
                {remembered}/{words.length}
              </span>
            </p>
          )}
          {words.length === 0 ? (
            <p className="vocab-recall-empty">Chưa xem từ nào trong khoảng này.</p>
          ) : (
            <div
              className="vocab-recall-pages"
              ref={scroller}
              onScroll={onScroll}
              aria-label="Các trang từ"
            >
              {pages.map((slice, pageIndex) => (
                <ol key={pageIndex} className="vocab-recall-page">
                  {slice.map((word) => {
                    const choice = marks[word.id];
                    return (
                      <li key={word.id} className="vocab-recall-row">
                        <span className="vocab-recall-word">{word.label}</span>
                        <div className="vocab-recall-choice" role="group" aria-label={word.label}>
                          <button
                            type="button"
                            data-kind="yes"
                            data-on={choice === "yes" || undefined}
                            aria-pressed={choice === "yes"}
                            aria-label={`${word.label}: còn nhớ`}
                            onClick={() => choose(word.id, "yes")}
                          >
                            <Check size={16} strokeWidth={2.75} />
                          </button>
                          <button
                            type="button"
                            data-kind="no"
                            data-on={choice === "no" || undefined}
                            aria-pressed={choice === "no"}
                            aria-label={`${word.label}: không nhớ`}
                            onClick={() => choose(word.id, "no")}
                          >
                            <X size={15} strokeWidth={2.75} />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              ))}
            </div>
          )}
          {pageCount > 1 && (
            <div className="vocab-recall-pager">
              {pageCount <= 8 &&
                pages.map((_, index) => (
                  <button
                    key={index}
                    type="button"
                    data-on={index === page || undefined}
                    aria-label={`Trang ${index + 1}`}
                    aria-current={index === page || undefined}
                    onClick={() => showPage(index)}
                  />
                ))}
              <span className="vocab-recall-fraction">
                {page + 1} / {pageCount}
              </span>
            </div>
          )}
        </div>
      </div>
      {from && (
        <div ref={fly} className="vocab-recall-fly" data-closing={closing || undefined}>
          <strong>{TITLES[window]}</strong>
          <small>
            <span>{words.length}</span>
            <span className="vocab-recall-tally-unit"> từ</span>
          </small>
        </div>
      )}
    </>
  );
}
