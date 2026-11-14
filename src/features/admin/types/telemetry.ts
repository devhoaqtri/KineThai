/**
 * Canonical telemetry contract types for kinetic-canvas admin.
 *
 * Exports: APP_ID, TELEMETRY_EVENT_TYPES, VISITOR_EVENT_TYPES, TelemetryEventType,
 *   TelemetrySeverity, TelemetryEvent, DailyRollup, SystemHealthSnapshot,
 *   SystemHealthStatus, ErrorReportStatus, AdminErrorReport, SessionHealthSummary
 * Depends on: none
 */

export const APP_ID = "kinetic-canvas" as const;

/**
 * Every event type the system accepts. This list is mirrored by the
 * `telemetry_events_event_type_check` constraint in Postgres; adding a member here
 * without a migration makes live inserts of it fail the constraint.
 */
export const TELEMETRY_EVENT_TYPES = [
  "user.registered",
  "content.created",
  "content.updated",
  "content.deleted",
  "link.created",
  "link.interacted",
  "error.reported",
  "system.heartbeat",
  "page.loaded",
  "page.failed",
  "session.error",
] as const;

export type TelemetryEventType = (typeof TELEMETRY_EVENT_TYPES)[number];

/** The subset a browser may report about itself through the public ingest route. */
export const VISITOR_EVENT_TYPES = ["page.loaded", "page.failed", "session.error"] as const;

export type TelemetrySeverity = "info" | "warn" | "error" | "critical";

export type TelemetryEvent = {
  id: string;
  app_id: string;
  event_type: TelemetryEventType;
  occurred_at: string;
  actor_user_id?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  metadata: Record<string, string | number | boolean | null>;
  severity?: TelemetrySeverity | null;
};

export type DailyRollup = {
  app_id: string;
  date: string;
  new_users: number;
  active_users: number;
  content_created: number;
  content_updated: number;
  links_created: number;
  link_interactions: number;
  errors_total: number;
  errors_critical: number;
};

export type SystemHealthStatus = "operational" | "degraded" | "partial_outage" | "major_outage";

export type SystemHealthSnapshot = {
  app_id: string;
  captured_at: string;
  status: SystemHealthStatus;
  uptime_pct_24h: number;
  p50_latency_ms: number;
  p95_latency_ms: number;
  error_rate_pct: number;
  /** `error.reported` events counted in the last five minutes (returned, not stored). */
  errors_5m?: number;
  queue_depth?: number;
  db_connections_used?: number;
  db_connections_max?: number;
};

/**
 * Visitor-session metrics for a date range, aggregated in the database.
 *
 * `uniqueVisitors` counts distinct sessions; `sessionDays` counts session-days, so a
 * visitor returning on three days is 1 visitor and 3 session-days.
 */
export type SessionHealthSummary = {
  uniqueVisitors: number;
  sessionDays: number;
  sessionsWithErrors: number;
  totalLoads: number;
  totalFailures: number;
  totalErrors: number;
  failureRate: number;
  topErrors: Array<{ message: string; count: number }>;
};

export type ErrorReportStatus = "new" | "acknowledged" | "resolved";

export type AdminErrorReport = {
  id: string;
  event_id: string | null;
  app_id: string;
  status: ErrorReportStatus;
  message: string;
  severity: TelemetrySeverity;
  actor_user_id: string | null;
  metadata: Record<string, string | number | boolean | null>;
  created_at: string;
  updated_at: string;
  resolved_by: string | null;
  resolved_at: string | null;
};
