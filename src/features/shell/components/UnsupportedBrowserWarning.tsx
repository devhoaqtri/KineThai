/**
 * Vietnamese compatibility warning banner for unsupported old browsers and operating systems.
 *
 * Mounts client-only after hydration so SSR HTML stays identical across user agents,
 * marks `__KINE_APP_BOOTED__` to suppress the ES5 fallback script, and uses explicit hex
 * fallback colors so it stays legible even when Tailwind CSS v4 `oklch()` variables fail.
 *
 * Exports: UnsupportedBrowserWarning
 * Depends on: @/lib/browser-support
 */

import { useEffect, useState } from "react";
import {
  checkCurrentBrowserSupport,
  UNSUPPORTED_BROWSER_COPY,
  type BrowserSupportResult,
} from "@/lib/browser-support";

const DISMISSED_KEY = "kine.browser_compat_dismissed";

declare global {
  interface Window {
    __KINE_APP_BOOTED__?: boolean;
  }
}

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

/**
 * Display a dismissible Vietnamese warning banner when the current browser or OS is below
 * the app's minimum requirements.
 * @returns Warning banner element or null
 */
export function UnsupportedBrowserWarning() {
  const [result, setResult] = useState<BrowserSupportResult | null>(null);

  useEffect(() => {
    window.__KINE_APP_BOOTED__ = true;
    const legacyNode = document.getElementById("kine-legacy-browser-warning");
    if (legacyNode?.parentNode) legacyNode.parentNode.removeChild(legacyNode);

    const path = window.location.pathname;
    if (path.startsWith("/carousel/") || path.startsWith("/export/")) return;
    if (readDismissed()) return;

    const evaluated = checkCurrentBrowserSupport();
    if (!evaluated.supported) setResult(evaluated);
  }, []);

  if (!result || result.supported) return null;

  return (
    <div
      role="alert"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9990,
        padding: "max(12px, env(safe-area-inset-top, 12px)) 12px 0",
        pointerEvents: "none",
      }}
    >
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
        <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#fbbf24"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            style={{ flexShrink: 0, marginTop: "2px" }}
          >
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p
              style={{
                margin: "0 0 4px",
                fontSize: "15px",
                fontWeight: 700,
                lineHeight: 1.3,
                color: "#fcd34d",
              }}
            >
              {UNSUPPORTED_BROWSER_COPY.title}
            </p>
            <p
              style={{
                margin: 0,
                fontSize: "13px",
                lineHeight: 1.45,
                color: "#f3f4f6",
              }}
            >
              {UNSUPPORTED_BROWSER_COPY.description}
            </p>
            {result.detectedLabel ? (
              <p
                style={{
                  margin: "6px 0 0",
                  fontSize: "12px",
                  lineHeight: 1.35,
                  color: "#fde68a",
                }}
              >
                Phát hiện: {result.detectedLabel}
              </p>
            ) : null}
            <div style={{ marginTop: "10px" }}>
              <button
                type="button"
                onClick={() => {
                  writeDismissed();
                  setResult(null);
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
                {UNSUPPORTED_BROWSER_COPY.dismissLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
