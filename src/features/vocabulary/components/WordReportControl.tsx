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

import { useCallback, useEffect, useRef, useState, type Ref, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Check, X } from "lucide-react";
import {
  MAX_REPORT_REASONS,
  REPORT_REASONS,
  isSevereReason,
  toReportStage,
  type ReportReasonId,
} from "../lib/word-report";
import { rememberReportedWord } from "../lib/reported-words";

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
  return (
    <button
      ref={buttonRef}
      type="button"
      className="vocab-report-button"
      data-done={reported || undefined}
      onClick={onToggle}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label={reported ? "Bạn đã báo lỗi từ này. Mở bảng báo lỗi" : "Báo lỗi từ này"}
      title="Báo lỗi thẻ này"
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
  anchor,
  split,
}: {
  /** Playing its exit animation; the card unmounts it once that finishes. */
  closing?: boolean;
  /**
   * The card that opened the panel. The panel is drawn in the shell that holds it, not
   * inside it: the card sits in its slot's stacking context, which no z-index of the
   * panel's can leave, so the fixed saved-words tab (z 46 on the shell) was drawn over
   * the open panel.
   */
  anchor: RefObject<HTMLElement | null>;
  /** The card's `data-reveal-split`, which the landscape sheet's rules key on. */
  split?: string;
  wordId: string;
  stageId: string;
  alreadyReported: boolean;
  onSent: () => void;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>(alreadyReported ? "sent" : "choosing");
  const [selected, setSelected] = useState<ReportReasonId[]>([]);
  const panel = useRef<HTMLDivElement>(null);
  const openedOn = useRef(stageId);
  // Resolved once, when the panel opens: the card is mounted by then, and a card never
  // moves to another shell while its panel is up. No shell (a stage outside the feed)
  // keeps the panel inline, where it used to be.
  const [host] = useState(() => anchor.current?.closest<HTMLElement>(".vocabulary-shell") ?? null);

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
  }, [onSent, phase, selected, wordId]);

  const layer = (
    // Opts out of the card's tap-to-turn-page gestures. The layer is fixed over the whole
    // screen just above the saved-words tab and under the toolbar, so the panel is the one
    // thing in focus while the tab stays where it is, dimmed under the scrim.
    <div className="vocab-report-layer" data-no-gesture="" data-reveal-split={split}>
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
        aria-label="Báo lỗi thẻ này"
        lang="vi"
      >
        <header className="vocab-report-head">
          <h2>{phase === "sent" ? "Đã gửi. Cảm ơn bạn!" : "Thẻ này sai ở đâu?"}</h2>
          <button type="button" className="vocab-report-close" onClick={onClose} aria-label="Đóng">
            <X size={18} />
          </button>
        </header>
        {phase === "sent" ? (
          <p className="vocab-report-note" role="status">
            <Check size={16} /> Báo cáo ẩn danh của bạn đã tới người biên soạn.
          </p>
        ) : (
          <>
            <p className="vocab-report-note">
              Chạm để chọn (tối đa {MAX_REPORT_REASONS}). Báo cáo ẩn danh — không kèm thông tin nào
              về bạn.
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
                  {reason.vi}
                </button>
              ))}
            </div>
            {phase === "failed" && (
              <p className="vocab-report-error" role="alert">
                Chưa gửi được. Bạn thử lại nhé.
              </p>
            )}
            <button
              type="button"
              className="vocab-report-send"
              onClick={() => void send()}
              disabled={!selected.length || phase === "sending"}
            >
              {phase === "sending" ? "Đang gửi…" : "Gửi báo cáo ẩn danh"}
            </button>
          </>
        )}
      </div>
    </div>
  );
  return host ? createPortal(layer, host) : layer;
}
