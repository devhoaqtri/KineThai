/**
 * The error screen's diagnosis and the opt-in report a reader may send.
 *
 * diagnoseFailure runs the checks of lib/load-failure-catalog in their order: network
 * first, then browser support, and only when neither explains the failure is it ours, and
 * worth a report. The report holds nothing that names the reader (no account, no history,
 * no stored data); the reader sees every line of it before choosing to send it.
 *
 * Exports: ReportEnv, FailureDiagnosis, ErrorReport, diagnoseFailure,
 *   buildErrorReport, reportLines, readReportEnv, ERROR_REPORT_LIMITS
 * Depends on: ./stale-chunk, ./storage-probe, ./browser-support
 */

import { checkCurrentBrowserSupport } from "./browser-support";
import { isStaleChunkError } from "./stale-chunk";
import { probeLocalStorage, type StorageState } from "./storage-probe";

export const ERROR_REPORT_LIMITS = { text: 300, message: 500, stack: 2000, note: 500 } as const;

/** What the page knows about where it runs, read once when the error screen opens. */
export type ReportEnv = {
  online: boolean;
  /** Chrome/Edge translated the page (it adds this class to <html>). */
  translated: boolean;
  /** Browser-support issues, empty when supported. */
  browserIssues: string[];
  browserLabel: string | null;
  storage: StorageState;
  route: string;
  /** The card stage on screen, when the feed was up. */
  stage: string | null;
  /** The hashed entry script's name: which deploy the page came from. */
  build: string;
  userAgent: string;
  viewport: string;
  dpr: number;
  touch: boolean;
  language: string;
  network: string;
  secondsSinceLoad: number;
};

/** Case ids from lib/load-failure-catalog that the error screen can settle on. */
export type FailureCaseId =
  | "stale-chunk-after-deploy"
  | "offline"
  | "page-translation"
  | "outdated-browser"
  | "render-loop"
  | "render-crash";

export type FailureDiagnosis = {
  caseId: FailureCaseId;
  /** Whether the failure is ours, so the report is worth offering. */
  offerReport: boolean;
};

/**
 * Settle the error on one case, checks in catalogue order.
 * @pure true
 */
export function diagnoseFailure(error: unknown, env: ReportEnv): FailureDiagnosis {
  if (!env.online) return { caseId: "offline", offerReport: false };
  if (env.browserIssues.length) return { caseId: "outdated-browser", offerReport: false };
  if (env.translated) return { caseId: "page-translation", offerReport: false };
  if (isStaleChunkError(error)) return { caseId: "stale-chunk-after-deploy", offerReport: true };
  const message = error instanceof Error ? error.message : String(error);
  if (/Maximum update depth exceeded/i.test(message)) {
    return { caseId: "render-loop", offerReport: true };
  }
  return { caseId: "render-crash", offerReport: true };
}

/** The report as sent and as the server accepts it. */
export type ErrorReport = {
  caseId: string;
  errorName: string;
  message: string;
  stack: string;
  route: string;
  stage: string | null;
  build: string;
  userAgent: string;
  viewport: string;
  dpr: number;
  touch: boolean;
  language: string;
  network: string;
  online: boolean;
  storage: StorageState;
  translated: boolean;
  browserIssues: string;
  secondsSinceLoad: number;
  note: string;
};

const clip = (value: string, max: number) => (value.length > max ? value.slice(0, max) : value);

/**
 * The stack with this site's address dropped from its frames, which only makes it longer.
 * @pure true
 */
function shortStack(error: unknown, origin: string): string {
  const stack = error instanceof Error && typeof error.stack === "string" ? error.stack : "";
  const shortened = origin ? stack.split(origin).join("") : stack;
  return clip(shortened, ERROR_REPORT_LIMITS.stack);
}

/**
 * The report for an error, from the page's environment and the reader's optional note.
 * @pure true
 */
export function buildErrorReport(
  error: unknown,
  diagnosis: FailureDiagnosis,
  env: ReportEnv,
  note = "",
  origin = "",
): ErrorReport {
  const isError = error instanceof Error;
  return {
    caseId: diagnosis.caseId,
    errorName: clip(isError ? error.name : typeof error, ERROR_REPORT_LIMITS.text),
    message: clip(isError ? error.message : String(error), ERROR_REPORT_LIMITS.message),
    stack: shortStack(error, origin),
    route: clip(env.route, ERROR_REPORT_LIMITS.text),
    stage: env.stage,
    build: clip(env.build, ERROR_REPORT_LIMITS.text),
    userAgent: clip(env.userAgent, ERROR_REPORT_LIMITS.message),
    viewport: env.viewport,
    dpr: env.dpr,
    touch: env.touch,
    language: clip(env.language, 32),
    network: clip(env.network, 32),
    online: env.online,
    storage: env.storage,
    translated: env.translated,
    browserIssues: clip(env.browserIssues.join(", "), ERROR_REPORT_LIMITS.text),
    secondsSinceLoad: Math.round(env.secondsSinceLoad),
    note: clip(note.trim(), ERROR_REPORT_LIMITS.note),
  };
}

/**
 * The report as the reader reads it before sending: one Vietnamese label per line.
 * @pure true
 */
export function reportLines(report: ErrorReport): [label: string, value: string][] {
  const yesNo = (value: boolean) => (value ? "có" : "không");
  const lines: [string, string][] = [
    ["Lỗi", `${report.errorName}: ${report.message}`],
    ["Trang", report.stage ? `${report.route} (${report.stage})` : report.route],
    ["Phiên bản", report.build || "không rõ"],
    ["Trình duyệt", report.userAgent],
    ["Màn hình", `${report.viewport} @${report.dpr}x${report.touch ? ", cảm ứng" : ""}`],
    ["Ngôn ngữ máy", report.language],
    ["Mạng", `${report.network}, đang ${report.online ? "có mạng" : "mất mạng"}`],
    ["Lưu dữ liệu", { ok: "được", blocked: "bị chặn", full: "đã đầy" }[report.storage]],
    ["Dịch trang", yesNo(report.translated)],
    ["Mở được", `${report.secondsSinceLoad} giây`],
  ];
  if (report.stack) lines.push(["Chi tiết kỹ thuật", report.stack]);
  return lines;
}

/**
 * Read the environment in the browser. Never throws: each piece falls back to unknown.
 * @returns The page's environment
 */
export function readReportEnv(): ReportEnv {
  const nav = navigator as Navigator & {
    connection?: { effectiveType?: string; saveData?: boolean };
  };
  const support = checkCurrentBrowserSupport();
  const entry = document.querySelector<HTMLScriptElement>('script[type="module"][src]');
  const card = document.querySelector<HTMLElement>(".vocab-slot[data-current] .vocab-card");
  const effective = nav.connection?.effectiveType;
  return {
    online: nav.onLine !== false,
    translated: /\btranslated-(ltr|rtl)\b/.test(document.documentElement.className),
    browserIssues: support.supported ? [] : support.issues.map((issue) => issue.id),
    browserLabel: support.detectedLabel,
    storage: probeLocalStorage(),
    route: window.location.pathname,
    stage: card?.dataset.stage ?? null,
    build: entry ? (entry.src.split("/").pop() ?? "") : "",
    userAgent: nav.userAgent,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    dpr: Math.round((window.devicePixelRatio || 1) * 100) / 100,
    touch: nav.maxTouchPoints > 0,
    language: nav.language || "",
    network: effective
      ? `${effective}${nav.connection?.saveData ? ", tiết kiệm dữ liệu" : ""}`
      : "không rõ",
    secondsSinceLoad: performance.now() / 1000,
  };
}
