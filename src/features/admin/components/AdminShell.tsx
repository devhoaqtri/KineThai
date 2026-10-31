/**
 * Admin dashboard chrome: left nav + top bar with date range and live indicator.
 *
 * Exports: AdminShell
 * Depends on: outlet, DateRangeBar, LiveIndicator, critical error badge
 */

import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { DateRangeBar } from "./DateRangeBar";
import { LiveIndicator } from "./LiveIndicator";
import { useAdminMode, useAdminSearchRange } from "../hooks/useAdminMode";
import {
  adminErrorsQueryOptions,
  adminHealthQueryOptions,
  adminWordReportsQueryOptions,
} from "../api/queries";
import type { AdminRangePreset } from "../lib/date-range";
import { useAdminSse } from "../hooks/useAdminSse";

const NAV: { to: string; label: string; exact?: boolean }[] = [
  { to: "/admin", label: "Overview", exact: true },
  { to: "/admin/users", label: "Users" },
  { to: "/admin/content", label: "Content" },
  { to: "/admin/library", label: "Word library" },
  { to: "/admin/vocabulary", label: "Vocabulary" },
  { to: "/admin/wordings", label: "Câu chữ" },
  { to: "/admin/reports", label: "Word reports" },
  { to: "/admin/templates", label: "Templates" },
  { to: "/admin/palettes", label: "Palettes" },
  { to: "/admin/model", label: "Model" },
  { to: "/admin/ambient", label: "Ambient" },
  { to: "/admin/links", label: "Links" },
  { to: "/admin/errors", label: "Errors" },
  { to: "/admin/system", label: "System" },
];

type AdminSearch = {
  range?: AdminRangePreset;
  from?: string;
  to?: string;
  app?: string;
};

/**
 * Layout shell for all /admin/* pages.
 * @returns admin chrome with outlet
 */
export function AdminShell(): React.ReactElement {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({
    select: (s) => (s.location.search ?? {}) as AdminSearch,
  });
  const mode = useAdminMode();
  const { from, to, preset } = useAdminSearchRange(search);
  const healthQuery = useQuery(adminHealthQueryOptions(mode));
  const errorsQuery = useQuery(adminErrorsQueryOptions(from, to, mode, "new"));
  // Open word reports from readers, so new ones are visible from any admin page.
  const wordReportsQuery = useQuery(adminWordReportsQueryOptions());
  const openWordReports = wordReportsQuery.data?.openTotal ?? 0;
  const hiddenWords = wordReportsQuery.data?.urgentTotal ?? 0;
  const sse = useAdminSse(mode);
  const [lastUpdatedAt] = useState(() => Date.now());
  const updatedAt = healthQuery.dataUpdatedAt || lastUpdatedAt;

  const criticalCount = useMemo(
    () =>
      (errorsQuery.data?.items ?? []).filter((e) => e.severity === "critical" || e.status === "new")
        .length,
    [errorsQuery.data],
  );

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-muted/30 p-4">
        <div className="mb-6">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Admin</p>
          <h1 className="text-lg font-semibold">kinetic-canvas</h1>
        </div>
        <nav className="flex flex-col gap-1" aria-label="Admin sections">
          {NAV.map((item) => {
            const active = item.exact
              ? pathname === item.to
              : pathname === item.to || pathname.startsWith(`${item.to}/`);
            return (
              <Link
                key={item.to}
                to={item.to}
                search={{ range: preset, app: "kinetic-canvas" }}
                className={`rounded-md px-3 py-2 text-sm ${
                  active ? "bg-foreground text-background" : "hover:bg-muted"
                }`}
              >
                {item.label}
                {item.to === "/admin/errors" && criticalCount > 0 ? (
                  <span className="ml-2 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] text-white">
                    {criticalCount}
                  </span>
                ) : null}
                {item.to === "/admin/reports" && hiddenWords > 0 ? (
                  <span className="ml-2 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] text-white">
                    {hiddenWords}
                  </span>
                ) : null}
                {item.to === "/admin/reports" && openWordReports > 0 ? (
                  <span className="ml-2 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] text-black">
                    {openWordReports}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
        <Link to="/feed" className="mt-auto text-xs text-muted-foreground hover:underline">
          ← Back to app
        </Link>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-3">
          <DateRangeBar preset={preset} from={from} to={to} basePath={pathname} />
          <LiveIndicator lastUpdatedAt={updatedAt} sseConnected={sse.connected} />
        </header>
        <main className="flex-1 overflow-auto px-6 py-5">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
