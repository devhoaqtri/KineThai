/**
 * The word library: every word readers are served, one language at a time.
 *
 * A language opens on its level folders, and a folder opens as tables of 50 swiped sideways,
 * so nothing ever lists a whole deck. Search reaches any word in the language from anywhere.
 * Language, folder, search, page and open word all live in the URL, so any of them is a link
 * and a report can open its word directly.
 *
 * Exports: WordLibraryPage
 * Depends on: TanStack Query/Router, word-library server functions, library panels
 */

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, EyeOff, Search } from "lucide-react";
import type { TargetLocale } from "@/features/vocabulary/lib/target-language";
import { adminLibraryPageQueryOptions, adminLibraryQueryOptions } from "../../api/queries";
import type { LibraryRow } from "../../api/word-library.functions";
import type { AdminSearch } from "../../lib/search-schema";
import { LANGUAGE_LABELS, LIBRARY_PAGE_SIZE, NO_LEVEL } from "../../lib/word-library";
import { DeckLanguageTabs } from "../DeckLanguageTabs";
import { LevelFolders } from "./LevelFolders";
import { SwipePages } from "./SwipePages";
import { WordEditor } from "./WordEditor";

/** How long typing must pause before a search is sent. */
const SEARCH_PAUSE_MS = 180;

function WordTable({
  rows,
  offset,
  onOpen,
}: {
  rows: LibraryRow[];
  offset: number;
  onOpen: (id: string) => void;
}): React.ReactElement {
  return (
    <table className="w-full table-fixed text-sm">
      <thead>
        <tr className="border-b border-border text-left text-xs text-muted-foreground">
          <th className="w-12 py-2 pr-2 font-normal">#</th>
          <th className="py-2 pr-3 font-normal">Word</th>
          <th className="py-2 pr-3 font-normal">Meaning</th>
          <th className="hidden w-20 py-2 pr-3 font-normal md:table-cell">Class</th>
          <th className="hidden w-16 py-2 pr-3 font-normal sm:table-cell">Level</th>
          <th className="hidden w-16 py-2 pr-3 font-normal lg:table-cell">Code</th>
          <th className="w-24 py-2 font-normal">Reports</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr
            key={row.id}
            className="cursor-pointer border-b border-border/50 hover:bg-muted/40"
            onClick={() => onOpen(row.id)}
          >
            <td className="py-2 pr-2 text-xs text-muted-foreground tabular-nums">
              {offset + index + 1}
            </td>
            <td className="truncate py-2 pr-3 font-medium">
              <button
                type="button"
                className="max-w-full truncate text-left"
                onClick={(event) => {
                  event.stopPropagation();
                  onOpen(row.id);
                }}
              >
                {row.word}
              </button>
            </td>
            <td className="truncate py-2 pr-3 text-muted-foreground">{row.meaning}</td>
            <td className="hidden truncate py-2 pr-3 text-xs text-muted-foreground md:table-cell">
              {row.pos}
            </td>
            <td className="hidden py-2 pr-3 text-xs text-muted-foreground sm:table-cell">
              {row.level === NO_LEVEL ? "" : row.level}
            </td>
            <td className="hidden py-2 pr-3 font-mono text-xs text-muted-foreground lg:table-cell">
              {row.shareCode}
            </td>
            <td className="py-2">
              <span className="flex items-center gap-1 text-[11px]">
                {row.hidden && (
                  <EyeOff size={13} className="text-red-500" aria-label="Hidden from the feed" />
                )}
                {row.open > 0 && (
                  <span className="rounded-full bg-amber-500/15 px-1.5 text-amber-500 tabular-nums">
                    {row.open}
                  </span>
                )}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function LibraryPageTable({
  locale,
  level,
  q,
  page,
  onOpen,
}: {
  locale: TargetLocale;
  level: string | undefined;
  q: string;
  page: number;
  onOpen: (id: string) => void;
}): React.ReactElement {
  const words = useQuery(adminLibraryPageQueryOptions({ locale, level, q, page }));
  if (!words.data) {
    return <div className="min-h-96 py-10 text-center text-sm text-muted-foreground">Loading…</div>;
  }
  return <WordTable rows={words.data.rows} offset={page * LIBRARY_PAGE_SIZE} onOpen={onOpen} />;
}

/**
 * Word library page.
 * @returns the library UI
 */
export function WordLibraryPage(): React.ReactElement {
  const navigate = useNavigate();
  const search = useRouterState({ select: (state) => state.location.search as AdminSearch });
  const library = useQuery(adminLibraryQueryOptions());

  const locale = search.lang ?? "en";
  const level = search.level;
  const q = search.q ?? "";
  const page = search.page ?? 0;
  const inTable = Boolean(level || q);

  const go = useCallback(
    (patch: Partial<AdminSearch>, replace = false) =>
      navigate({
        to: "/admin/library",
        replace,
        // The router's scroll restoration would put the swipe strip back mid-slide.
        resetScroll: false,
        search: (previous) => ({
          ...(previous as AdminSearch),
          range: (previous as AdminSearch).range ?? "30d",
          app: (previous as AdminSearch).app ?? "kinetic-canvas",
          ...patch,
        }),
      }),
    [navigate],
  );

  // The box follows what is typed at once; the search follows once typing pauses.
  const [typed, setTyped] = useState(q);
  useEffect(() => setTyped(q), [q]);
  useEffect(() => {
    if (typed.trim() === q) return;
    const timer = setTimeout(
      () => go({ q: typed.trim() || undefined, level: undefined, page: undefined }, true),
      SEARCH_PAUSE_MS,
    );
    return () => clearTimeout(timer);
  }, [typed, q, go]);

  const words = useQuery({
    ...adminLibraryPageQueryOptions({ locale, level, q, page }),
    enabled: inTable,
    placeholderData: keepPreviousData,
  });

  const decks = library.data?.decks ?? [];
  const deck = decks.find((entry) => entry.locale === locale);
  const locales = decks.map((entry) => entry.locale);
  const onPage = useCallback((next: number) => go({ page: next || undefined }, true), [go]);
  const openWord = useCallback((id: string) => go({ word: id }), [go]);
  const closeWord = useCallback(() => go({ word: undefined }), [go]);

  const total = words.data?.total ?? 0;
  const from = page * LIBRARY_PAGE_SIZE + 1;
  const to = Math.min(total, (page + 1) * LIBRARY_PAGE_SIZE);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Word library</h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Every word readers are served, by language and level.
            {deck && ` ${LANGUAGE_LABELS[locale]} has ${deck.total.toLocaleString()} words.`}
          </p>
        </div>
        <label className="relative block w-full max-w-sm">
          <Search
            size={15}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            className="w-full rounded-md border border-border bg-background py-1.5 pl-8 pr-3 text-sm"
            placeholder={`Search ${LANGUAGE_LABELS[locale]}: word, meaning or code`}
            aria-label={`Search ${LANGUAGE_LABELS[locale]} words`}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
          />
        </label>
      </header>

      {decks.length > 0 && (
        <DeckLanguageTabs
          locales={locales}
          locale={locale}
          onPick={(next) => {
            setTyped("");
            go({
              lang: next === "en" ? undefined : next,
              level: undefined,
              q: undefined,
              page: undefined,
              word: undefined,
            });
          }}
          badge={(entry) => (
            <span className="text-xs tabular-nums opacity-70">
              {decks.find((item) => item.locale === entry)?.total.toLocaleString()}
            </span>
          )}
        />
      )}

      {library.isError && (
        <p className="rounded bg-red-500/10 px-3 py-2 text-sm text-red-500">
          Could not load the library: {library.error.message}
        </p>
      )}

      {inTable ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {level && (
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
                onClick={() => go({ level: undefined, page: undefined })}
              >
                <ChevronLeft size={14} /> Folders
              </button>
            )}
            <h3 className="font-semibold">
              {LANGUAGE_LABELS[locale]}
              {level && ` · ${level === NO_LEVEL ? "No level" : level}`}
              {q && ` · “${q}”`}
            </h3>
          </div>
          {words.isError ? (
            <p className="rounded bg-red-500/10 px-3 py-2 text-sm text-red-500">
              Could not load words: {words.error.message}
            </p>
          ) : !words.data ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
          ) : total === 0 ? (
            <p className="rounded-lg border border-border py-12 text-center text-sm text-muted-foreground">
              No {LANGUAGE_LABELS[locale]} word matches “{q}”.
            </p>
          ) : (
            <SwipePages
              key={`${locale}:${level ?? ""}:${q}`}
              pageCount={words.data.pageCount}
              page={page}
              onPage={onPage}
              label={`${LANGUAGE_LABELS[locale]} words`}
              caption={`${from.toLocaleString()}–${to.toLocaleString()} of ${total.toLocaleString()}`}
              renderPage={(index) => (
                <LibraryPageTable
                  locale={locale}
                  level={level}
                  q={q}
                  page={index}
                  onOpen={openWord}
                />
              )}
            />
          )}
        </section>
      ) : deck ? (
        <LevelFolders folders={deck.folders} onOpen={(next) => go({ level: next })} />
      ) : (
        <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
      )}

      {search.word && (
        <WordEditor
          key={`${locale}:${search.word}`}
          locale={locale}
          id={search.word}
          folders={deck?.folders ?? []}
          onClose={closeWord}
        />
      )}
    </div>
  );
}
