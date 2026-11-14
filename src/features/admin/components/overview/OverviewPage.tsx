/**
 * Overview section: every live operating number on one screen, as small tiles.
 *
 * No charts: the old 7-day sparklines drew three mostly empty plot areas for a
 * handful of points. Each group polls on its own interval, so the page stays
 * current without a reload. Only measured values are shown: the health snapshot's
 * uptime and p95 are derived from its status and a single ping, so they are left out.
 *
 * Exports: OverviewPage
 * Depends on: admin queries (health, session health, rollups, errors, events, word reports)
 */

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import {
  adminErrorsQueryOptions,
  adminEventsQueryOptions,
  adminHealthQueryOptions,
  adminRollupsQueryOptions,
  adminSessionHealthQueryOptions,
  adminWordReportsQueryOptions,
} from "../../api/queries";
import { useAdminMode, useAdminSearchRange } from "../../hooks/useAdminMode";
import type { AdminRangePreset } from "../../lib/date-range";
import type { SystemHealthStatus } from "../../types/telemetry";

/** Rollups are cached for a minute elsewhere; the overview keeps them moving. */
const ROLLUP_REFRESH_MS = 30_000;
const RECENT_EVENTS = 8;

const RANGE_LABEL: Record<AdminRangePreset, string> = {
  "24h": "last 24h",
  "7d": "last 7 days",
  "30d": "last 30 days",
  custom: "selected range",
};

const STATUS_STYLE: Record<SystemHealthStatus, { dot: string; label: string }> = {
  operational: { dot: "bg-emerald-500", label: "Operational" },
  degraded: { dot: "bg-amber-400", label: "Degraded" },
  partial_outage: { dot: "bg-orange-500", label: "Partial outage" },
  major_outage: { dot: "bg-red-600", label: "Major outage" },
};

type Tone = "default" | "warn" | "bad";

/**
 * Admin overview landing page.
 * @returns overview UI
 */
export function OverviewPage(): React.ReactElement {
  const search = useRouterState({
    select: (s) =>
      (s.location.search ?? {}) as { range?: AdminRangePreset; from?: string; to?: string },
  });
  const mode = useAdminMode();
  const { from, to, preset } = useAdminSearchRange(search);

  const health = useQuery(adminHealthQueryOptions(mode));
  const sessions = useQuery(adminSessionHealthQueryOptions(from, to, mode));
  const rollups = useQuery({
    ...adminRollupsQueryOptions(from, to, mode),
    refetchInterval: ROLLUP_REFRESH_MS,
  });
  const openErrors = useQuery(adminErrorsQueryOptions(from, to, mode, "new"));
  const events = useQuery(adminEventsQueryOptions(from, to, mode));
  const wordReports = useQuery(adminWordReportsQueryOptions());

  const totals = (rollups.data ?? []).reduce(
    (acc, r) => {
      acc.newUsers += r.new_users;
      acc.activeUsers += r.active_users;
      acc.content += r.content_created;
      acc.contentUpdated += r.content_updated;
      acc.links += r.links_created;
      acc.linkTaps += r.link_interactions;
      acc.errors += r.errors_total;
      acc.critical += r.errors_critical;
      return acc;
    },
    {
      newUsers: 0,
      activeUsers: 0,
      content: 0,
      contentUpdated: 0,
      links: 0,
      linkTaps: 0,
      errors: 0,
      critical: 0,
    },
  );

  const snap = health.data;
  const visits = sessions.data;
  const status = snap ? STATUS_STYLE[snap.status] : null;
  const updatedAt = Math.max(
    health.dataUpdatedAt,
    sessions.dataUpdatedAt,
    rollups.dataUpdatedAt,
    openErrors.dataUpdatedAt,
    events.dataUpdatedAt,
  );
  const openErrorCount = openErrors.data
    ? `${openErrors.data.items.length}${openErrors.data.nextCursor ? "+" : ""}`
    : null;
  const rangeLabel = RANGE_LABEL[preset];

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-lg font-semibold">Live numbers</h2>
        <UpdatedAgo at={updatedAt} />
      </div>

      <Group title="Right now" note="every 15s">
        <Tile
          label="Status"
          value={
            status ? (
              <span className="flex items-center gap-1.5">
                <span className={`size-2 rounded-full ${status.dot}`} aria-hidden />
                {status.label}
              </span>
            ) : null
          }
          small
          state={health}
        />
        <Tile
          label="DB ping"
          value={snap ? `${snap.p50_latency_ms} ms` : null}
          tone={snap && snap.p50_latency_ms > 800 ? "warn" : "default"}
          state={health}
        />
        <Tile
          label="Errors · 5 min"
          value={snap?.errors_5m ?? null}
          tone={(snap?.errors_5m ?? 0) > 0 ? "bad" : "default"}
          state={health}
        />
        <Tile label="Content queue" value={snap?.queue_depth ?? null} state={health} />
        <Tile
          label="New error reports"
          value={openErrorCount}
          tone={openErrors.data?.items.length ? "bad" : "default"}
          state={openErrors}
        />
        <Tile
          label="Word reports open"
          value={wordReports.data?.openTotal ?? null}
          tone={wordReports.data?.openTotal ? "warn" : "default"}
          state={wordReports}
        />
        <Tile
          label="Words hidden"
          value={wordReports.data?.urgentTotal ?? null}
          tone={wordReports.data?.urgentTotal ? "bad" : "default"}
          state={wordReports}
        />
      </Group>

      <Group title="Visitors" note={`${rangeLabel} · every 30s`}>
        <Tile label="Unique visitors" value={visits?.uniqueVisitors ?? null} state={sessions} />
        <Tile label="Visits" value={visits?.sessionDays ?? null} state={sessions} />
        <Tile label="Feed loads" value={visits?.totalLoads ?? null} state={sessions} />
        <Tile
          label="Feed failures"
          value={visits?.totalFailures ?? null}
          tone={(visits?.totalFailures ?? 0) > 0 ? "bad" : "default"}
          state={sessions}
        />
        <Tile
          label="Failure rate"
          value={visits ? formatPct(visits.failureRate) : null}
          tone={(visits?.failureRate ?? 0) > 0.02 ? "bad" : "default"}
          state={sessions}
        />
        <Tile
          label="Session errors"
          value={visits?.totalErrors ?? null}
          tone={(visits?.totalErrors ?? 0) > 0 ? "warn" : "default"}
          state={sessions}
        />
        <Tile
          label="Visitors hit an error"
          value={visits?.sessionsWithErrors ?? null}
          state={sessions}
        />
      </Group>

      <Group title="Activity" note={`${rangeLabel} · every 30s`}>
        <Tile label="New users" value={rollups.data ? totals.newUsers : null} state={rollups} />
        <Tile
          label="Active users (sum of days)"
          value={rollups.data ? totals.activeUsers : null}
          state={rollups}
        />
        <Tile
          label="Content created"
          value={rollups.data ? totals.content : null}
          state={rollups}
        />
        <Tile
          label="Content updated"
          value={rollups.data ? totals.contentUpdated : null}
          state={rollups}
        />
        <Tile label="Links created" value={rollups.data ? totals.links : null} state={rollups} />
        <Tile label="Link taps" value={rollups.data ? totals.linkTaps : null} state={rollups} />
        <Tile
          label="Errors"
          value={rollups.data ? totals.errors : null}
          tone={totals.errors > 0 ? "warn" : "default"}
          state={rollups}
        />
        <Tile
          label="Critical errors"
          value={rollups.data ? totals.critical : null}
          tone={totals.critical > 0 ? "bad" : "default"}
          state={rollups}
        />
      </Group>

      <div className="grid gap-5 md:grid-cols-2">
        <ListSection title="Top visitor errors" empty="No visitor errors in this range">
          {(visits?.topErrors ?? []).map((err, i) => (
            <li key={i} className="flex items-baseline justify-between gap-3 px-3 py-1.5 text-xs">
              <span className="min-w-0 truncate text-muted-foreground" title={err.message}>
                {err.message}
              </span>
              <span className="shrink-0 font-medium tabular-nums">{err.count}</span>
            </li>
          ))}
        </ListSection>
        <ListSection title="Latest events" empty="No events in this range">
          {(events.data?.items ?? []).slice(0, RECENT_EVENTS).map((ev) => (
            <li
              key={ev.id}
              className="flex items-baseline justify-between gap-3 px-3 py-1.5 text-xs"
            >
              <span className="min-w-0 truncate">
                <span className="font-medium">{ev.event_type}</span>
                {ev.entity_type ? (
                  <span className="text-muted-foreground"> · {ev.entity_type}</span>
                ) : null}
              </span>
              <time
                className="shrink-0 tabular-nums text-muted-foreground"
                dateTime={ev.occurred_at}
                title={new Date(ev.occurred_at).toLocaleString()}
              >
                {formatAgo(Date.parse(ev.occurred_at))}
              </time>
            </li>
          ))}
        </ListSection>
      </div>
    </div>
  );
}

