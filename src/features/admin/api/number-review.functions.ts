/**
 * Server side of the number review: the English deck's number words the scan left unsure,
 * and a person's choice for each.
 *
 * The decks and the choice ledger are files, so both handlers load the server module
 * lazily and a page never imports it. Choices write deck files, which only `npm run dev`
 * can do; a deployment lists nothing and refuses a choice.
 *
 * Exports: getNumberReview, decideNumberReview, NumberReview, NumberReviewItem, NumberChoice
 * Depends on: @tanstack/react-start, zod, admin gates, number-review.server (lazy)
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdminAccess } from "../lib/admin-access";
import { requireAdminContext } from "../lib/require-admin";
import type {
  NumberChoice,
  NumberReview,
  NumberReviewItem,
} from "@/features/vocabulary/api/number-review.server";

export type { NumberChoice, NumberReview, NumberReviewItem };

/** Every unsure number in the English packs, with the choices already made. */
export const getNumberReview = createServerFn({ method: "GET" })
  .middleware([requireAdminAccess])
  .handler(async ({ context }): Promise<NumberReview> => {
    await requireAdminContext({ authUserId: context.userId });
    const { listNumberReview } = await import("@/features/vocabulary/api/number-review.server");
    return listNumberReview();
  });

/** Record one choice: digits are written into the pack, words stay (or come back). */
export const decideNumberReview = createServerFn({ method: "POST" })
  .middleware([requireAdminAccess])
  .inputValidator((input: unknown) =>
    z
      .object({
        key: z.string().min(5).max(400),
        choice: z.enum(["number", "word"]),
        expected: z.string().max(2000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<NumberReviewItem> => {
    await requireAdminContext({ authUserId: context.userId });
    const { decideNumber } = await import("@/features/vocabulary/api/number-review.server");
    return decideNumber(data);
  });
