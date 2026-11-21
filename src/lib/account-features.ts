/**
 * The server-side half of switching the social network off (lib/reader-routes): placed first
 * on every social and account server function, it refuses the call before any handler,
 * auth check or service-role read runs.
 *
 * Exports: accountFeaturesGate
 * Depends on: @tanstack/react-start, ./reader-routes
 */

import { createMiddleware } from "@tanstack/react-start";
import { ACCOUNT_FEATURES_ENABLED } from "./reader-routes";

export const accountFeaturesGate = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    if (!ACCOUNT_FEATURES_ENABLED) throw new Error("This feature is not available.");
    return next();
  },
);