type QueryState = { isLoading: boolean; isError: boolean };

function Group(props: { title: string; note: string; children: React.ReactNode }) {
  return (
    <section aria-label={props.title}>
      <div className="mb-2 flex items-baseline gap-2">
        <h3 className="text-sm font-medium">{props.title}</h3>
        <span className="text-xs text-muted-foreground">{props.note}</span>
      </div>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">{props.children}</dl>
    </section>
  );
}

function Tile(props: {
  label: string;
  value: React.ReactNode;
  state: QueryState;
  tone?: Tone;
  small?: boolean;
}): React.ReactElement {
  const tone = props.tone ?? "default";
  const toneClass =
    tone === "bad" ? "text-red-500" : tone === "warn" ? "text-amber-500" : "text-foreground";
  let body: React.ReactNode;
  if (props.value != null) body = props.value;
  else if (props.state.isError) body = <span className="text-sm text-red-500">unavailable</span>;
  else if (props.state.isLoading)
    body = <span className="inline-block h-5 w-10 animate-pulse rounded bg-muted" aria-busy />;
  else body = "—";
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <dt className="truncate text-[11px] text-muted-foreground">{props.label}</dt>
      <dd
        className={`mt-0.5 font-semibold tabular-nums ${props.small ? "text-sm leading-7" : "text-xl"} ${toneClass}`}
      >
        {body}
      </dd>
    </div>
  );
}

function ListSection(props: { title: string; empty: string; children: React.ReactNode[] }) {
  return (
    <section aria-label={props.title}>
      <h3 className="mb-2 text-sm font-medium">{props.title}</h3>
      {props.children.length === 0 ? (
        <p className="text-xs text-muted-foreground">{props.empty}</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">{props.children}</ul>
      )}
    </section>
  );
}

/** Ticks every few seconds so "updated" stays honest between polls. */
function UpdatedAgo(props: { at: number }): React.ReactElement | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 5_000);
    return () => window.clearInterval(id);
  }, []);
  if (!props.at) return null;
  return (
    <p className="text-xs text-muted-foreground">
      Updated {formatAgo(props.at, Math.max(now, props.at))}
    </p>
  );
}

function formatPct(ratio: number): string {
  const pct = ratio * 100;
  return `${pct === 0 ? "0" : pct < 10 ? pct.toFixed(1) : Math.round(pct)}%`;
}

function formatAgo(at: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
