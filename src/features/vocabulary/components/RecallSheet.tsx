/**
 * The memory sheet: a memory cell, zoomed all the way in.
 *
 * One history, seen at any distance. The cell's number becomes the headline, the week's
 * rhythm sits under it and picks any of the last seven days, and below runs the timeline
 * of the words themselves.
 *
 * It is built for honest recall. A word's meaning stays redacted until the reader has
 * tried it, then opens with the example and the two answers (recall.yes, recall.no). The
 * answer is the timeline's own node, lit on the rail, and the row keeps its meaning from
 * then on, so a finished day reads as a glossary. Marking never opens the next word,
 * which would show its meaning before it could be tried. A sideways swipe answers
 * without opening. A pull down from the top folds the sheet back into its cell, with
 * the finger on the zoom's own playhead (../hooks/useRecallZoom).
 *
 * Exports: RecallSheet
 * Depends on: @radix-ui/react-dialog, framer-motion, lucide-react, ../hooks/useRecallZoom,
 *   ../lib/hanzi, ../lib/history, ../lib/i18n, ../lib/recall-marks, ../lib/recall-words,
 *   ../lib/ui-copy, ../lib/useLocale, ./MarkedText
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useMotionValue, useTransform, type PanInfo } from "framer-motion";
import { Check, ChevronLeft, X } from "lucide-react";
import { SPRING } from "@/lib/motion";
import { useRecallZoom, type ZoomCell } from "../hooks/useRecallZoom";
import { previousDay, startOfDay } from "../lib/day";
import { isHanAnswer } from "../lib/hanzi";
import {
  historyDays,
  historyEntries,
  type HistoryDay,
  type HistoryEntry,
  type HistoryScope,
  type ViewHistory,
} from "../lib/history";
import { posLabel } from "../lib/i18n";
import type { Locale } from "../lib/locale";
import { saveRecallMarks, type RecallChoice, type RecallMarks } from "../lib/recall-marks";
import {
  loadRecallWords,
  recallFallbackLabel,
  recallMeaning,
  type RecallWord,
} from "../lib/recall-words";
import { t } from "../lib/ui-copy";
import { useLocale } from "../lib/useLocale";
import { FilledUsage, MarkedText } from "./MarkedText";

/** How far a row has to travel sideways before it counts as an answer. */
const SWIPE_PX = 72;
/** A pull past this share of the screen closes on release. */
const DISMISS_SHARE = 0.16;
/** Upper bound on rows that rise in with the zoom; the rest are below the fold. */
const ENTRANCE_ROWS = 7;
/** Bars never vanish: a day with one word still reads as a day with a word. */
const MIN_BAR_SHARE = 0.08;

function dayName(start: number, now: number, ui: Locale): string {
  const today = startOfDay(now);
  if (start === today) return t(ui, "memory.cell.today");
  if (start === previousDay(today)) return t(ui, "memory.cell.yesterday");
  return new Intl.DateTimeFormat(ui, { weekday: "long", month: "numeric", day: "numeric" }).format(
    start,
  );
}

function scopeName(scope: HistoryScope, now: number, ui: Locale): string {
  return scope === "week" ? t(ui, "memory.cell.week") : dayName(scope, now, ui);
}

