import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEMO_AUTH_USER_ID,
  DEMO_SESSION_KEY,
  endDemoSession,
  getDemoRouteUser,
  getDemoSession,
  isDemoSession,
  startDemoSession,
} from "../demo-session";
import { dataModeKey, resolveDataMode } from "../data-mode";

function createStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
    setItem: (key: string, value: string) => void map.set(key, String(value)),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
    key: (index: number) => [...map.keys()][index] ?? null,
    get length() {
      return map.size;
    },
  } as unknown as Storage;
}

beforeEach(() => {
  vi.stubGlobal("window", { localStorage: createStorage() });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("demo session lifecycle", () => {
  it("reports no session initially", () => {
    expect(getDemoSession()).toBeNull();
    expect(isDemoSession()).toBe(false);
  });
  it("starts a session and persists it", () => {
    const session = startDemoSession();
    expect(session.userId).toBe(DEMO_AUTH_USER_ID);
    expect(isDemoSession()).toBe(true);
    expect(window.localStorage.getItem(DEMO_SESSION_KEY)).not.toBeNull();
  });
  it("ends the session and clears storage", () => {
    startDemoSession();
    endDemoSession();
    expect(getDemoSession()).toBeNull();
    expect(isDemoSession()).toBe(false);
  });
  it("returns null and clears on malformed JSON", () => {
    window.localStorage.setItem(DEMO_SESSION_KEY, "{bad");
    expect(getDemoSession()).toBeNull();
    expect(window.localStorage.getItem(DEMO_SESSION_KEY)).toBeNull();
  });
  it("rejects a payload without a user id", () => {
    window.localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify({ startedAt: "x" }));
    expect(getDemoSession()).toBeNull();
  });
  it("backfills a missing startedAt", () => {
    window.localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify({ userId: DEMO_AUTH_USER_ID }));
    const session = getDemoSession();
    expect(session?.userId).toBe(DEMO_AUTH_USER_ID);
    expect(typeof session?.startedAt).toBe("string");
  });
  it("stamps an ISO startedAt when starting", () => {
    const session = startDemoSession();
    expect(session.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
  it("tolerates ending a session that was never started", () => {
    expect(() => endDemoSession()).not.toThrow();
    expect(isDemoSession()).toBe(false);
  });
});

describe("getDemoRouteUser", () => {
  it("matches the demo auth id", () => expect(getDemoRouteUser().id).toBe(DEMO_AUTH_USER_ID));
  it("carries authenticated role and a demo email", () => {
    const user = getDemoRouteUser();
    expect(user.role).toBe("authenticated");
    expect(user.email).toContain("demo");
    expect(user.user_metadata.full_name).toBe("Demo Creator");
  });
});

describe("data mode", () => {
  it("resolves live with no demo session", () => expect(resolveDataMode()).toBe("live"));
  it("resolves demo once a session is active", () => {
    startDemoSession();
    expect(resolveDataMode()).toBe("demo");
  });
  it("keeps the key identical to the mode", () => {
    expect(dataModeKey("demo")).toBe("demo");
    expect(dataModeKey("live")).toBe("live");
  });
});

describe("data mode without a browser", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("resolves live when window is undefined", () => {
    vi.stubGlobal("window", undefined);
    expect(resolveDataMode()).toBe("live");
  });
});
