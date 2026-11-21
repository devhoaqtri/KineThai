import { afterEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({ getItem: vi.fn() }));
vi.mock("@/integrations/supabase/previewAuthStorage", () => ({
  brokeredPreviewStorage: () => storage,
}));
import { hasStoredAuthSession } from "../lazy-auth";

afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });

describe("lazy account loading", () => {
  it("skips the SDK when its own storage confirms a signed-out visitor", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://account.example.test");
    storage.getItem.mockResolvedValue(null);
    expect(await hasStoredAuthSession()).toBe(false);
    expect(storage.getItem).toHaveBeenCalledWith("sb-account-auth-token");
  });
  it("loads the SDK for a session returned asynchronously by the preview broker", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://account.example.test");
    storage.getItem.mockResolvedValue('{"access_token":"test-only"}');
    expect(await hasStoredAuthSession()).toBe(true);
  });
  it("does not mistake blocked storage for a missing session", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://account.example.test");
    storage.getItem.mockRejectedValue(new Error("blocked"));
    expect(await hasStoredAuthSession()).toBe(true);
  });
});