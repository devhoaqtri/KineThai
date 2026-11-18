/**
 * The dialog behind every greyed-out on-device control: why that control is off, how to let
 * the site keep data in this browser, and "Thử lại", which checks again and, once storage
 * works, turns the controls back on and closes itself. A browser cannot be made to show a
 * storage prompt again, so asking again means the reader changes a setting and the site
 * checks; "Thử lại" also asks the browser to keep the data for good.
 *
 * Mounted once per page that has such controls; any control opens it with
 * requestStorageDialog(feature). It is drawn in the shell so the shell's colours apply, over
 * the settings panel and the drawers.
 *
 * Exports: StorageAccessDialog
 * Depends on: React, react-dom portal, lucide icons, @/hooks/use-storage-access,
 *   @/lib/storage-access, ../lib/storage-features
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, HardDrive, X } from "lucide-react";
import { useStorageAccess } from "@/hooks/use-storage-access";
import { closeStorageDialog, recheckStorageAccess } from "@/lib/storage-access";
import { storageDialogCopy, storageHelpSteps, type StorageFeature } from "../lib/storage-features";

/** How long "it works now" stays up before the dialog closes itself. */
const SUCCESS_HOLD_MS = 1400;

type Phase = "idle" | "checking" | "still-off" | "fixed";

export function StorageAccessDialog() {
  const access = useStorageAccess();
  const feature = access.dialog as StorageFeature | null;
  const [phase, setPhase] = useState<Phase>("idle");
  const [host, setHost] = useState<HTMLElement | null>(null);
  const retry = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setHost(document.querySelector<HTMLElement>(".vocabulary-shell") ?? document.body);
  }, []);

  useEffect(() => {
    if (!feature) return;
    setPhase("idle");
    returnFocus.current = document.activeElement as HTMLElement | null;
    retry.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeStorageDialog();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      returnFocus.current?.focus?.({ preventScroll: true });
    };
  }, [feature]);

  useEffect(() => {
    if (phase !== "fixed") return;
    const timer = window.setTimeout(closeStorageDialog, SUCCESS_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  if (!feature || !host) return null;
  const copy = storageDialogCopy(feature, access.state);
  const steps = storageHelpSteps(navigator.userAgent, feature);

  const check = async () => {
    setPhase("checking");
    const next = await recheckStorageAccess();
    const works = feature === "keep" ? !next.persistDenied : next.state === "ok";
    setPhase(works ? "fixed" : "still-off");
  };

  return createPortal(
    // Opts out of the card's tap gestures, like the report panel's layer.
    <div className="vocab-storage-layer" data-no-gesture="" lang="vi">
      <div className="vocab-storage-scrim" onClick={closeStorageDialog} aria-hidden="true" />
      <div
        className="vocab-storage-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="vocab-storage-title"
        aria-describedby="vocab-storage-reason"
      >
        <header className="vocab-storage-head">
          <HardDrive className="vocab-storage-icon" size={20} aria-hidden="true" />
          <h2 id="vocab-storage-title">{phase === "fixed" ? "Đã lưu được rồi" : copy.title}</h2>
          <button
            type="button"
            className="vocab-storage-close"
            onClick={closeStorageDialog}
            aria-label="Đóng"
          >
            <X size={18} />
          </button>
        </header>
        {phase === "fixed" ? (
          <p className="vocab-storage-note" role="status">
            <Check size={16} aria-hidden="true" />
            {feature === "keep"
              ? "Trình duyệt sẽ giữ dữ liệu của bạn lâu dài."
              : "Các nút trên thiết bị đã dùng lại được."}
          </p>
        ) : (
          <>
            <p id="vocab-storage-reason" className="vocab-storage-note">
              {copy.reason}
            </p>
            <p className="vocab-storage-note">{copy.still}</p>
            {access.state !== "full" && (
              <>
                <p className="vocab-storage-steps-title">Cách cho phép lại</p>
                <ol className="vocab-storage-steps">
                  {steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </>
            )}
            {phase === "still-off" && (
              <p className="vocab-storage-error" role="alert">
                Vẫn chưa lưu được. Đổi cài đặt như trên, rồi bấm Thử lại.
              </p>
            )}
            <div className="vocab-storage-actions">
              <button type="button" className="vocab-storage-later" onClick={closeStorageDialog}>
                Để sau
              </button>
              <button
                ref={retry}
                type="button"
                className="vocab-storage-retry"
                onClick={() => void check()}
                disabled={phase === "checking"}
              >
                {phase === "checking" ? "Đang kiểm tra…" : "Thử lại"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    host,
  );
}
