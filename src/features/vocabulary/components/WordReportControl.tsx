/**
 * "Something is wrong with this word": the dashed 😕 button that sits at the left
 * end of a card's action row, and the panel it opens. A reader taps what is wrong
 * and an anonymous report goes to the admin — no typing, no account, nothing about
 * the reader; only the word, the reasons and which page of the card they were on.
 *
 * The button and the panel are separate components because they live in different
 * places: the button inside the action row, the panel over the whole card. The card
 * owns the open/reported state that ties them together.
 *
 * Exports: WordReportButton, WordReportPanel
 * Depends on: React, lucide-react, ../lib/word-report, ../lib/reported-words
 */

import { useCallback, useContext, useEffect, useRef, useState, type Ref } from "react";
import { Check, X } from "lucide-react";
import {
  MAX_REPORT_REASONS,
  REPORT_REASONS,
  isSevereReason,
  toReportStage,
  type ReportReasonId,
} from "../lib/word-report";
import { DeckLocaleContext } from "../lib/deck-locale";
import { rememberReportedWord } from "../lib/reported-words";
import { t, type CopyKey } from "../lib/ui-copy";
import { useLocale } from "../lib/useLocale";

type Phase = "choosing" | "sending" | "sent" | "failed";

/** How long the thank-you stays up before the panel closes itself. */
const SENT_HOLD_MS = 1500;

/**
 * The report trigger: a confused face in a dashed outline.
 * @param props.open - whether its panel is showing
 * @param props.reported - this device already reported the word
 * @param props.onToggle - open or close the panel
 * @param props.buttonRef - so focus can return here when the panel closes
 * @returns A compact button for the action row
 */
export function WordReportButton({
  open,
  reported,
  onToggle,
  buttonRef,
}: {
  open: boolean;
  reported: boolean;
  onToggle: () => void;
  buttonRef: Ref<HTMLButtonElement>;
}) {
  const ui = useLocale();
  return (
    <button
      ref={buttonRef}
      type="button"
      className="vocab-report-button"
      data-done={reported || undefined}
      onClick={onToggle}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label={reported ? t(ui, "report.buttonDone") : t(ui, "report.buttonOpen")}
      title={t(ui, "report.title")}
    >
      <span className="vocab-report-face" aria-hidden="true">
        😕
      </span>
    </button>
  );
}

/**
 * The panel of tappable reasons. Mount it to open it; it captures the card page it
 * was opened on, so that is the page the report is about even if the reader lingers.
 * @param props.wordId - the word on the card
 * @param props.stageId - the card page showing when the panel opened, e.g. "definition-0"
 * @param props.alreadyReported - show the thank-you instead of the choices
 * @param props.onSent - a report was accepted by the server
 * @param props.onClose - dismiss the panel
 * @param props.closing - fade out and ignore input while the card waits to unmount it
 * @returns Scrim plus dialog, positioned over the card
 */
export function WordReportPanel({
  wordId,
  stageId,
  alreadyReported,
  onSent,
  onClose,
  closing = false,
}: {
  /** Playing its exit animation; the card unmounts it once that finishes. */
  closing?: boolean;
  wordId: string;
  stageId: string;
  alreadyReported: boolean;
  onSent: () => void;
  onClose: () => void;
}) {
  const ui = useLocale();
  const deck = useContext(DeckLocaleContext);
  const [phase, setPhase] = useState<Phase>(alreadyReported ? "sent" : "choosing");
  const [selected, setSelected] = useState<ReportReasonId[]>([]);
  const panel = useRef<HTMLDivElement>(null);
  const openedOn = useRef(stageId);

  useEffect(() => {
    panel.current?.querySelector<HTMLElement>("button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Only a report sent in THIS opening closes the panel by itself; reopening on an
  // already-reported word leaves the thank-you up until the reader dismisses it.
  const justSent = phase === "sent" && selected.length > 0;
  useEffect(() => {
    if (!justSent) return;
    const timer = window.setTimeout(onClose, SENT_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [justSent, onClose]);

  const toggle = (id: ReportReasonId) => {
    setPhase("choosing");
    setSelected((current) =>
      current.includes(id)
        ? current.filter((entry) => entry !== id)
        : current.length >= MAX_REPORT_REASONS
          ? current
          : [...current, id],
    );
  };

  const send = useCallback(async () => {
    if (!selected.length || phase === "sending") return;
    setPhase("sending");
    try {
      const response = await fetch("/api/public/word-report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: wordId,
          locale: deck,
          reasons: selected,
          stage: toReportStage(openedOn.current),
        }),
      });
      if (!response.ok) throw new Error(String(response.status));
      rememberReportedWord(wordId);
      onSent();
      setPhase("sent");
    } catch {
      setPhase("failed");
    }
  }, [deck, onSent, phase, selected, wordId]);

  return (
    // Opts out of the card's tap-to-turn-page gestures.
    <div data-no-gesture="">
      <div
        className="vocab-report-scrim"
        data-closing={closing || undefined}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panel}
        className="vocab-report-panel"
        data-closing={closing || undefined}
        inert={closing || undefined}
        role="dialog"
        aria-modal="true"
        aria-label={t(ui, "report.title")}
        lang={ui}
      >
        <header className="vocab-report-head">
          <h2>{phase === "sent" ? t(ui, "report.sent") : t(ui, "report.prompt")}</h2>
          <button
            type="button"
            className="vocab-report-close"
            onClick={onClose}
            aria-label={t(ui, "report.close")}
          >
            <X size={18} />
          </button>
        </header>
        {phase === "sent" ? (
          <p className="vocab-report-note" role="status">
            <Check size={16} /> {t(ui, "report.thanks")}
          </p>
        ) : (
          <>
            <p className="vocab-report-note">
              {t(ui, "report.selectHint", { max: MAX_REPORT_REASONS })}
            </p>
            <div className="vocab-report-reasons">
              {REPORT_REASONS.map((reason) => (
                <button
                  key={reason.id}
                  type="button"
                  className="vocab-report-reason"
                  data-severe={isSevereReason(reason.id) || undefined}
                  aria-pressed={selected.includes(reason.id)}
                  onClick={() => toggle(reason.id)}
                >
                  {t(ui, `report.reason.${reason.id}` as CopyKey)}
                </button>
              ))}
            </div>
            {phase === "failed" && (
              <p className="vocab-report-error" role="alert">
                {t(ui, "report.error")}
              </p>
            )}
            <button
              type="button"
              className="vocab-report-send"
              onClick={() => void send()}
              disabled={!selected.length || phase === "sending"}
            >
              {phase === "sending" ? t(ui, "report.sending") : t(ui, "report.send")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
