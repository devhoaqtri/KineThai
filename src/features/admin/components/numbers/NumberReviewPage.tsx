/**
 * The number review: the English deck's number words the scan could not settle, one card
 * each, decided with a tap.
 *
 * Each card shows the sentence as it reads now with the number words marked, the sentence
 * with digits, and why the scan left it. "Digits" writes the digits into the pack file at
 * once; "Words" keeps the words, and on a card already written it puts them back. A card
 * decided here stays in view until the filter changes, so a wrong tap is one more tap to
 * fix. On a keyboard: J/K or the arrows move, D picks digits, W picks words.
 *
 * Exports: NumberReviewPage
 * Depends on: TanStack Query/Router, number-review server functions
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, Check, Hash, Highlighter, Type } from "lucide-react";
import { adminKeys } from "../../api/keys";
import {
  decideNumberReview,
  type NumberChoice,
  type NumberReview,
  type NumberReviewItem,
} from "../../api/number-review.functions";
import { adminNumberReviewQueryOptions } from "../../api/queries";

type Filter = "open" | "number" | "word" | "all";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "open", label: "To decide" },
  { value: "number", label: "Digits" },
  { value: "word", label: "Words" },
  { value: "all", label: "All" },
];

const FIELD_LABELS: Record<string, string> = {
  meaningVi: "Meaning",
  defVi: "Definition",
  leadVi: "Lead",
  anticipateVi: "Anticipation",
};

const fieldLabel = (field: string) =>
  FIELD_LABELS[field] ?? (field.startsWith("usage") ? "Usage" : field);

/** Deck text as a reader sees it: joins as spaces, marks and phrase edges gone. */
const readable = (text: string) =>
  text
    .replace(/[_=]/g, " ")
    .replace(/\//g, "")
    .replace(/\s*\|\s*/g, " ");

/** A reason with its example dropped, so cards with the same doubt group together. */
const reasonGroup = (reason: string) =>
  reason
    .replace(/\s*\(.*?\)/g, "")
    .replace(/:.*$/, "")
    .trim();

const matches = (item: NumberReviewItem, filter: Filter) =>
  filter === "all" || (filter === "open" ? item.choice === null : item.choice === filter);

function Sentence({
  text,
  start,
  end,
  replacement,
  tone,
}: {
  text: string;
  start: number;
  end: number;
  replacement?: string;
  tone: "words" | "digits";
}): React.ReactElement {
  const marked = replacement ?? text.slice(start, end);
  return (
    <span>
      {readable(text.slice(0, start))}
      <mark
        className={`rounded px-1 font-semibold ${
          tone === "words"
            ? "bg-amber-400/25 text-amber-700 dark:text-amber-300"
            : "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
        }`}
      >
        {readable(marked)}
      </mark>
      {readable(text.slice(end))}
    </span>
  );
}

function ChoiceButton({
  active,
  disabled,
  onClick,
  icon,
  label,
  hint,
  tone,
}: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  hint: string;
  tone: "digits" | "words";
}): React.ReactElement {
  const activeClass =
    tone === "digits"
      ? "border-emerald-600 bg-emerald-600 text-white"
      : "border-foreground bg-foreground text-background";
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={`flex min-h-12 flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
        active ? activeClass : "border-border bg-background hover:bg-muted"
      }`}
    >
      {active ? <Check size={16} aria-hidden="true" /> : icon}
      <span>{label}</span>
      <span className="hidden text-xs opacity-60 sm:inline">{hint}</span>
    </button>
  );
}

function ReviewCard({
  item,
  index,
  active,
  writable,
  pending,
  error,
  onFocus,
  onChoose,
}: {
  item: NumberReviewItem;
  index: number;
  active: boolean;
  writable: boolean;
  pending: boolean;
  error: string | undefined;
  onFocus: () => void;
  onChoose: (choice: NumberChoice) => void;
}): React.ReactElement {
  const written = item.choice === "number";
  // A written card whose field moved on can no longer be undone from here.
  const locked = !writable || pending || (written && !item.current);
  return (
    <li
      id={`number-${index}`}
      onClick={onFocus}
      className={`scroll-mt-24 rounded-xl border bg-card p-4 transition-shadow ${
        active ? "border-foreground/40 shadow-md ring-2 ring-foreground/10" : "border-border"
      }`}
    >
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span className="text-sm font-semibold text-foreground">{item.word}</span>
        <span>{item.level}</span>
        <span>·</span>
        <span>{fieldLabel(item.field)}</span>
        {item.inMark && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-700 dark:text-amber-300">
            <Highlighter size={11} aria-hidden="true" /> In a highlight
          </span>
        )}
        <Link
          to="/admin/library"
          search={{ range: "30d", app: "kinetic-canvas", word: item.id }}
          className="ml-auto inline-flex items-center gap-1 hover:text-foreground"
          onClick={(event) => event.stopPropagation()}
        >
          <BookOpen size={12} aria-hidden="true" /> Library
        </Link>
      </div>
      <p className="text-base leading-relaxed">
        <Sentence text={item.before} start={item.start} end={item.end} tone="words" />
      </p>
      <p className="mt-1 text-base leading-relaxed text-muted-foreground">
        <span aria-hidden="true">→ </span>
        <Sentence
          text={item.before}
          start={item.start}
          end={item.end}
          replacement={item.digits}
          tone="digits"
        />
      </p>
      <p className="mt-2 text-xs text-muted-foreground">{item.reason}</p>
      <div className="mt-3 flex gap-2">
        <ChoiceButton
          tone="digits"
          active={item.choice === "number"}
          disabled={locked}
          onClick={() => onChoose("number")}
          icon={<Hash size={16} aria-hidden="true" />}
          label={`Digits “${item.digits}”`}
          hint="D"
        />
        <ChoiceButton
          tone="words"
          active={item.choice === "word"}
          disabled={locked}
          onClick={() => onChoose("word")}
          icon={<Type size={16} aria-hidden="true" />}
          label="Keep words"
          hint="W"
        />
      </div>
      {item.inMark && (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
          {written
            ? "Written as digits inside a highlight, which turns the highlight off until the mark moves to another word. Keep words puts it back."
            : "Inside a highlight: digits turn the highlight off until the mark moves to another word."}
        </p>
      )}
      {written && !item.current && (
        <p className="mt-2 text-xs text-muted-foreground">
          The sentence changed after the digits were written, so this can only be undone in the
          library.
        </p>
      )}
      {error && (
        <p className="mt-2 rounded bg-red-500/10 px-2 py-1 text-xs text-red-500">{error}</p>
      )}
    </li>
  );
}

