/**
 * The app-wide error screen (root route error boundary), in Vietnamese.
 *
 * It first works out WHY, in the order of lib/load-failure-catalog: a code chunk gone
 * after a deploy reloads once by itself; then no connection, an unsupported browser, a
 * translated page, each told plainly with what to do. Only an error none of those
 * explains is ours, and for that the reader may open a report, read every line of it,
 * add a note, and choose to send it to the admin, or not. Nothing is sent without that
 * choice. Inline hex colors so it stays legible when the theme's oklch() fails.
 *
 * Exports: ErrorComponent
 * Depends on: @tanstack/react-router, lib/error-report, lib/stale-chunk,
 *   lib/browser-support, lib/lovable-error-reporting
 */

import { useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { useEffect, useState, type CSSProperties } from "react";
import { UNSUPPORTED_BROWSER_COPY } from "@/lib/browser-support";
import {
  buildErrorReport,
  diagnoseFailure,
  readReportEnv,
  reportLines,
  ERROR_REPORT_LIMITS,
  type FailureDiagnosis,
  type ReportEnv,
} from "@/lib/error-report";
import { reportLovableError } from "@/lib/lovable-error-reporting";
import { isStaleChunkError, reloadOnceForStaleChunk } from "@/lib/stale-chunk";

type Screen = { title: string; body: string };
type SendPhase = "closed" | "review" | "sending" | "sent" | "failed";

const SCREENS: Record<FailureDiagnosis["caseId"] | "reloading" | "unknown", Screen> = {
  reloading: {
    title: "Trang vừa được cập nhật",
    body: "Đang tải phiên bản mới…",
  },
  offline: {
    title: "Không có kết nối mạng",
    body: "Kiểm tra Wi-Fi hoặc dữ liệu di động. Trang sẽ tự tải lại khi có mạng.",
  },
  "outdated-browser": {
    title: UNSUPPORTED_BROWSER_COPY.title,
    body: UNSUPPORTED_BROWSER_COPY.description,
  },
  "page-translation": {
    title: "Tính năng dịch trang làm trang bị lỗi",
    body: "Hãy tắt dịch trang của trình duyệt (chọn xem bản gốc ở biểu tượng dịch trên thanh địa chỉ), rồi tải lại trang.",
  },
  "stale-chunk-after-deploy": {
    title: "Không tải được trang",
    body: "Bạn thử tải lại trang. Nếu vẫn lỗi, gửi báo cáo để tụi mình sửa nhé.",
  },
  "render-loop": {
    title: "Có lỗi xảy ra",
    body: "Bạn thử tải lại trang. Nếu vẫn lỗi, gửi báo cáo để tụi mình sửa nhé.",
  },
  "render-crash": {
    title: "Có lỗi xảy ra",
    body: "Bạn thử tải lại trang. Nếu vẫn lỗi, gửi báo cáo để tụi mình sửa nhé.",
  },
  unknown: {
    title: "Có lỗi xảy ra",
    body: "Bạn thử tải lại trang nhé.",
  },
};

const C = {
  bg: "#120c1c",
  card: "#1b1128",
  line: "#3b2d4f",
  ink: "#f3f4f6",
  soft: "#c4b8d4",
  accent: "#34d399",
  onAccent: "#0b1f17",
  warn: "#fcd34d",
};

const button = (primary: boolean): CSSProperties => ({
  minHeight: "44px",
  padding: "0 18px",
  borderRadius: "999px",
  border: primary ? 0 : `1px solid ${C.line}`,
  backgroundColor: primary ? C.accent : "transparent",
  color: primary ? C.onAccent : C.ink,
  fontSize: "15px",
  fontWeight: 700,
  cursor: "pointer",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
});

/**
 * Render the error screen and log the failure to admin telemetry.
 * @param props.error - Caught route error
 * @param props.reset - Router-provided reset callback
 * @returns Error page element
 */
export function ErrorComponent({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  const [env, setEnv] = useState<ReportEnv | null>(null);
  const [reloading, setReloading] = useState(false);
  const [phase, setPhase] = useState<SendPhase>("closed");
  const [note, setNote] = useState("");

  useEffect(() => {
    console.error(error);
    // A deploy replaced the code this page was built from: fetch the new version, once.
    if (isStaleChunkError(error) && reloadOnceForStaleChunk()) {
      setReloading(true);
      return;
    }
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
    setEnv(readReportEnv());
  }, [error]);

  const retry = () => {
    void router.invalidate();
    reset();
  };

  // Back online: try again by itself, as the screen promised.
  const diagnosis = env ? diagnoseFailure(error, env) : null;
  const offline = diagnosis?.caseId === "offline";
  useEffect(() => {
    if (!offline) return;
    const online = () => window.location.reload();
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, [offline]);

  const screen = reloading
    ? SCREENS.reloading
    : diagnosis
      ? SCREENS[diagnosis.caseId]
      : SCREENS.unknown;
  const report =
    env && diagnosis ? buildErrorReport(error, diagnosis, env, note, window.location.origin) : null;

  const send = async () => {
    if (!report || phase === "sending") return;
    setPhase("sending");
    try {
      const response = await fetch("/api/public/error-report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(report),
      });
      setPhase(response.ok ? "sent" : "failed");
    } catch {
      setPhase("failed");
    }
  };

  return (
    <div
      lang="vi"
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxSizing: "border-box",
        padding:
          "max(24px, env(safe-area-inset-top, 24px)) 16px max(24px, env(safe-area-inset-bottom, 24px))",
        backgroundColor: C.bg,
        color: C.ink,
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <div style={{ width: "100%", maxWidth: "440px", textAlign: "center" }}>
        <h1 style={{ margin: 0, fontSize: "22px", lineHeight: 1.3, fontWeight: 800 }}>
          {screen.title}
        </h1>
        <p style={{ margin: "10px 0 0", fontSize: "15px", lineHeight: 1.55, color: C.soft }}>
          {screen.body}
        </p>
        {diagnosis?.caseId === "outdated-browser" && env?.browserLabel ? (
          <p style={{ margin: "8px 0 0", fontSize: "13px", color: C.warn }}>
            Phát hiện: {env.browserLabel}
          </p>
        ) : null}

        {!reloading ? (
          <div
            style={{
              marginTop: "22px",
              display: "flex",
              flexWrap: "wrap",
              gap: "10px",
              justifyContent: "center",
            }}
          >
            <button
              type="button"
              style={button(true)}
              onClick={
                diagnosis?.caseId === "page-translation" ? () => window.location.reload() : retry
              }
            >
              {diagnosis?.caseId === "page-translation" ? "Tải lại trang" : "Thử lại"}
            </button>
            <a href="/" style={button(false)}>
              Về trang chủ
            </a>
            {diagnosis?.offerReport && phase === "closed" ? (
              <button type="button" style={button(false)} onClick={() => setPhase("review")}>
                Gửi báo cáo lỗi
              </button>
            ) : null}
          </div>
        ) : null}

        {report && phase !== "closed" ? (
          <section
            aria-label="Báo cáo lỗi"
            style={{
              marginTop: "22px",
              padding: "16px",
              borderRadius: "16px",
              border: `1px solid ${C.line}`,
              backgroundColor: C.card,
              textAlign: "left",
            }}
          >
            {phase === "sent" ? (
              <p
                role="status"
                style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: C.accent }}
              >
                Đã gửi. Cảm ơn bạn!
              </p>
            ) : (
              <>
                <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 800 }}>Báo cáo sẽ gửi</h2>
                <p
                  style={{
                    margin: "4px 0 10px",
                    fontSize: "13px",
                    lineHeight: 1.45,
                    color: C.soft,
                  }}
                >
                  Báo cáo ẩn danh: không kèm tên, tài khoản hay dữ liệu học của bạn, và không lưu
                  địa chỉ IP. Đây là toàn bộ nội dung:
                </p>
                <dl
                  style={{
                    margin: 0,
                    maxHeight: "220px",
                    overflowY: "auto",
                    padding: "10px 12px",
                    borderRadius: "10px",
                    backgroundColor: C.bg,
                    fontSize: "12px",
                    lineHeight: 1.45,
                  }}
                >
                  {reportLines(report).map(([label, value]) => (
                    <div key={label} style={{ marginBottom: "6px" }}>
                      <dt style={{ color: C.soft, fontWeight: 700 }}>{label}</dt>
                      <dd
                        style={{
                          margin: 0,
                          whiteSpace: "pre-wrap",
                          overflowWrap: "anywhere",
                          fontFamily:
                            label === "Chi tiết kỹ thuật"
                              ? "ui-monospace, Menlo, monospace"
                              : undefined,
                        }}
                      >
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
                <label
                  htmlFor="error-report-note"
                  style={{
                    display: "block",
                    margin: "12px 0 6px",
                    fontSize: "13px",
                    fontWeight: 700,
                  }}
                >
                  Bạn đang làm gì khi lỗi xảy ra? (không bắt buộc)
                </label>
                <textarea
                  id="error-report-note"
                  value={note}
                  maxLength={ERROR_REPORT_LIMITS.note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={3}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "10px 12px",
                    borderRadius: "10px",
                    border: `1px solid ${C.line}`,
                    backgroundColor: C.bg,
                    color: C.ink,
                    fontSize: "14px",
                    fontFamily: "inherit",
                    resize: "vertical",
                  }}
                />
                {phase === "failed" ? (
                  <p role="alert" style={{ margin: "8px 0 0", fontSize: "13px", color: C.warn }}>
                    Chưa gửi được. Bạn thử lại nhé.
                  </p>
                ) : null}
                <div style={{ marginTop: "12px", display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    style={button(true)}
                    disabled={phase === "sending"}
                    onClick={() => void send()}
                  >
                    {phase === "sending" ? "Đang gửi…" : "Gửi báo cáo"}
                  </button>
                  <button type="button" style={button(false)} onClick={() => setPhase("closed")}>
                    Không gửi
                  </button>
                </div>
              </>
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
}
