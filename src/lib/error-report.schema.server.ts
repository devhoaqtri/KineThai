import { z } from "zod";
import { ERROR_REPORT_LIMITS } from "./error-report";

const text = (max: number) => z.string().max(max);

export const errorReportSchema = z.object({
  caseId: text(64),
  errorName: text(ERROR_REPORT_LIMITS.text),
  message: text(ERROR_REPORT_LIMITS.message),
  stack: text(ERROR_REPORT_LIMITS.stack),
  route: text(ERROR_REPORT_LIMITS.text),
  stage: text(32).nullable(),
  build: text(ERROR_REPORT_LIMITS.text),
  userAgent: text(ERROR_REPORT_LIMITS.message),
  viewport: text(32),
  dpr: z.number().min(0).max(16),
  touch: z.boolean(),
  language: text(32),
  network: text(32),
  online: z.boolean(),
  storage: z.enum(["ok", "blocked", "full"]),
  translated: z.boolean(),
  browserIssues: text(ERROR_REPORT_LIMITS.text),
  secondsSinceLoad: z.number().min(0).max(1e7),
  note: text(ERROR_REPORT_LIMITS.note),
});