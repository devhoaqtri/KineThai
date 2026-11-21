import { afterEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({ getItem: vi.fn() }));
vi.mock("@/integrations/supabase/previewAuthStorage", () => ({
  brokeredPreviewStorage: () => storage,
}));
import { hasAuthCallbackParams, hasStoredAuthSession, shouldLoadAuthClient } from "../lazy-auth";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

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
  it("loads the client at once for a sign-in coming back in the URL", async () => {
    expect(
      hasAuthCallbackParams("https://anh.chayla.app/feed#access_token=x&refresh_token=y"),
    ).toBe(true);
    expect(hasAuthCallbackParams("https://anh.chayla.app/feed?code=abc")).toBe(true);
    expect(hasAuthCallbackParams("https://anh.chayla.app/feed?error_description=denied")).toBe(
      true,
    );
    expect(await shouldLoadAuthClient("https://anh.chayla.app/feed#access_token=x")).toBe(true);
    expect(storage.getItem).not.toHaveBeenCalled();
  });
  it("leaves a reader who never signed in without the client", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://account.example.test");
    storage.getItem.mockResolvedValue(null);
    expect(hasAuthCallbackParams("https://anh.chayla.app/w/QJR")).toBe(false);
    expect(await shouldLoadAuthClient("https://anh.chayla.app/feed")).toBe(false);
  });
});
