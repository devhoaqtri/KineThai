/**
 * Vietnamese notice for a phone or tablet showing the site in the browser's "desktop site"
 * mode, which lays the page out wider than the screen so only part of it shows
 * (@/lib/desktop-mode). It tells the reader how to turn the mode off.
 *
 * The page's own layout is too wide in that mode, so the notice is placed by the visual
 * viewport (the part of the page actually on screen) rather than by `position: fixed`
 * alone, and set at the reader's own scale when the browser has zoomed the page out.
 * Dismissed, it stays away for the session. Never on the carousel or export pages.
 *
 * Exports: DesktopModeNotice
 * Depends on: @/lib/desktop-mode
 */

import { useEffect, useState, type CSSProperties } from "react";
import { isForcedDesktopLayout, readDesktopModeSignals } from "@/lib/desktop-mode";

const DISMISSED_KEY = "kine.desktop_mode_dismissed";

/** The notice's box: where the visible part of the page is, and its zoom. */
type Visible = { left: number; top: number; width: number; scale: number };

function readDismissed(): boolean {
  try {
    return window.sessionStorage?.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeDismissed(): void {
  try {
    window.sessionStorage?.setItem(DISMISSED_KEY, "1");
  } catch {
    // Ignore storage failures in strict private-browsing modes.
  }
}

function readVisible(): Visible {
  const view = window.visualViewport;
  return view
    ? { left: view.offsetLeft, top: view.offsetTop, width: view.width, scale: view.scale || 1 }
    : { left: 0, top: 0, width: window.innerWidth, scale: 1 };
}

/** @returns The notice while the page is laid out wider than its touch screen, else null. */
export function DesktopModeNotice() {
  const [visible, setVisible] = useState<Visible | null>(null);

  useEffect(() => {
    const path = window.location.pathname;
    if (path.startsWith("/carousel/") || path.startsWith("/export/")) return;
    if (readDismissed()) return;
    const update = () => {
      // Dismissed while listening: a later resize must not bring it back.
      if (readDismissed()) {
        setVisible(null);
        return;
      }
      const signals = readDesktopModeSignals();
      setVisible(signals && isForcedDesktopLayout(signals) ? readVisible() : null);
    };
    update();
    const view = window.visualViewport;
    view?.addEventListener("resize", update);
    view?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      view?.removeEventListener("resize", update);
      view?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  if (!visible) return null;

  // Drawn at the reader's own size inside the visible part: a zoomed-out page would
  // otherwise shrink the notice with everything else.
  const box: CSSProperties = {
    position: "fixed",
    left: visible.left,
    top: visible.top,
    width: visible.width * visible.scale,
    transform: `scale(${1 / visible.scale})`,
    transformOrigin: "0 0",
    zIndex: 9991,
    boxSizing: "border-box",
    padding: "max(12px, env(safe-area-inset-top, 12px)) 12px 0",
    pointerEvents: "none",
  };

  return (
    <div role="alert" style={box}>
      <div
        style={{
          pointerEvents: "auto",
          maxWidth: "520px",
          margin: "0 auto",
          padding: "14px 16px",
          borderRadius: "14px",
          backgroundColor: "#1b1128",
          border: "1px solid #f59e0b",
          color: "#fffbeb",
          boxShadow: "0 12px 32px rgba(0, 0, 0, 0.55)",
          fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        }}
      >
        <p
          style={{
            margin: "0 0 4px",
            fontSize: "15px",
            fontWeight: 700,
            lineHeight: 1.3,
            color: "#fcd34d",
          }}
        >
          Trang đang mở ở chế độ máy tính
        </p>
        <p style={{ margin: 0, fontSize: "13px", lineHeight: 1.45, color: "#f3f4f6" }}>
          Vì vậy màn hình chỉ hiện được một phần. Mở menu ⋮ của Chrome và bỏ chọn “Trang web cho máy
          tính” để trang vừa khít màn hình.
        </p>
        <div style={{ marginTop: "10px" }}>
          <button
            type="button"
            onClick={() => {
              writeDismissed();
              setVisible(null);
            }}
            style={{
              backgroundColor: "#f59e0b",
              color: "#111827",
              border: 0,
              borderRadius: "8px",
              padding: "6px 12px",
              fontSize: "12px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Đã hiểu
          </button>
        </div>
      </div>
    </div>
  );
}