/**
 * Number review page.
 * @returns the review UI
 */
export function NumberReviewPage(): React.ReactElement {
  const queryClient = useQueryClient();
  const review = useQuery(adminNumberReviewQueryOptions());
  const [filter, setFilter] = useState<Filter>("open");
  const [group, setGroup] = useState<string | null>(null);
  // Cards decided under the current filter stay in view until it changes.
  const [kept, setKept] = useState<Set<string>>(() => new Set());
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(() => new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});

  const items = useMemo(() => review.data?.items ?? [], [review.data]);
  const writable = review.data?.writable ?? false;

  const counts = useMemo(() => {
    const result = { open: 0, number: 0, word: 0, all: items.length };
    for (const item of items) result[item.choice ?? "open"] += 1;
    return result;
  }, [items]);

  const inFilter = useMemo(
    () => items.filter((item) => matches(item, filter) || kept.has(item.key)),
    [items, filter, kept],
  );
  const groups = useMemo(() => {
    const byGroup = new Map<string, number>();
    for (const item of inFilter) {
      const name = reasonGroup(item.reason);
      byGroup.set(name, (byGroup.get(name) ?? 0) + 1);
    }
    return [...byGroup].sort((a, b) => b[1] - a[1]);
  }, [inFilter]);
  const shown = useMemo(
    () => (group ? inFilter.filter((item) => reasonGroup(item.reason) === group) : inFilter),
    [inFilter, group],
  );
  const activeIndex = Math.max(
    0,
    shown.findIndex((item) => item.key === activeKey),
  );

  const pickFilter = (next: Filter) => {
    setFilter(next);
    setGroup(null);
    setKept(new Set());
    setActiveKey(null);
  };

  const decide = useMutation({
    mutationFn: (input: { item: NumberReviewItem; choice: NumberChoice }) =>
      decideNumberReview({
        data: {
          key: input.item.key,
          choice: input.choice,
          expected: input.item.choice === "number" ? input.item.after : input.item.before,
        },
      }),
    onMutate: ({ item, choice }) => {
      setPendingKeys((current) => new Set(current).add(item.key));
      setKept((current) => new Set(current).add(item.key));
      setErrors(({ [item.key]: _dropped, ...rest }) => rest);
      const previous = queryClient.getQueryData<NumberReview>(adminKeys.numberReview());
      queryClient.setQueryData<NumberReview>(
        adminKeys.numberReview(),
        (data) =>
          data && {
            ...data,
            items: data.items.map((entry) =>
              entry.key === item.key ? { ...entry, choice } : entry,
            ),
          },
      );
      return { previous };
    },
    onSuccess: (stored, { item }) => {
      queryClient.setQueryData<NumberReview>(
        adminKeys.numberReview(),
        (data) =>
          data && {
            ...data,
            items: data.items.map((entry) => (entry.key === item.key ? stored : entry)),
          },
      );
    },
    onError: (error, { item }, context) => {
      if (context?.previous) queryClient.setQueryData(adminKeys.numberReview(), context.previous);
      setErrors((current) => ({ ...current, [item.key]: (error as Error).message }));
    },
    onSettled: (_data, _error, { item }) =>
      setPendingKeys((current) => {
        const next = new Set(current);
        next.delete(item.key);
        return next;
      }),
  });

  const choose = useCallback(
    (item: NumberReviewItem, choice: NumberChoice) => {
      if (!writable || pendingKeys.has(item.key)) return;
      if (item.choice === choice) return;
      if (item.choice === "number" && !item.current) return;
      decide.mutate({ item, choice });
      // Move on to the next card still waiting, so a run of taps or keys flows.
      const at = shown.findIndex((entry) => entry.key === item.key);
      const next = shown.slice(at + 1).find((entry) => entry.choice === null);
      if (next) setActiveKey(next.key);
    },
    [writable, pendingKeys, decide, shown],
  );

  // Keep the active card in view as it moves.
  useEffect(() => {
    if (!activeKey) return;
    const index = shown.findIndex((item) => item.key === activeKey);
    document
      .getElementById(`number-${index}`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeKey, shown]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (event.metaKey || event.ctrlKey || event.altKey || shown.length === 0) return;
      const current = shown[activeIndex];
      const key = event.key.toLowerCase();
      if (key === "j" || event.key === "ArrowDown") {
        event.preventDefault();
        setActiveKey(shown[Math.min(shown.length - 1, activeIndex + 1)]!.key);
      } else if (key === "k" || event.key === "ArrowUp") {
        event.preventDefault();
        setActiveKey(shown[Math.max(0, activeIndex - 1)]!.key);
      } else if (key === "d" && current) {
        choose(current, "number");
      } else if (key === "w" && current) {
        choose(current, "word");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shown, activeIndex, choose]);

  const decided = counts.number + counts.word;
  const percent = counts.all === 0 ? 0 : Math.round((decided / counts.all) * 100);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold">Numbers in words</h2>
        <p className="text-sm text-muted-foreground">
          English deck: number words the scan could not settle on its own. Tap{" "}
          <strong>Digits</strong> to write the number into the pack file, or{" "}
          <strong>Keep words</strong> when the word is not a count (a name, an ordinal, a set
          phrase). Choices are kept in{" "}
          <code className="break-all">scripts/data/worded-number-decisions.json</code>.
        </p>
      </header>

      {review.isError && (
        <p className="rounded bg-red-500/10 px-3 py-2 text-sm text-red-500">
          Could not load the review: {review.error.message}
        </p>
      )}
      {review.data && !writable && (
        <p className="rounded bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
          This server cannot write decks. Run <code>npm run dev</code> locally to decide.
        </p>
      )}

      <section className="space-y-3">
        <div>
          <div className="mb-1 flex justify-between text-xs text-muted-foreground tabular-nums">
            <span>
              {decided} of {counts.all} decided
            </span>
            <span>
              {counts.number} as digits · {counts.word} kept as words
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-emerald-600 transition-[width]"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Which numbers">
          {FILTERS.map((entry) => (
            <button
              key={entry.value}
              type="button"
              role="tab"
              aria-selected={filter === entry.value}
              onClick={() => pickFilter(entry.value)}
              className={`rounded-md px-3 py-1.5 text-sm ${
                filter === entry.value ? "bg-foreground text-background" : "hover:bg-muted"
              }`}
            >
              {entry.label}{" "}
              <span className="text-xs tabular-nums opacity-70">{counts[entry.value]}</span>
            </button>
          ))}
        </div>
        {groups.length > 1 && (
          <div
            className="flex gap-1 overflow-x-auto pb-1 text-xs"
            aria-label="Why the scan was unsure"
          >
            <button
              type="button"
              onClick={() => setGroup(null)}
              className={`shrink-0 rounded-full border px-2.5 py-1 ${
                group === null ? "border-foreground bg-foreground text-background" : "border-border"
              }`}
            >
              Every reason
            </button>
            {groups.map(([name, count]) => (
              <button
                key={name}
                type="button"
                onClick={() => setGroup(group === name ? null : name)}
                className={`shrink-0 rounded-full border px-2.5 py-1 ${
                  group === name
                    ? "border-foreground bg-foreground text-background"
                    : "border-border"
                }`}
              >
                {name} <span className="tabular-nums opacity-70">{count}</span>
              </button>
            ))}
          </div>
        )}
        <p className="hidden text-xs text-muted-foreground md:block">
          Keys: J/K or ↑/↓ move · D digits · W keep words
        </p>
      </section>

      {!review.data ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="rounded-lg border border-border py-12 text-center text-sm text-muted-foreground">
          {filter === "open" ? "Every number here is decided." : "Nothing here yet."}
        </p>
      ) : (
        <ol className="space-y-3 pb-16">
          {shown.map((item, index) => (
            <ReviewCard
              key={item.key}
              item={item}
              index={index}
              active={index === activeIndex}
              writable={writable}
              pending={pendingKeys.has(item.key)}
              error={errors[item.key]}
              onFocus={() => setActiveKey(item.key)}
              onChoose={(choice) => choose(item, choice)}
            />
          ))}
        </ol>
      )}

      {review.data && counts.all > 0 && (
        // The admin page scrolls the window, so the count rides along in a corner.
        <div
          className="pointer-events-none fixed bottom-4 right-4 z-20 rounded-full bg-foreground/90 px-3 py-1.5 text-xs font-medium text-background shadow-lg tabular-nums"
          aria-live="polite"
        >
          {decided} / {counts.all} decided
        </div>
      )}
    </div>
  );
}
