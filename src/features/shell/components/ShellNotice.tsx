/**
 * One notice card in the shell's own look: the dark card with an amber edge that the
 * browser and desktop-mode warnings use. Inline hex colors on purpose, so it stays legible
 * on a browser whose oklch() theme variables failed.
 *
 * Exports: ShellNotice, NoticeTone
 * Depends on: React
 */

import type { ReactNode } from "react";

export type NoticeTone = "warn" | "ok";

const EDGE: Record<NoticeTone, { border: string; title: string }> = {
  warn: { border: "#f59e0b", title: "#fcd34d" },
  ok: { border: "#34d399", title: "#6ee7b7" },
};

/**
 * @param props.title - Bold first line
 * @param props.children - The explanation
 * @param props.tone - Amber for a problem, green for "fixed"
 * @param props.onDismiss - Shows the dismiss button when given
 * @returns Notice card
 */
export function ShellNotice({
  title,
  children,
  tone = "warn",
  onDismiss,
  dismissLabel = "Đã hiểu",
}: {
  title: string;
  children?: ReactNode;
  tone?: NoticeTone;
  onDismiss?: () => void;
  dismissLabel?: string;
}) {
  const edge = EDGE[tone];
  return (
    <div
      role={tone === "warn" ? "alert" : "status"}
      lang="vi"
      style={{
        pointerEvents: "auto",
        maxWidth: "520px",
        margin: "0 auto",
        padding: "12px 16px",
        borderRadius: "14px",
        backgroundColor: "#1b1128",
        border: `1px solid ${edge.border}`,
        color: "#fffbeb",
        boxShadow: "0 12px 32px rgba(0, 0, 0, 0.55)",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <p
        style={{
          margin: children ? "0 0 4px" : 0,
          fontSize: "15px",
          fontWeight: 700,
          lineHeight: 1.3,
          color: edge.title,
        }}
      >
        {title}
      </p>
      {children ? (
        <p style={{ margin: 0, fontSize: "13px", lineHeight: 1.45, color: "#f3f4f6" }}>
          {children}
        </p>
      ) : null}
      {onDismiss ? (
        <div style={{ marginTop: "10px" }}>
          <button
            type="button"
            onClick={onDismiss}
            style={{
              backgroundColor: edge.border,
              color: "#111827",
              border: 0,
              borderRadius: "8px",
              padding: "6px 12px",
              fontSize: "12px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {dismissLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}
