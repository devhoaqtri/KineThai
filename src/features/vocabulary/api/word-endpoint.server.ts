/**
 * One word at a time, for the pages that open on a single word: a challenge link
 * (`/w/$code`), the export frame (`/export/$code`) and the showcase recorder.
 *
 * These used to resolve against a deck compiled into the client bundle. The deck is
 * server-only now, so they ask here instead — by share code, or by a seed that picks one
 * word for the showcase. Either way a request yields exactly one word, and the route's
 * rate budget bounds how many a caller can collect.
 *
 * Exports: wordResponse
 * Depends on: zod, server catalog, share codes, target language
 */
import { z } from "zod";
import { catalogFor } from "./catalog.server";
import { isShareCode, normalizeShareCode } from "../lib/share-code";
import { resolveTarget, type TargetLocale } from "../lib/target-language";
import type { VocabularyWord } from "../lib/schema";
// Codes retired for reading as a word or a taboo (scripts/rescreen-share-codes.ts). They are
// never issued again, but a link already shared with one still opens the word it named.
import retiredCodes from "../data/share-codes-retired.json";

const requestSchema = z
  .object({
    code: z.string().max(12).optional(),
    seed: z
      .string()
      .regex(/^\d{1,9}$/)
      .transform(Number)
      .optional(),
  })
  .strict()
  .refine((input) => input.code !== undefined || input.seed !== undefined, {
    message: "A code or a seed is required",
  });

const headers = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow",
};

/** Share code → word per locale, rebuilt when the served catalog changes. */
const byShareCode = new Map<
  TargetLocale,
  { words: Map<string, VocabularyWord> }
>();

function wordForCode(locale: TargetLocale, code: string): VocabularyWord | undefined {
  const served = catalogFor(locale);
  let index = byShareCode.get(locale);
  if (!index) {
    index = {
      words: new Map(
        served.words.flatMap((word) => (word.shareCode ? [[word.shareCode, word] as const] : [])),
      ),
    };
    byShareCode.set(locale, index);
  }
  const current = index.words.get(code);
  if (current) return current;
  const retiredId = (retiredCodes as Record<string, Record<string, { id: string }>>)[locale]?.[code]
    ?.id;
  return retiredId ? served.words.find((word) => word.id === retiredId) : undefined;
}

/**
 * Resolve one word for this host's deck.
 * @param request Incoming GET with `code` (a share code) or `seed` (showcase pick).
 * @returns `{ word }`, or a 404 when the code names nothing in the deck.
 */
export async function wordResponse(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (url.search.length > 64)
    return Response.json(
      { code: "INVALID_REQUEST", error: "Query is too long" },
      { status: 400, headers },
    );
  const parsed = requestSchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success)
    return Response.json(
      { code: "INVALID_REQUEST", error: "Invalid word query" },
      { status: 400, headers },
    );
  const locale = resolveTarget(request.headers.get("host") ?? url.host);
  let word: VocabularyWord | undefined;
  if (parsed.data.code !== undefined) {
    const code = normalizeShareCode(parsed.data.code);
    word = isShareCode(code) ? wordForCode(locale, code) : undefined;
  } else {
    const words = catalogFor(locale).words;
    word = words.length ? words[(parsed.data.seed ?? 0) % words.length] : undefined;
  }
  if (!word)
    return Response.json(
      { code: "NOT_FOUND", error: "No word has this code." },
      { status: 404, headers },
    );
  return Response.json({ word }, { headers });
}
