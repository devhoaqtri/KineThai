import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ADMIN_PIN_ACTOR_ID,
  ADMIN_PIN_COOKIE,
  ADMIN_PIN_TTL_MS,
  checkPinAttemptRateLimit,
  clearPinFailures,
  hasValidAdminPinCookie,
  issueAdminPinToken,
  recordPinFailure,
  verifyAdminPinToken,
  verifyAdminPinValue,
} from "../admin-pin.server";
import { AdminForbiddenError, requireAdminContext } from "../require-admin";

afterEach(() => {
  vi.unstubAllEnvs();
  clearPinFailures("1.2.3.4");
});

describe("admin PIN verification", () => {
  it("accepts the default PIN 080723 and rejects wrong or partial values", () => {
    expect(verifyAdminPinValue("080723")).toBe(true);
    expect(verifyAdminPinValue(" 080723 ")).toBe(true);
    expect(verifyAdminPinValue("080724")).toBe(false);
    expect(verifyAdminPinValue("08072")).toBe(false);
    expect(verifyAdminPinValue("0807230")).toBe(false);
    expect(verifyAdminPinValue("")).toBe(false);
  });

  it("honours ADMIN_PIN override when configured", () => {
    vi.stubEnv("ADMIN_PIN", "654321");
    expect(verifyAdminPinValue("654321")).toBe(true);
    expect(verifyAdminPinValue("080723")).toBe(false);
  });
});

describe("admin PIN signed token & cookie", () => {
  it("verifies a freshly issued token and rejects tampered or expired tokens", async () => {
    const now = 1_700_000_000_000;
    const token = await issueAdminPinToken(now);
    expect(await verifyAdminPinToken(token, now + 1000)).toBe(true);

    const lastChar = token.slice(-1);
    const tampered = `${token.slice(0, -1)}${lastChar === "a" ? "b" : "a"}`;
    expect(await verifyAdminPinToken(tampered, now + 1000)).toBe(false);
    expect(await verifyAdminPinToken(token, now + ADMIN_PIN_TTL_MS + 1000)).toBe(false);
    expect(await verifyAdminPinToken("invalid", now)).toBe(false);
  });

  it("reads and validates the cookie from an incoming Request", async () => {
    const token = await issueAdminPinToken();
    const validReq = new Request("https://example.com/admin", {
      headers: { cookie: `foo=bar; ${ADMIN_PIN_COOKIE}=${encodeURIComponent(token)}` },
    });
    const invalidReq = new Request("https://example.com/admin", {
      headers: { cookie: `${ADMIN_PIN_COOKIE}=v1.9999999999.AAAAAAAAAAAAAAAAAAAAAA` },
    });
    const emptyReq = new Request("https://example.com/admin");

    expect(await hasValidAdminPinCookie(validReq)).toBe(true);
    expect(await hasValidAdminPinCookie(invalidReq)).toBe(false);
    expect(await hasValidAdminPinCookie(emptyReq)).toBe(false);
  });
});

describe("admin PIN rate limiting & context", () => {
  it("locks out after 5 failures until window resets or clears", () => {
    const t0 = 1_700_000_000_000;
    for (let i = 0; i < 4; i += 1) {
      recordPinFailure("1.2.3.4", t0);
      expect(checkPinAttemptRateLimit("1.2.3.4", t0).ok).toBe(true);
    }
    recordPinFailure("1.2.3.4", t0);
    expect(checkPinAttemptRateLimit("1.2.3.4", t0).ok).toBe(false);

    clearPinFailures("1.2.3.4");
    expect(checkPinAttemptRateLimit("1.2.3.4", t0).ok).toBe(true);
  });

  it("admits server-verified PIN sessions in production and rejects unverified PIN actor IDs", async () => {
    vi.stubEnv("DEV", false);
    await expect(
      requireAdminContext({ authUserId: ADMIN_PIN_ACTOR_ID, pinVerified: true }),
    ).resolves.toEqual({
      authUserId: ADMIN_PIN_ACTOR_ID,
      mode: "live",
    });

    await expect(requireAdminContext({ authUserId: ADMIN_PIN_ACTOR_ID })).rejects.toBeInstanceOf(
      AdminForbiddenError,
    );
  });
});
