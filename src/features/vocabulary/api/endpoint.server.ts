/** Public vocabulary HTTP boundary. Exports: vocabularyResponse. Depends on: zod, server catalog, difficulty bands, stream tokens, rate limiter. */
import { z } from "zod";
import { LEVELS } from "../lib/schema";
import { DIFFICULTY_IDS } from "../lib/difficulty";
import { VOCAB_PAGE_LIMIT } from "../lib/backfill";
import { MAX_POSITION, readVocabularyPage, servedCatalogFor } from "./catalog.server";
import { refreshBlockedWordIds } from "./word-block.server";
import { issueStreamToken, verifyStreamToken } from "./stream-token.server";
import { resolveTarget } from "../lib/target-language";
import { isLocalRequest } from "@/lib/bot-gate";
import {
  NEW_STREAM_BUDGET,
  callerKey,
  checkRateLimitOnce,
  rateLimitedResponse,
} from "@/lib/rate-limit";

const unsigned = (fallback: string, max: number) =>
  z
    .string()
    .regex(/^\d+$/)
    .default(fallback)
    .transform(Number)
    .pipe(z.number().int().min(0).max(max));
const requestSchema = z
  .object({
    seed: z.string().regex(/^[a-zA-Z0-9_-]{8,64}$/),
    position: unsigned("0", MAX_POSITION),
    // Exactly one page size: a larger page would just be a cheaper way to copy the deck.
    limit: unsigned(String(VOCAB_PAGE_LIMIT), VOCAB_PAGE_LIMIT).pipe(z.number().min(1)),
    // The signed cursor from the previous page. Required for every page but the first.
    token: z
      .string()
      .max(64)
      .regex(/^[A-Za-z0-9._-]+$/)
      .optional(),
    // The revision is an opaque digest the client only ever echoes back, and the server
    // only ever compares for equality. It is validated as bounded hex rather than at an
    // exact width: the cursor for EVERY page after the first is built from the revision
    // this server just issued, so a digest that merely changes length would be rejected
    // here and silently end the feed at word twelve.
    revision: z
      .string()
      .regex(/^[a-f0-9]{8,64}$/)
      .optional(),
    topic: z
      .string()
      .max(60)
      .regex(/^[a-z0-9-]*$/)
      .default(""),
    level: z.union([z.enum(LEVELS), z.literal("")]).default(""),
    // Difficulty is multi-select: a comma-joined list of track ids, or "" for all.
    // Every segment is validated against the declared list, so an unknown id is a 400
    // rather than a silently empty stream.
    difficulty: z
      .string()
      .default("")
      .transform((value) =>
        value
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean)
          .join(","),
      )
      .refine(
        (value) =>
          value === "" ||
          value.split(",").every((id) => (DIFFICULTY_IDS as readonly string[]).includes(id)),
        { message: "Unknown difficulty track" },
      ),
  })
  .strict()
  .refine((input) => input.position % input.limit === 0, {
    path: ["position"],
    message: "Position must be aligned with the page size",
  });
const headers = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow",
};

/**
 * Serve bounded pages without authentication.
 *
 * A stream is read one page after another: page 0 is open (but charged to the tighter
 * new-stream budget), and each page hands back a signed cursor that admits the pages up
 * to the next one. A client cannot skip ahead or fan one seed out in parallel.
 * @param request Incoming GET. @returns JSON response.
 */
export async function vocabularyResponse(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (url.search.length > 512)
    return Response.json(
      { code: "INVALID_REQUEST", error: "Query is too long" },
      { status: 400, headers },
    );
  const parsed = requestSchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success)
    return Response.json(
      {
        code: "INVALID_REQUEST",
        error: "Invalid vocabulary query",
        fields: parsed.error.flatten().fieldErrors,
      },
      { status: 400, headers },
    );
  const locale = resolveTarget(request.headers.get("host") ?? url.host);
  // Before the revision is compared or a page is cut: both have to be taken against the
  // same pool, and the pool is whatever is not currently blocked.
  await refreshBlockedWordIds();
  const revision = servedCatalogFor(locale).revision;
  if (parsed.data.revision && parsed.data.revision !== revision) {
    return Response.json(
      { code: "CATALOG_CHANGED", error: "The vocabulary catalog changed. Start a fresh stream." },
      { status: 409, headers },
    );
  }
  const { token, ...page } = parsed.data;
  const identity = {
    seed: page.seed,
    topic: page.topic,
    level: page.level,
    difficulty: page.difficulty,
    revision,
  };
  if (page.position === 0) {
    // Charged per distinct stream: asking for the same first page again is free. Local
    // hosts are exempt, as they are from the path budgets (see start.ts).
    if (!isLocalRequest(request)) {
      const stream = [page.seed, page.topic, page.level, page.difficulty].join("|");
      const verdict = checkRateLimitOnce(
        "vocabulary:new-stream",
        callerKey(request),
        stream,
        NEW_STREAM_BUDGET,
      );
      if (!verdict.allowed) return rateLimitedResponse(verdict.retryAfterSeconds);
    }
  } else if (!token || (await verifyStreamToken(token, identity, page.position)) === null) {
    return Response.json(
      { code: "STREAM_EXPIRED", error: "This stream can no longer be resumed. Start a fresh one." },
      { status: 403, headers },
    );
  }
  try {
    const served = readVocabularyPage(page, locale);
    const cursor = await issueStreamToken(identity, page.position + page.limit);
    return Response.json({ ...served, cursor }, { headers });
  } catch {
    return Response.json(
      { code: "UNAVAILABLE", error: "Vocabulary is temporarily unavailable. Please retry." },
      { status: 503, headers },
    );
  }
}
