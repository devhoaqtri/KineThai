/**
 * The side sheet for one word. It edits the text exactly as the deck stores it, marks
 * included, and sends only the fields that changed.
 *
 * Exports: WordEditor
 * Depends on: TanStack Query, lucide-react, word-library server functions
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Check, EyeOff, X } from "lucide-react";
import type { VocabularyLevel } from "@/features/vocabulary/lib/schema";
import type { TargetLocale } from "@/features/vocabulary/lib/target-language";
import { adminKeys } from "../../api/keys";
import { adminLibraryWordQueryOptions } from "../../api/queries";
import {
  updateLibraryWord,
  type LibraryFolder,
  type LibraryWordDetail,
} from "../../api/word-library.functions";
import { NO_LEVEL } from "../../lib/word-library";

type Draft = Pick<
  LibraryWordDetail,
  "word" | "meaningVi" | "defVi" | "leadVi" | "anticipateVi" | "ipa" | "pos" | "level" | "usage"
>;

const TEXT_FIELDS: { key: keyof Draft; label: string; rows: number }[] = [
  { key: "meaningVi", label: "Meaning", rows: 1 },
  { key: "leadVi", label: "Opening clue", rows: 2 },
  { key: "defVi", label: "Meaning clue", rows: 3 },
  { key: "anticipateVi", label: "Teaser", rows: 2 },
];

/** What a refused save says, in the labels of this form rather than the deck's field names. */
function readableError(message: string): string {
  const fields = message.replace(/words\.\d+\./g, "");
  return TEXT_FIELDS.reduce(
    (text, { key, label }) => text.replaceAll(`${key}:`, `${label}:`),
    fields,
  ).replaceAll("English answer", "word itself");
}

const inputClass =
  "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm disabled:opacity-60";

const draftOf = (word: LibraryWordDetail): Draft => ({
  word: word.word,
  meaningVi: word.meaningVi,
  defVi: word.defVi,
  leadVi: word.leadVi,
  anticipateVi: word.anticipateVi,
  ipa: word.ipa,
  pos: word.pos,
  level: word.level,
  usage: word.usage,
});

function changedFields(from: Draft, to: Draft): Partial<Draft> {
  const keys = (Object.keys(to) as (keyof Draft)[]).filter(
    (key) => JSON.stringify(from[key]) !== JSON.stringify(to[key]),
  );
  return Object.fromEntries(keys.map((key) => [key, to[key]]));
}

/**
 * @param props.locale - the deck
 * @param props.id - the word
 * @param props.folders - the deck's folders, which are the levels it can move to
 * @param props.onClose - close the sheet
 * @returns Scrim plus side sheet
 */
export function WordEditor({
  locale,
  id,
  folders,
  onClose,
}: {
  locale: TargetLocale;
  id: string;
  folders: readonly LibraryFolder[];
  onClose: () => void;
}): React.ReactElement {
  const word = useQuery(adminLibraryWordQueryOptions(locale, id));

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} aria-hidden="true" />
      <aside
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col overflow-y-auto border-l border-border bg-background p-5"
        role="dialog"
        aria-modal="true"
        aria-label="Edit word"
      >
        <button
          type="button"
          className="absolute right-3 top-3 rounded-md p-1.5 hover:bg-muted"
          onClick={onClose}
          aria-label="Close"
        >
          <X size={18} />
        </button>
        {word.isLoading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
        ) : word.data ? (
          <WordForm locale={locale} detail={word.data} folders={folders} />
        ) : (
          <p className="py-10 text-center text-sm text-muted-foreground">
            This word is not in the deck.
          </p>
        )}
      </aside>
    </>
  );
}

