/**
 * The app-wide 404 page, in Vietnamese, in the error screen's own look (ErrorComponent):
 * what happened in one line, and one way on, back to learning. Inline hex colors, so it
 * stays legible on a browser whose oklch() theme variables failed.
 *
 * Exports: NotFoundComponent
 * Depends on: @tanstack/react-router Link
 */

import { Link } from "@tanstack/react-router";

/** @returns Not-found page element */
export function NotFoundComponent() {
  return (
    <main
      lang="vi"
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxSizing: "border-box",
        padding:
          "max(24px, env(safe-area-inset-top, 24px)) 16px max(24px, env(safe-area-inset-bottom, 24px))",
        backgroundColor: "#120c1c",
        color: "#f3f4f6",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <div style={{ width: "100%", maxWidth: "440px", textAlign: "center" }}>
        <p
          aria-hidden="true"
          style={{ margin: 0, fontSize: "64px", fontWeight: 800, lineHeight: 1, color: "#34d399" }}
        >
          404
        </p>
        <h1 style={{ margin: "16px 0 0", fontSize: "22px", lineHeight: 1.3, fontWeight: 800 }}>
          Không tìm thấy trang này
        </h1>
        <p style={{ margin: "10px 0 0", fontSize: "15px", lineHeight: 1.55, color: "#c4b8d4" }}>
          Có thể đường dẫn bị gõ sai hoặc trang đã được chuyển đi.
        </p>
        <Link
          to="/feed"
          style={{
            marginTop: "22px",
            minHeight: "44px",
            padding: "0 22px",
            borderRadius: "999px",
            backgroundColor: "#34d399",
            color: "#0b1f17",
            fontSize: "15px",
            fontWeight: 700,
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          Vào học từ vựng
        </Link>
      </div>
    </main>
  );
}
