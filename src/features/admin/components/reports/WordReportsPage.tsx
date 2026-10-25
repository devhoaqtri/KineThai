/**
 * Admin page for anonymous word reports: which cards readers flagged, what they
 * said was wrong, and the card's current text — so a report can be judged and
 * closed without hunting for the word first.
 *
 * Exports: WordReportsPage
 * Depends on: TanStack Query/Router, word-report server functions, report reasons
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Check, Pencil, RotateCcw, TriangleAlert } from "lucide-react";
import { getReportReason, isSevereReason } from "@/features/vocabulary/lib/word-report";
import { adminKeys } from "../../api/keys";
import { adminWordReportsQueryOptions } from "../../api/queries";
import { updateWordReports, type WordReportGroup } from "../../api/word-report.functions";

const STAGE_LABELS: Record<string, string> = {
  lead: "opening clue",
  definition: "meaning clue",
  letters: "letter count",
  usage: "example sentence",
  anticipation: "teaser",
  reveal: "answer",
  spelling: "spelling",
};

/** Deck text carries /emphasis/ markers; show the sentence a reader actually saw. */
const plain = (text: string) => text.replace(/\/([^/]+)\//g, "$1");

function formatWhen(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Word reports admin section.
 * @returns reports UI
 */
export function WordReportsPage(): React.ReactElement {
  const queryClient = useQueryClient();
  const reports = useQuery(adminWordReportsQueryOptions());
  const [showResolved, setShowResolved] = useState(false);

  const mutation = useMutation({
    mutationFn: (input: { ids: string[]; status: "new" | "resolved" }) =>
      updateWordReports({ data: input }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: adminKeys.wordReports() }),
  });

  const groups = reports.data?.groups ?? [];
  const open = groups.filter((group) => group.openCount > 0);
  const closed = groups.filter((group) => group.openCount === 0);
  const visible = showResolved ? [...open, ...closed] : open;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Word reports</h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Anonymous reports sent from the flag in the corner of a feed card. Readers pick from
            fixed reasons — there is no free text and nothing identifying is stored.
            {reports.data && (
              <>
                {" "}
                {reports.data.openTotal} open across {open.length} word
                {open.length === 1 ? "" : "s"}.
              </>
            )}
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={showResolved}
            onChange={(event) => setShowResolved(event.target.checked)}
          />
          Show resolved ({closed.length})
        </label>
      </div>

      {reports.data?.store === "file" && (
        <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          Reading the local file <code>src/features/vocabulary/data/word-reports.json</code> — this
          server has no Supabase service key, so it only sees reports filed against this machine.
          The deployed app stores and shows its own.
        </p>
      )}
      {reports.isError && (
        <p className="rounded bg-red-500/10 px-3 py-2 text-sm text-red-500">
          Could not load reports: {reports.error.message}
        </p>
      )}
      {mutation.isError && (
        <p className="rounded bg-red-500/10 px-3 py-2 text-sm text-red-500">
          Could not update: {mutation.error.message}
        </p>
      )}

      {reports.isLoading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
      ) : visible.length === 0 ? (
        <p className="rounded-lg border border-border py-12 text-center text-sm text-muted-foreground">
          {groups.length === 0 ? "No reports yet." : "Nothing open — every report is resolved."}
        </p>
      ) : (
        <ul className="space-y-3">
          {visible.map((group) => (
            <ReportCard
              key={group.wordId}
              group={group}
              pending={mutation.isPending}
              onResolve={() => mutation.mutate({ ids: group.openIds, status: "resolved" })}
              onReopen={() => mutation.mutate({ ids: group.resolvedIds, status: "new" })}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ReportCard({
  group,
  pending,
  onResolve,
  onReopen,
}: {
  group: WordReportGroup;
  pending: boolean;
  onResolve: () => void;
  onReopen: () => void;
}): React.ReactElement {
  const isOpen = group.openCount > 0;
  // Flagged "nhạy cảm" / "không ổn": the queue already puts these first; the card says why.
  const severe = isOpen && group.severeCount > 0;
  return (
    <li
      className={`rounded-lg border p-4 ${
        severe ? "border-red-500/50 bg-red-500/5" : "border-border"
      } ${isOpen ? (severe ? "" : "bg-muted/20") : "opacity-70"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="text-lg font-semibold">{group.word}</h3>
            {group.entry && (
              <span className="text-xs text-muted-foreground">
                {[group.entry.ipa, group.entry.pos, group.entry.level].filter(Boolean).join(" · ")}
              </span>
            )}
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                isOpen ? "bg-amber-500/15 text-amber-500" : "bg-green-500/15 text-green-500"
              }`}
            >
              {isOpen ? `${group.openCount} open` : `${group.resolvedCount} resolved`}
            </span>
            {severe && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold text-red-500">
                <TriangleAlert size={11} aria-hidden="true" /> Priority · {group.severeCount}{" "}
                flagged
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Latest {formatWhen(group.latestAt)}
            {isOpen && group.resolvedCount > 0 ? ` · ${group.resolvedCount} resolved earlier` : ""}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link
            to="/admin/vocabulary"
            search={{ range: "30d", app: "kinetic-canvas", q: group.word }}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-muted"
          >
            <Pencil size={13} /> Edit word
          </Link>
          {isOpen ? (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-2.5 py-1.5 text-xs font-medium text-background disabled:opacity-40"
              onClick={onResolve}
              disabled={pending}
            >
              <Check size={13} /> Mark resolved
            </button>
          ) : (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-muted disabled:opacity-40"
              onClick={onReopen}
              disabled={pending}
            >
              <RotateCcw size={13} /> Reopen
            </button>
          )}
        </div>
      </div>

      {isOpen && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {group.reasons.map((reason) => (
            <span
              key={reason.id}
              className={`rounded-full border px-2.5 py-1 text-xs ${
                isSevereReason(reason.id)
                  ? "border-red-500/50 bg-red-500/10 font-medium text-red-500"
                  : "border-border bg-background"
              }`}
            >
              {getReportReason(reason.id)?.en ?? reason.id}
              <strong className="ml-1.5 tabular-nums">×{reason.count}</strong>
            </span>
          ))}
        </div>
      )}
      {isOpen && group.stages.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          Filed while on:{" "}
          {group.stages
            .map((stage) => `${STAGE_LABELS[stage.id] ?? stage.id} (${stage.count})`)
            .join(", ")}
        </p>
      )}

      {group.entry ? (
        <dl className="mt-3 grid gap-x-6 gap-y-1.5 border-t border-border/60 pt-3 text-sm sm:grid-cols-[7rem_1fr]">
          <Field label="Opening clue" value={plain(group.entry.leadVi)} />
          <Field label="Meaning" value={plain(group.entry.defVi)} />
          <Field label="Example" value={plain(group.entry.usageEn)} />
          <Field label="Teaser" value={plain(group.entry.anticipateVi)} />
        </dl>
      ) : (
        <p className="mt-3 border-t border-border/60 pt-3 text-xs text-muted-foreground">
          This word is not in the catalog on this server (it may have been removed or renamed).
        </p>
      )}
    </li>
  );
}

function Field({ label, value }: { label: string; value: string }): React.ReactElement | null {
  if (!value) return null;
  return (
    <>
      <dt className="text-xs text-muted-foreground sm:pt-0.5">{label}</dt>
      <dd>{value}</dd>
    </>
  );
}
