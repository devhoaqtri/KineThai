/**
 * One word from the server, for the pages that open on a single word (challenge link,
 * export frame, showcase). The deck is server-only, so these ask /api/public/word.
 *
 * Exports: useServedWord, WordLookup
 * Depends on: React Query, ../lib/schema (types)
 */
import { useQuery } from "@tanstack/react-query";
import type { VocabularyWord } from "../lib/schema";

/** What to resolve: a share code, or a seed that picks one word from the deck. */
export type WordLookup = { code: string } | { seed: number };

/** Resolved word, or `null` when the server has none for this lookup. */
async function fetchServedWord(
  lookup: WordLookup,
  signal: AbortSignal,
): Promise<VocabularyWord | null> {
  const query = new URLSearchParams(
    "code" in lookup ? { code: lookup.code } : { seed: String(lookup.seed % 1_000_000_000) },
  );
  const response = await fetch(`/api/public/word?${query}`, { signal, credentials: "omit" });
  if (response.status === 404 || response.status === 400) return null;
  if (!response.ok) throw new Error(`Word lookup failed (${response.status})`);
  const body = (await response.json()) as { word?: VocabularyWord };
  return body.word ?? null;
}

/**
 * Resolve one word once and hold it: a page recording a clip must not see it change.
 * @param lookup - share code or seed; `null` to wait
 * @returns `word` (undefined while loading, null when missing) and whether it failed
 */
export function useServedWord(lookup: WordLookup | null) {
  const query = useQuery({
    queryKey: ["served-word", lookup],
    queryFn: ({ signal }) => fetchServedWord(lookup as WordLookup, signal),
    enabled: lookup !== null && typeof window !== "undefined",
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });
  // A request that keeps failing reads as "missing" to the pages, which already have a
  // state for that; there is nothing more useful a recorder or reader could do with it.
  const word = query.isError ? null : query.data;
  return { word, failed: query.isError };
}
