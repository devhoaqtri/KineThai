/**
 * Admin page for anonymous word reports, one tab per language: which cards readers
 * flagged, what they said was wrong, and the card's current text — so a report can be
 * judged and closed without hunting for the word first. Words the feed has hidden sit in
 * their own Urgent section at the top.
 *
 * Exports: WordReportsPage
 * Depends on: TanStack Query/Router, word-report server functions, report reasons
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Check, EyeOff, Pencil, RotateCcw, TriangleAlert } from "lucide-react";
import {
  BLOCK_AFTER_DISTINCT_REPORTERS,
  BLOCK_AFTER_SEVERE_REPORTERS,
} from "@/features/vocabulary/lib/word-block";
import type { TargetLocale } from "@/features/vocabulary/lib/target-language";
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

const LANGUAGE_LABELS: Record<TargetLocale, string> = {
  en: "English",
  zh: "Chinese",
  ko: "Korean",
  ja: "Japanese",
  fr: "French",
  de: "German",
  es: "Spanish",
};

/** Deck text carries layout marks (`/emphasis/`, `|`, `=`); show the sentence a reader saw. */
const plain = (text: string) =>
  text
    .replace(/\/([^/]+)\//g, "$1")
    .replace(/\s*\|\s*/g, " ")
    .replace(/=/g, " ");

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
  const [picked, setPicked] = useState<TargetLocale | null>(null);
  const [showResolved, setShowResolved] = useState(false);

  const mutation = useMutation({
    mutationFn: (input: { ids: string[]; status: "new" | "resolved" }) =>
      updateWordReports({ data: input }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: adminKeys.wordReports() }),
  });

  const decks = reports.data?.decks ?? [];
  // Open on whichever language needs attention most, until the admin picks one.
  const locale =
    picked ??
    decks.find((deck) => deck.urgent > 0)?.locale ??
    decks.find((deck) => deck.open > 0)?.locale ??
    "en";
  const groups = (reports.data?.groups ?? []).filter((group) => group.locale === locale);
  const urgent = groups.filter((group) => group.hidden);
  const open = groups.filter((group) => group.openCount > 0 && !group.hidden);
  const closed = groups.filter((group) => group.openCount === 0);

  const list = (items: WordReportGroup[]) => (
    <ul className="space-y-3">
      {items.map((group) => (
        <ReportCard
          key={group.wordId}
          group={group}
          pending={mutation.isPending}
          onResolve={() => mutation.mutate({ ids: group.openIds, status: "resolved" })}
          onReopen={() => mutation.mutate({ ids: group.resolvedIds, status: "new" })}
        />
      ))}
    </ul>
  );

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
                {reports.data.openTotal} open, {reports.data.urgentTotal} hidden from the feed.
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

      {decks.length > 0 && (
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Language">
          {decks.map((deck) => (
            <button
              key={deck.locale}
              type="button"
              role="tab"
              aria-selected={deck.locale === locale}
              className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm ${
                deck.locale === locale
                  ? "border-foreground bg-foreground text-background"
                  : "border-border hover:bg-muted"
              }`}
              onClick={() => setPicked(deck.locale)}
            >
              {LANGUAGE_LABELS[deck.locale]}
              {deck.urgent > 0 && (
                <span className="rounded-full bg-red-600 px-1.5 text-[11px] text-white tabular-nums">
                  {deck.urgent}
                </span>
              )}
              {deck.open > 0 && (
                <span className="text-xs tabular-nums opacity-70">{deck.open}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {reports.isLoading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          {urgent.length > 0 && (
            <section className="space-y-3" aria-label="Urgent">
              <div>
                <h3 className="flex items-center gap-1.5 text-sm font-semibold text-red-500">
                  <EyeOff size={14} aria-hidden="true" /> Urgent · {urgent.length} hidden from the
                  feed
                </h3>
                <p className="text-xs text-muted-foreground">
                  Hidden once {BLOCK_AFTER_SEVERE_REPORTERS} readers pick a critical chip, or{" "}
                  {BLOCK_AFTER_DISTINCT_REPORTERS} report it for any reason. Resolving brings the
                  word back.
                </p>
              </div>
              {list(urgent)}
            </section>
          )}
          {open.length > 0 && (
            <section className="space-y-3" aria-label="Waiting">
              {urgent.length > 0 && <h3 className="text-sm font-semibold">Still in the feed</h3>}
              {list(open)}
            </section>
          )}
          {urgent.length + open.length === 0 && (
            <p className="rounded-lg border border-border py-12 text-center text-sm text-muted-foreground">
              {groups.length === 0
                ? `No ${LANGUAGE_LABELS[locale]} reports yet.`
                : "Nothing open — every report is resolved."}
            </p>
          )}
          {showResolved && closed.length > 0 && list(closed)}
        </>
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
              {isOpen
                ? `${group.openCount} open${
                    group.readers > 0
                      ? ` · ${group.readers} reader${group.readers === 1 ? "" : "s"}`
                      : ""
                  }`
                : `${group.resolvedCount} resolved`}
            </span>
            {group.hidden && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                <EyeOff size={11} aria-hidden="true" /> Hidden
              </span>
            )}
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
          {group.locale === "en" && (
            <Link
              to="/admin/vocabulary"
              search={{ range: "30d", app: "kinetic-canvas", q: group.word }}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-muted"
            >
              <Pencil size={13} /> Edit word
            </Link>
          )}
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
