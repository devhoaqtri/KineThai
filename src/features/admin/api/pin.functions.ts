/**
 * Server functions for the /admin PIN gate.
 *
 * PIN verification, rate limiting, and signed HttpOnly cookie management stay
 * inside dynamic .server imports so no secret or PIN literal reaches browser code.
 *
 * Exports: getAdminPinStatus, unlockAdminWithPin, lockAdminSession
 * Depends on: @tanstack/react-start, zod, admin-pin.server (lazy)
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type AdminPinStatus = {
  unlocked: boolean;
};

export type AdminPinUnlockResult =
  { ok: true } | { ok: false; error: string; retryAfterSeconds?: number };

/** Report whether the current request already carries a valid signed PIN cookie. */
export const getAdminPinStatus = createServerFn({ method: "GET" }).handler(
  async (): Promise<AdminPinStatus> => {
    const { hasValidAdminPinCookie } = await import("../lib/admin-pin.server");
    return { unlocked: await hasValidAdminPinCookie() };
  },
);

/** Verify the submitted PIN and issue an HttpOnly session cookie when valid. */
export const unlockAdminWithPin = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ pin: z.string().trim().min(1, "Enter the PIN.").max(32) }).parse(input),
  )
  .handler(async ({ data }): Promise<AdminPinUnlockResult> => {
    const {
      adminPinRequestIp,
      checkPinAttemptRateLimit,
      clearPinFailures,
      issueAdminPinToken,
      recordPinFailure,
      setAdminPinCookie,
      verifyAdminPinValue,
    } = await import("../lib/admin-pin.server");

    const ip = adminPinRequestIp();
    const limit = checkPinAttemptRateLimit(ip);
    if (!limit.ok) {
      return {
        ok: false,
        error: `Too many failed attempts. Try again in ${Math.ceil(limit.retryAfterSeconds / 60)} min.`,
        retryAfterSeconds: limit.retryAfterSeconds,
      };
    }

    if (!verifyAdminPinValue(data.pin)) {
      recordPinFailure(ip);
      return { ok: false, error: "Incorrect PIN." };
    }

    clearPinFailures(ip);
    const token = await issueAdminPinToken();
    setAdminPinCookie(token);
    return { ok: true };
  });

/** Clear the admin PIN cookie and re-lock the admin board. */
export const lockAdminSession = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ ok: true }> => {
    const { clearAdminPinCookie } = await import("../lib/admin-pin.server");
    clearAdminPinCookie();
    return { ok: true };
  },
);
