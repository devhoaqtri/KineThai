import { afterEach, describe, expect, it, vi } from "vitest";
import { DEMO_AUTH_USER_ID } from "@/features/session/demo-session";
import { AdminForbiddenError, isDemoAdminEnabled, requireAdminContext } from "../require-admin";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("demo admin", () => {
  it("is honoured under npm run dev when the flag is set", async () => {
    vi.stubEnv("DEV", true);
    vi.stubEnv("VITE_DEMO_ADMIN", "1");
    expect(isDemoAdminEnabled()).toBe(true);
    await expect(requireAdminContext({ isDemo: true })).resolves.toEqual({
      authUserId: DEMO_AUTH_USER_ID,
      mode: "demo",
    });
  });

  // The committed .env carries the flag into every build, so a production build
  // must refuse it: otherwise the demo header is an admin key on the hosted site.
  it("is never honoured by a production build, even with the flag set", async () => {
    vi.stubEnv("DEV", false);
    vi.stubEnv("VITE_DEMO_ADMIN", "1");
    const before = process.env.VITE_DEMO_ADMIN;
    process.env.VITE_DEMO_ADMIN = "1";
    try {
      expect(isDemoAdminEnabled()).toBe(false);
      await expect(requireAdminContext({ isDemo: true })).rejects.toBeInstanceOf(
        AdminForbiddenError,
      );
      await expect(requireAdminContext({ authUserId: DEMO_AUTH_USER_ID })).rejects.toBeInstanceOf(
        AdminForbiddenError,
      );
    } finally {
      if (before === undefined) delete process.env.VITE_DEMO_ADMIN;
      else process.env.VITE_DEMO_ADMIN = before;
    }
  });
});