function clock(at: number): string {
  const date = new Date(at);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function tallyOf(ids: string[], marks: RecallMarks) {
  const yes = ids.filter((id) => marks[id] === "yes").length;
  const no = ids.filter((id) => marks[id] === "no").length;
  return { yes, no, open: ids.length - yes - no, total: ids.length };
}

function tallyLine({ yes, no, open, total }: ReturnType<typeof tallyOf>, ui: Locale): string {
  if (total === 0) return "";
  if (open === total) return t(ui, "recall.tally.start");
  if (open > 0) return t(ui, "recall.tally.left", { n: open });
  if (no === 0)
    return total === 1 ? t(ui, "recall.tally.one") : t(ui, "recall.tally.all", { n: total });
  return t(ui, "recall.tally.some", { yes, total, no });
}

/** The three-part meter: remembered, forgotten, not tried. A part with nothing in it is left out, so it leaves no gap. */
function MeterParts({ yes, no, open }: { yes: number; no: number; open: number }) {
  return (
    <>
      {yes > 0 && <i data-kind="yes" style={{ flexGrow: yes }} />}
      {no > 0 && <i data-kind="no" style={{ flexGrow: no }} />}
      {open > 0 && <i style={{ flexGrow: open }} />}
    </>
  );
}

/**
 * The meaning's shape, not its letters: one bar per word of it. No text reaches the page,
 * so nothing can be read through a blur or by a screen reader before the reader has tried.
 */
function Redacted({ text }: { text: string }) {
  const words = text.split(/\s+/u).filter(Boolean).slice(0, 5);
  return (
    <span className="vocab-recall-redacted" aria-hidden="true">
      {words.map((word, index) => (
        <i key={index} style={{ width: `${Math.min(2 + word.length * 0.52, 6.5)}em` }} />
      ))}
    </span>
  );
}

function Row({
  entry,
  copy,
  mark,
  open,
  ui,
  weekViews,
  onToggle,
  onMark,
}: {
  entry: HistoryEntry;
  copy: RecallWord | undefined;
  mark: RecallChoice | undefined;
  open: boolean;
  ui: Locale;
  weekViews: number;
  onToggle: () => void;
  onMark: (choice: RecallChoice, toggle: boolean) => void;
}) {
  const label = copy?.word ?? recallFallbackLabel(entry.id);
  // Headwords are in the answer language, which is not the deck's: the ja deck teaches English.
  const lang = isHanAnswer(label) ? "zh" : "en";
  const meaning = copy ? recallMeaning(copy, ui) : "";
  const row = useRef<HTMLLIElement>(null);
  const dragged = useRef(false);
  const [dragging, setDragging] = useState(false);
  const x = useMotionValue(0);
  const yesCue = useTransform(x, [12, SWIPE_PX], [0, 1]);
  const noCue = useTransform(x, [-SWIPE_PX, -12], [1, 0]);
  const revealed = open || !!mark;

  const settle = (_event: unknown, info: PanInfo) => {
    setDragging(false);
    if (info.offset.x >= SWIPE_PX) onMark("yes", false);
    else if (info.offset.x <= -SWIPE_PX) onMark("no", false);
  };
  // Bring an opened row's answers into view. Only the sheet's own scroller moves.
  const reveal = () => {
    const node = row.current;
    const scroller = node?.closest<HTMLElement>(".vocab-recall-scroll");
    if (!node || !scroller) return;
    const overflow = node.getBoundingClientRect().bottom - scroller.getBoundingClientRect().bottom;
    if (overflow > 0) scroller.scrollBy({ top: overflow + 16, behavior: "smooth" });
  };

  return (
    <li ref={row} className="vocab-recall-row" data-mark={mark} data-open={open || undefined}>
      <div className="vocab-recall-cues" aria-hidden="true">
        <motion.span data-kind="yes" style={{ opacity: yesCue }}>
          <Check size={18} strokeWidth={2.75} /> {t(ui, "recall.yes")}
        </motion.span>
        <motion.span data-kind="no" style={{ opacity: noCue }}>
          {t(ui, "recall.no")} <X size={18} strokeWidth={2.75} />
        </motion.span>
      </div>
      <motion.div
        className="vocab-recall-item"
        data-dragging={dragging || undefined}
        style={{ x }}
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.55}
        dragSnapToOrigin
        dragTransition={{ bounceStiffness: 520, bounceDamping: 38 }}
        onDragStart={() => {
          dragged.current = true;
          setDragging(true);
        }}
        onDragEnd={settle}
      >
        <button
          type="button"
          className="vocab-recall-toggle"
          aria-expanded={open}
          aria-label={revealed ? label : t(ui, "recall.unseenAria", { word: label })}
          onClick={() => {
            // The pointer-up that ends a swipe still lands here as a click.
            if (dragged.current) {
              dragged.current = false;
              return;
            }
            onToggle();
          }}
        >
          <span className="vocab-recall-node" aria-hidden="true">
            {mark === "yes" && <Check size={9} strokeWidth={4} />}
            {mark === "no" && <X size={9} strokeWidth={4} />}
          </span>
          <span className="vocab-recall-main">
            <span className="vocab-recall-word" lang={lang}>
              {label}
            </span>
            {copy &&
              (revealed ? (
                <span className="vocab-recall-meaning" lang={ui}>
                  <MarkedText text={meaning} />
                </span>
              ) : (
                <Redacted text={meaning} />
              ))}
          </span>
          <span className="vocab-recall-meta">
            {entry.views > 1 && <span className="vocab-recall-views">×{entry.views}</span>}
            <time dateTime={new Date(entry.at).toISOString()}>{clock(entry.at)}</time>
          </span>
        </button>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              className="vocab-recall-detail"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ height: SPRING.gentle, opacity: { duration: 0.2 } }}
              onAnimationComplete={() => open && reveal()}
            >
              <div className="vocab-recall-detail-inner">
                {(copy?.ipa || copy?.pos || weekViews > 1) && (
                  <p className="vocab-recall-facts">
                    {[
                      copy?.ipa,
                      copy?.pos && posLabel(copy.pos, ui),
                      weekViews > 1 && t(ui, "recall.weekViews", { n: weekViews }),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
                {copy?.example && (
                  <p className="vocab-recall-example" lang={lang}>
                    <FilledUsage text={copy.example} word={copy.word} />
                  </p>
                )}
                {!copy && (
                  <p className="vocab-recall-facts" lang={ui}>
                    {t(ui, "recall.noCopy")}
                  </p>
                )}
                <div className="vocab-recall-answers" role="group" aria-label={label}>
                  <button
                    type="button"
                    data-kind="no"
                    data-on={mark === "no" || undefined}
                    aria-pressed={mark === "no"}
                    onClick={() => onMark("no", true)}
                  >
                    <X size={16} strokeWidth={2.75} /> {t(ui, "recall.no")}
                  </button>
                  <button
                    type="button"
                    data-kind="yes"
                    data-on={mark === "yes" || undefined}
                    aria-pressed={mark === "yes"}
                    onClick={() => onMark("yes", true)}
                  >
                    <Check size={16} strokeWidth={2.75} /> {t(ui, "recall.yes")}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </li>
  );
}

/** The week at a glance, and the way to any day of it. */
function RhythmStrip({
  days,
  scope,
  marks,
  now,
  ui,
  weekCount,
  onScope,
}: {
  days: HistoryDay[];
  scope: HistoryScope;
  marks: RecallMarks;
  now: number;
  ui: Locale;
  weekCount: number;
  onScope: (scope: HistoryScope) => void;
}) {
  const peak = Math.max(1, ...days.map((day) => day.ids.length));
  const today = startOfDay(now);
  return (
    <div className="vocab-recall-strip" role="group" aria-label={t(ui, "recall.stripAria")}>
      <button
        type="button"
        className="vocab-recall-week"
        data-on={scope === "week" || undefined}
        aria-pressed={scope === "week"}
        aria-label={t(ui, "recall.scopeAria", { label: t(ui, "memory.cell.week"), n: weekCount })}
        onClick={() => onScope("week")}
      >
        <strong>{weekCount}</strong>
        <small>{t(ui, "recall.sevenDays")}</small>
      </button>
      {days.map((day) => {
        const tally = tallyOf(day.ids, marks);
        const name = dayName(day.start, now, ui);
        const short =
          day.start === today
            ? t(ui, "recall.todayShort")
            : new Intl.DateTimeFormat(ui, { weekday: "narrow" }).format(day.start);
        return (
          <button
            key={day.start}
            type="button"
            className="vocab-recall-day"
            data-on={scope === day.start || undefined}
            data-dim={scope !== "week" && scope !== day.start ? "" : undefined}
            data-empty={tally.total === 0 || undefined}
            aria-pressed={scope === day.start}
            aria-label={t(ui, "recall.scopeAria", { label: name, n: tally.total })}
            onClick={() => onScope(day.start)}
          >
            <span className="vocab-recall-bar">
              <span
                className="vocab-recall-fill"
                style={{
                  height: `${tally.total ? Math.max(MIN_BAR_SHARE, tally.total / peak) * 100 : 0}%`,
                }}
              >
                <MeterParts {...tally} />
              </span>
            </span>
            <small>{short}</small>
          </button>
        );
      })}
    </div>
  );
}

/**
 * @param props.history - The reader's on-device viewing history
 * @param props.initialScope - The scope of the cell that was tapped
 * @param props.marks - Answers so far, owned by the settings sheet for its cells
 * @param props.onMarks - The answers changed
 * @param props.container - The themed element to portal into
 * @param props.scene - The settings content the zoom pushes past the camera
 * @param props.cellFor - The memory cell that shows a scope, or null for any other day
 * @param props.fallbackCell - The cell to fold into from a day no cell shows
 * @param props.returnFocus - Put focus back on the cell that was tapped
 * @param props.reducedMotion - Crossfade instead of zooming
 * @param props.onClosed - The sheet has folded away; unmount it
 */
export function RecallSheet({
  history,
  initialScope,
  now,
  marks,
  onMarks,
  container,
  scene,
  cellFor,
  fallbackCell,
  returnFocus,
  reducedMotion,
  onClosed,
}: {
  history: ViewHistory;
  initialScope: HistoryScope;
  now: number;
  marks: RecallMarks;
  onMarks: (marks: RecallMarks) => void;
  container: HTMLElement | null;
  scene: HTMLElement | null;
  cellFor: (scope: HistoryScope) => ZoomCell | null;
  fallbackCell: () => ZoomCell | null;
  returnFocus: () => void;
  reducedMotion: boolean;
  onClosed: () => void;
}) {
  const ui = useLocale();
  const [scope, setScope] = useState(initialScope);
  const [openId, setOpenId] = useState<string | null>(null);
  const [onlyForgotten, setOnlyForgotten] = useState(false);
  const [compact, setCompact] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [copies] = useState(loadRecallWords);

  const back = useRef<HTMLButtonElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const wash = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const count = useRef<HTMLElement>(null);
  const name = useRef<HTMLSpanElement>(null);
  const unit = useRef<HTMLSpanElement>(null);
  const tally = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const hero = useRef<HTMLDivElement>(null);
  const scopeRef = useRef(scope);
  scopeRef.current = scope;

  const days = useMemo(() => historyDays(history, now), [history, now]);
  const week = useMemo(() => historyEntries(history, "week", now), [history, now]);
  const entries = useMemo(() => historyEntries(history, scope, now), [history, scope, now]);
  const ids = useMemo(() => entries.map((entry) => entry.id), [entries]);
  const score = tallyOf(ids, marks);
  const forgotten = onlyForgotten && score.no > 0;
  const shown = forgotten ? entries.filter((entry) => marks[entry.id] === "no") : entries;
  const groups = useMemo(() => {
    if (scope !== "week") return [{ start: scope, rows: shown }];
    const byDay = new Map<number, HistoryEntry[]>();
    for (const entry of shown) {
      const start = startOfDay(entry.at);
      byDay.set(start, [...(byDay.get(start) ?? []), entry]);
    }
    return [...byDay].map(([start, rows]) => ({ start, rows }));
  }, [scope, shown]);

  const zoom = useRecallZoom({
    parts: () => {
      const required = [stage, backdrop, wash, count, name].map((ref) => ref.current);
      if (required.some((node) => !node)) return null;
      const rows = list.current?.querySelectorAll<HTMLElement>(".vocab-recall-row") ?? [];
      return {
        stage: stage.current!,
        backdrop: backdrop.current!,
        wash: wash.current!,
        count: count.current!,
        name: name.current!,
        fades: [
          bar.current,
          unit.current,
          tally.current,
          strip.current,
          ...[...rows].slice(0, ENTRANCE_ROWS),
        ].filter((node): node is HTMLElement => !!node),
        scene,
      };
    },
    cell: () => {
      const exact = cellFor(scopeRef.current);
      const target = exact ?? fallbackCell();
      if (!target) return null;
      // A scrolled-away headline has nothing to fly; it would cross the whole screen.
      const atTop = (scroller.current?.scrollTop ?? 0) < 40;
      return { target, flies: !!exact && atTop };
    },
    reducedMotion,
    onClosed,
  });

  // Marks outlive nothing: an answer goes when its word leaves the week.
  useEffect(() => {
    const kept = Object.entries(marks).filter(([id]) => id in history);
    if (kept.length === Object.keys(marks).length) return;
    const next = Object.fromEntries(kept);
    saveRecallMarks(next);
    onMarks(next);
    // Once, on opening; answers given here always belong to words in the history.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const target = hero.current;
    const root = scroller.current;
    if (!target || !root || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setCompact(entry ? !entry.isIntersecting : false),
      { root, rootMargin: "-64px 0px 0px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  // A pull down from the top of the list moves the zoom's playhead. Touch events, not
  // pointer events: the browser cancels a pointer the moment it takes the pan, and only
  // a non-passive touchmove can claim the gesture.
  useEffect(() => {
    const sheet = stage.current;
    if (!sheet) return;
    let startY = 0;
    let startX = 0;
    let pulling = false;
    let travelled = 0;
    const onStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch || event.touches.length > 1) return;
      startY = touch.clientY;
      startX = touch.clientX;
      pulling = false;
      travelled = 0;
    };
    const onMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;
      const dy = touch.clientY - startY;
      const dx = touch.clientX - startX;
      if (!pulling) {
        const atTop = (scroller.current?.scrollTop ?? 0) <= 0;
        if (!atTop || dy < 10 || dy < Math.abs(dx) * 1.2) return;
        pulling = true;
        startY = touch.clientY;
      }
      event.preventDefault();
      travelled = Math.max(0, touch.clientY - startY);
      zoom.scrub(travelled / sheet.clientHeight / 0.7);
    };
    const onEnd = () => {
      if (!pulling) return;
      pulling = false;
      if (travelled / sheet.clientHeight > DISMISS_SHARE) zoom.close();
      else zoom.cancelScrub();
    };
    sheet.addEventListener("touchstart", onStart, { passive: true });
    sheet.addEventListener("touchmove", onMove, { passive: false });
    sheet.addEventListener("touchend", onEnd);
    sheet.addEventListener("touchcancel", onEnd);
    return () => {
      sheet.removeEventListener("touchstart", onStart);
      sheet.removeEventListener("touchmove", onMove);
      sheet.removeEventListener("touchend", onEnd);
      sheet.removeEventListener("touchcancel", onEnd);
    };
  }, [zoom]);

  useLayoutEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 0;
    setOpenId(null);
    setOnlyForgotten(false);
  }, [scope]);

  const mark = (id: string, choice: RecallChoice, toggle: boolean) => {
    const next = { ...marks };
    // The same answer again clears it. The two answers cannot both stand.
    if (toggle && next[id] === choice) delete next[id];
    else next[id] = choice;
    saveRecallMarks(next);
    onMarks(next);
    if (next[id]) setOpenId((current) => (current === id ? null : current));
  };

  const label = scopeName(scope, now, ui);
  const summary = tallyLine(score, ui);

  return (
    <Dialog.Root open onOpenChange={(open) => !open && zoom.close()}>
      <Dialog.Portal container={container}>
        <Dialog.Content
          className="vocab-recall"
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            back.current?.focus({ preventScroll: true });
          }}
          // This dialog has no Radix trigger to hand focus back to.
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocus();
          }}
          // The settings sheet behind must not read this Escape as its own.
          onKeyDown={(event) => event.stopPropagation()}
        >
          <Dialog.Title className="sr-only">
            {t(ui, "recall.scopeAria", { label, n: entries.length })}
          </Dialog.Title>
          <div ref={backdrop} className="vocab-recall-backdrop" />
          <div
            ref={stage}
            className="vocab-recall-stage"
            data-today={(typeof scope === "number" && scope === startOfDay(now)) || undefined}
          >
            <div ref={wash} className="vocab-recall-wash" />
            <div
              ref={scroller}
              className="vocab-recall-scroll"
              onScroll={(event) => setScrolled(event.currentTarget.scrollTop > 4)}
            >
              <div className="vocab-recall-column">
                <div ref={hero} className="vocab-recall-hero">
                  <div className="vocab-recall-headline">
                    <strong ref={count} className="vocab-recall-count">
                      <span key={scope}>{entries.length}</span>
                    </strong>
                    <span ref={unit} className="vocab-recall-unit">
                      {t(ui, "onboard.wordsUnit")}
                    </span>
                  </div>
                  <span ref={name} className="vocab-recall-name">
                    {label}
                  </span>
                </div>
                <div ref={tally} className="vocab-recall-tally">
                  {score.total > 0 && (
                    <>
                      <div className="vocab-recall-meter" aria-hidden="true">
                        <MeterParts {...score} />
                      </div>
                      <div className="vocab-recall-summary">
                        <p aria-live="polite">{summary}</p>
                        {score.no > 0 && (
                          <button
                            type="button"
                            aria-pressed={forgotten}
                            data-on={forgotten || undefined}
                            onClick={() => setOnlyForgotten((on) => !on)}
                          >
                            {forgotten
                              ? t(ui, "recall.showAll")
                              : t(ui, "recall.showForgotten", { n: score.no })}
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
                <div ref={strip}>
                  <RhythmStrip
                    days={days}
                    scope={scope}
                    marks={marks}
                    now={now}
                    ui={ui}
                    weekCount={week.length}
                    onScope={setScope}
                  />
                </div>
                <div ref={list} key={`${scope}-${forgotten}`} className="vocab-recall-list">
                  {entries.length === 0 && (
                    <p className="vocab-recall-empty">
                      {scope === "week"
                        ? t(ui, "recall.empty.week")
                        : scope === startOfDay(now)
                          ? t(ui, "recall.empty.today")
                          : t(ui, "recall.empty.day")}
                    </p>
                  )}
                  {groups.map((group) => (
                    <section key={group.start} className="vocab-recall-group">
                      {scope === "week" && (
                        <h3 className="vocab-recall-group-head">{dayName(group.start, now, ui)}</h3>
                      )}
                      <ol className="vocab-recall-rail">
                        {group.rows.map((entry) => (
                          <Row
                            key={entry.id}
                            entry={entry}
                            copy={copies[entry.id]}
                            mark={marks[entry.id]}
                            open={openId === entry.id}
                            ui={ui}
                            weekViews={week.find((row) => row.id === entry.id)?.views ?? 1}
                            onToggle={() =>
                              setOpenId((current) => (current === entry.id ? null : entry.id))
                            }
                            onMark={(choice, toggle) => mark(entry.id, choice, toggle)}
                          />
                        ))}
                      </ol>
                    </section>
                  ))}
                </div>
              </div>
            </div>
            <header
              ref={bar}
              className="vocab-recall-topbar"
              data-scrolled={scrolled || undefined}
              data-compact={compact || undefined}
            >
              <span className="vocab-recall-grabber" aria-hidden="true" />
              <button
                ref={back}
                type="button"
                className="vocab-recall-back"
                onClick={zoom.close}
                aria-label={t(ui, "recall.back")}
              >
                <ChevronLeft size={20} />
              </button>
              <p className="vocab-recall-compact" aria-hidden={!compact}>
                <strong>{label}</strong>
                <small>
                  {entries.length} {t(ui, "onboard.wordsUnit")}
                </small>
              </p>
            </header>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