function WordForm({
  locale,
  detail,
  folders,
}: {
  locale: TargetLocale;
  detail: LibraryWordDetail;
  folders: readonly LibraryFolder[];
}): React.ReactElement {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft>(() => draftOf(detail));
  const saved = draftOf(detail);
  const changes = changedFields(saved, draft);
  const dirty = Object.keys(changes).length > 0;
  const readOnly = detail.file === null;

  const save = useMutation({
    mutationFn: () =>
      updateLibraryWord({
        data: {
          locale,
          id: detail.id,
          edit: changes as never,
          expected: Object.fromEntries(
            Object.keys(changes).map((key) => [key, saved[key as keyof Draft]]),
          ) as never,
        },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminKeys.library() }),
  });

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    save.reset();
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const levels = folders.map((folder) => folder.level).filter((level) => level !== NO_LEVEL);

  return (
    <form
      className="flex flex-1 flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (dirty && !readOnly) save.mutate();
      }}
    >
      <header className="pr-8">
        <h2 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
          {detail.word}
          {detail.hidden && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-semibold text-white">
              <EyeOff size={11} aria-hidden="true" /> Hidden
            </span>
          )}
          {detail.open > 0 && (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-500">
              {detail.open} open
            </span>
          )}
        </h2>
        <p className="text-xs text-muted-foreground">
          {[detail.id, detail.shareCode, detail.file].filter(Boolean).join(" · ")}
        </p>
      </header>

      {readOnly && (
        <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          Read-only here: this server has no deck file for this word. Edit words with{" "}
          <code>npm run dev</code> locally.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <label className="col-span-2 block text-xs text-muted-foreground">
          Word
          <input
            className={`${inputClass} mt-1`}
            value={draft.word}
            disabled={readOnly}
            onChange={(event) => set("word", event.target.value)}
          />
        </label>
        <label className="block text-xs text-muted-foreground">
          Pronunciation
          <input
            className={`${inputClass} mt-1`}
            value={draft.ipa}
            disabled={readOnly}
            onChange={(event) => set("ipa", event.target.value)}
          />
        </label>
        <label className="block text-xs text-muted-foreground">
          Word class
          <input
            className={`${inputClass} mt-1`}
            value={draft.pos}
            disabled={readOnly}
            onChange={(event) => set("pos", event.target.value)}
          />
        </label>
        {levels.length > 0 && draft.level && (
          <label className="col-span-2 block text-xs text-muted-foreground">
            Level
            <select
              className={`${inputClass} mt-1`}
              value={draft.level}
              disabled={readOnly}
              onChange={(event) => set("level", event.target.value as VocabularyLevel)}
            >
              {levels.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {TEXT_FIELDS.map(({ key, label, rows }) => (
        <label key={key} className="block text-xs text-muted-foreground">
          {label}
          <textarea
            className={`${inputClass} mt-1 resize-y`}
            rows={rows}
            value={draft[key] as string}
            disabled={readOnly}
            onChange={(event) => set(key, event.target.value)}
          />
        </label>
      ))}

      {draft.usage.map((line, index) => (
        <fieldset key={index} className="space-y-1.5">
          <legend className="text-xs text-muted-foreground">Example {index + 1}</legend>
          <textarea
            className={`${inputClass} resize-y`}
            rows={2}
            value={line.en}
            disabled={readOnly}
            aria-label={`Example ${index + 1}`}
            onChange={(event) =>
              set(
                "usage",
                draft.usage.map((entry, at) =>
                  at === index ? { ...entry, en: event.target.value } : entry,
                ),
              )
            }
          />
          <textarea
            className={`${inputClass} resize-y`}
            rows={2}
            value={line.vi}
            disabled={readOnly}
            aria-label={`Example ${index + 1} in Vietnamese`}
            onChange={(event) =>
              set(
                "usage",
                draft.usage.map((entry, at) =>
                  at === index ? { ...entry, vi: event.target.value } : entry,
                ),
              )
            }
          />
        </fieldset>
      ))}

      <p className="text-xs text-muted-foreground">
        Keep the marks: <code>_</code> joins a word, <code>|</code> and <code>=</code> guide line
        breaks, <code>/…/</code> is emphasis.
      </p>

      <div className="sticky -bottom-5 -mx-5 -mb-5 mt-auto space-y-2 border-t border-border bg-background px-5 py-3">
        {save.isError && (
          <p className="rounded bg-red-500/10 px-3 py-2 text-sm whitespace-pre-wrap text-red-500">
            {readableError(save.error.message)}
          </p>
        )}
        {save.isSuccess && (
          <p className="flex items-center gap-1.5 text-xs text-green-500" role="status">
            <Check size={14} /> Saved to {save.data.file}. Commit and publish to reach readers.
          </p>
        )}
        <button
          type="submit"
          className="w-full rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background disabled:opacity-40"
          disabled={!dirty || readOnly || save.isPending}
        >
          {save.isPending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
