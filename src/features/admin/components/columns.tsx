/**
 * Column definitions for admin Users / Content / Links / Errors tables.
 *
 * Exports: userColumns, contentColumns, linkColumns, createErrorColumns
 * Depends on: telemetry types, @tanstack/react-table
 */

import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import type { AdminErrorReport, ErrorReportStatus, TelemetryEvent } from "../types/telemetry";

export type UserRow = {
  id: string;
  user_id: string;
  app_id: string;
  registered_at: string;
  source: string;
};

export type ContentRow = {
  id: string;
  entity_type: string;
  entity_id: string;
  created_by: string;
  created_at: string;
  isPost: boolean;
};

export type LinkRow = {
  link_id: string;
  created_by: string | null;
  created_at: string;
  interactions: number;
  last?: string;
};

const userHelper = createColumnHelper<UserRow>();
const contentHelper = createColumnHelper<ContentRow>();
const linkHelper = createColumnHelper<LinkRow>();
const errorHelper = createColumnHelper<AdminErrorReport>();

/** Columns for new-user registration table. */
export const userColumns = [
  userHelper.accessor("user_id", {
    header: "user_id",
    cell: (info) => <span className="font-mono text-xs">{info.getValue()}</span>,
  }),
  userHelper.accessor("app_id", { header: "app" }),
  userHelper.accessor("registered_at", {
    header: "registered_at",
    cell: (info) => new Date(info.getValue()).toLocaleString(),
  }),
  userHelper.accessor("source", { header: "source" }),
] as ColumnDef<UserRow>[];

/** Columns for content-created table. */
export const contentColumns = [
  contentHelper.accessor("entity_type", { header: "entity_type" }),
  contentHelper.accessor("entity_id", {
    header: "entity_id",
    cell: (info) => {
      const row = info.row.original;
      if (row.isPost && row.entity_id !== "—") {
        return (
          <a className="text-sky-700 underline" href={`/p/${row.entity_id}`}>
            {row.entity_id.slice(0, 8)}…
          </a>
        );
      }
      return <span className="font-mono text-xs">{row.entity_id}</span>;
    },
  }),
  contentHelper.accessor("created_by", {
    header: "created_by",
    cell: (info) => <span className="font-mono text-xs">{info.getValue()}</span>,
  }),
  contentHelper.accessor("created_at", {
    header: "created_at",
    cell: (info) => new Date(info.getValue()).toLocaleString(),
  }),
] as ColumnDef<ContentRow>[];

/** Columns for links & interactions table. */
export const linkColumns = [
  linkHelper.accessor("link_id", {
    header: "link",
    cell: (info) => (
      <a className="text-sky-700 underline" href={`/p/${info.getValue()}`}>
        /p/{info.getValue().slice(0, 8)}…
      </a>
    ),
  }),
  linkHelper.accessor("created_by", {
    header: "created_by",
    cell: (info) => <span className="font-mono text-xs">{info.getValue() ?? "—"}</span>,
  }),
  linkHelper.accessor("created_at", {
    header: "created_at",
    cell: (info) => new Date(info.getValue()).toLocaleString(),
  }),
  linkHelper.accessor("interactions", {
    header: "interactions",
    cell: (info) => <span className="tabular-nums">{info.getValue()}</span>,
  }),
  linkHelper.accessor("last", {
    header: "last",
    cell: (info) => {
      const v = info.getValue();
      return v ? new Date(v).toLocaleString() : "—";
    },
  }),
] as ColumnDef<LinkRow>[];

/**
 * Build error-report columns including status action buttons.
 * @param options.onStatus - callback when Ack/Resolve is clicked
 * @param options.pending - disable buttons while a mutation is in flight
 * @returns column defs
 */
export function createErrorColumns(options: {
  onStatus: (input: { id: string; status: ErrorReportStatus }) => void;
  pending: boolean;
}): ColumnDef<AdminErrorReport>[] {
  return [
    errorHelper.accessor("severity", { header: "severity" }),
    errorHelper.accessor("message", {
      header: "message",
      cell: (info) => <span className="max-w-xs truncate block">{info.getValue()}</span>,
    }),
    // Reader error reports and word reports carry their content in metadata; the message
    // alone is one truncated line.
    errorHelper.display({
      id: "details",
      header: "details",
      cell: (info) => {
        const entries = Object.entries(info.row.original.metadata ?? {}).filter(
          ([, value]) => value !== null && value !== "",
        );
        if (!entries.length) return null;
        return (
          <details className="max-w-md text-xs">
            <summary className="cursor-pointer text-muted-foreground">
              {String(info.row.original.metadata?.kind ?? "metadata")}
            </summary>
            <dl className="mt-1 space-y-1">
              {entries.map(([key, value]) => (
                <div key={key}>
                  <dt className="font-semibold">{key}</dt>
                  <dd className="whitespace-pre-wrap break-words font-mono">{String(value)}</dd>
                </div>
              ))}
            </dl>
          </details>
        );
      },
    }),
    errorHelper.accessor("status", { header: "status" }),
    errorHelper.accessor("created_at", {
      header: "when",
      cell: (info) => <span className="text-xs">{new Date(info.getValue()).toLocaleString()}</span>,
    }),
    errorHelper.display({
      id: "actions",
      header: "actions",
      cell: (info) => {
        const e = info.row.original;
        return (
          <span className="space-x-1">
            {e.status === "new" ? (
              <button
                type="button"
                className="rounded bg-muted px-2 py-1 text-xs"
                disabled={options.pending}
                onClick={() => options.onStatus({ id: e.id, status: "acknowledged" })}
              >
                Ack
              </button>
            ) : null}
            {e.status !== "resolved" ? (
              <button
                type="button"
                className="rounded bg-foreground px-2 py-1 text-xs text-background"
                disabled={options.pending}
                onClick={() => options.onStatus({ id: e.id, status: "resolved" })}
              >
                Resolve
              </button>
            ) : null}
          </span>
        );
      },
    }),
  ] as ColumnDef<AdminErrorReport>[];
}

/**
 * Map a user.registered telemetry event to a table row.
 * @param e - telemetry event
 * @returns user row
 */
export function toUserRow(e: TelemetryEvent): UserRow {
  return {
    id: e.id,
    user_id: e.actor_user_id ?? "—",
    app_id: e.app_id,
    registered_at: e.occurred_at,
    source: String(e.metadata.username ?? "—"),
  };
}

/**
 * Map a content.* telemetry event to a table row.
 * @param e - telemetry event
 * @returns content row
 */
export function toContentRow(e: TelemetryEvent): ContentRow {
  return {
    id: e.id,
    entity_type: e.entity_type ?? "—",
    entity_id: e.entity_id ?? "—",
    created_by: e.actor_user_id ?? "—",
    created_at: e.occurred_at,
    isPost: e.entity_type === "post",
  };
}
