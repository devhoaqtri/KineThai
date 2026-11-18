import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  closeStorageDialog,
  getStorageAccess,
  recheckStorageAccess,
  requestStorageDialog,
  resetStorageAccessForTests,
  subscribeStorageAccess,
} from "../storage-access";
import {
  isStorageFeatureOff,
  storageDialogCopy,
  storageHelpSteps,
} from "../../features/vocabulary/lib/storage-features";

/** A local storage that refuses writes until `allow()`, and a persist permission. */
function fakeBrowser(options: { blocked: boolean; persist?: "granted" | "denied" | "prompt" }) {
  let blocked = options.blocked;
  let permission = options.persist ?? "prompt";
  const persist = vi.fn(async () => {
    if (permission === "prompt") permission = "granted";
    return permission === "granted";
  });
  vi.stubGlobal("window", {
    localStorage: {
      length: 0,
      setItem: () => {
        if (blocked) throw Object.assign(new Error("denied"), { name: "SecurityError" });
      },
      removeItem: () => undefined,
    },
  });
  vi.stubGlobal("document", { visibilityState: "visible", addEventListener: () => undefined });
  vi.stubGlobal("navigator", {
    permissions: { query: async () => ({ state: permission }) },
    storage: { persisted: async () => permission === "granted", persist },
  });
  return {
    allow: () => {
      blocked = false;
    },
    persist,
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => resetStorageAccessForTests());
afterEach(() => vi.unstubAllGlobals());

describe("storage access", () => {
  it("reads a blocked browser on first use and says so to subscribers when it changes", async () => {
    const browser = fakeBrowser({ blocked: true });
    expect(getStorageAccess().state).toBe("blocked");
    const heard = vi.fn();
    subscribeStorageAccess(heard);
    browser.allow();
    const next = await recheckStorageAccess();
    expect(next.state).toBe("ok");
    expect(getStorageAccess().state).toBe("ok");
    expect(heard).toHaveBeenCalled();
  });

  it("asks the browser to keep the data once storage works", async () => {
    const browser = fakeBrowser({ blocked: false });
    await recheckStorageAccess();
    expect(browser.persist).toHaveBeenCalledOnce();
  });

  it("reports a refused persistence without greying anything", async () => {
    fakeBrowser({ blocked: false, persist: "denied" });
    getStorageAccess();
    await flush();
    expect(getStorageAccess()).toMatchObject({ state: "ok", persistDenied: true });
    expect(isStorageFeatureOff("save", getStorageAccess().state)).toBe(false);
  });

  it("opens and closes the dialog for one feature", () => {
    fakeBrowser({ blocked: true });
    requestStorageDialog("save");
    expect(getStorageAccess().dialog).toBe("save");
    closeStorageDialog();
    expect(getStorageAccess().dialog).toBeNull();
  });
});

describe("storage features", () => {
  it("greys every on-device control when storage is blocked", () => {
    for (const feature of ["save", "saved", "memory", "import"] as const) {
      expect(isStorageFeatureOff(feature, "blocked")).toBe(true);
      expect(isStorageFeatureOff(feature, "ok")).toBe(false);
    }
  });

  it("greys only the controls that write when storage is full", () => {
    expect(isStorageFeatureOff("save", "full")).toBe(true);
    expect(isStorageFeatureOff("import", "full")).toBe(true);
    expect(isStorageFeatureOff("saved", "full")).toBe(false);
    expect(isStorageFeatureOff("memory", "full")).toBe(false);
  });

  it("says why for the tapped feature", () => {
    const copy = storageDialogCopy("memory", "blocked");
    expect(copy.title).toBe("Trình duyệt đang chặn lưu dữ liệu");
    expect(copy.reason).toContain("ôn lại");
    expect(storageDialogCopy("save", "full").title).toBe("Bộ nhớ của trang đã đầy");
  });

  it("gives steps for the reader's browser, an in-app one first", () => {
    const zaloIphone =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile Zalo iOS";
    const steps = storageHelpSteps(zaloIphone, "save");
    expect(steps[0]).toContain("Zalo");
    expect(steps.some((s) => s.includes("Safari"))).toBe(true);
    const chrome = storageHelpSteps("Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile", "saved");
    expect(chrome.at(-1)).toContain("Chrome");
    expect(storageHelpSteps("Mozilla/5.0 Firefox/130", "keep")[0]).toContain("ổ khoá");
  });
});
