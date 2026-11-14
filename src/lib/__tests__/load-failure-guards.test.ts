import { describe, expect, it, vi } from "vitest";
import {
  buildErrorReport,
  diagnoseFailure,
  errorReportSchema,
  reportLines,
  type ReportEnv,
} from "../error-report";
import { LOAD_FAILURE_CASES } from "../load-failure-catalog";
import { isStaleChunkError, reloadOnceForStaleChunk, RELOAD_GUARD_MS } from "../stale-chunk";
import { probeLocalStorage } from "../storage-probe";

const env = (over: Partial<ReportEnv> = {}): ReportEnv => ({
  online: true,
  translated: false,
  browserIssues: [],
  browserLabel: null,
  storage: "ok",
  route: "/",
  stage: "lead",
  build: "index-abc123.js",
  userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/130",
  viewport: "390x844",
  dpr: 3,
  touch: true,
  language: "vi-VN",
  network: "4g",
  secondsSinceLoad: 12.4,
  ...over,
});

function memoryStore() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
  };
}

describe("isStaleChunkError", () => {
  it("knows each browser's wording for a chunk that could not be fetched", () => {
    expect(
      isStaleChunkError(new TypeError("Failed to fetch dynamically imported module: /assets/a.js")),
    ).toBe(true);
    expect(isStaleChunkError(new TypeError("Importing a module script failed."))).toBe(true);
    expect(isStaleChunkError(new TypeError("error loading dynamically imported module"))).toBe(
      true,
    );
    expect(isStaleChunkError(new Error("Unable to preload CSS for /assets/b.css"))).toBe(true);
  });

  it("leaves every other error alone", () => {
    expect(isStaleChunkError(new TypeError("Cannot read properties of undefined"))).toBe(false);
    expect(isStaleChunkError(null)).toBe(false);
  });
});

describe("reloadOnceForStaleChunk", () => {
  it("reloads once, then refuses inside the guard window, then reloads again after it", () => {
    const store = memoryStore();
    const reload = vi.fn();
    expect(reloadOnceForStaleChunk({ now: 1000, store, reload })).toBe(true);
    expect(reloadOnceForStaleChunk({ now: 1000 + RELOAD_GUARD_MS - 1, store, reload })).toBe(false);
    expect(reloadOnceForStaleChunk({ now: 1000 + RELOAD_GUARD_MS, store, reload })).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("never reloads without somewhere to remember it tried, so it cannot loop", () => {
    const reload = vi.fn();
    expect(reloadOnceForStaleChunk({ now: 1, store: null, reload })).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});

describe("probeLocalStorage", () => {
  const quota = Object.assign(new Error("full"), { name: "QuotaExceededError" });
  const store = (length: number, fail?: Error) =>
    ({
      length,
      setItem: () => {
        if (fail) throw fail;
      },
      removeItem: () => undefined,
    }) as unknown as Storage;

  it("reads a working store as ok", () => expect(probeLocalStorage(() => store(3))).toBe("ok"));
  it("reads a quota error on a store with data as full", () =>
    expect(probeLocalStorage(() => store(40, quota))).toBe("full"));
  it("reads a quota error on an empty store as blocked (old Safari private mode)", () =>
    expect(probeLocalStorage(() => store(0, quota))).toBe("blocked"));
  it("reads a refusal or a missing store as blocked", () => {
    expect(probeLocalStorage(() => store(0, new Error("SecurityError")))).toBe("blocked");
    expect(probeLocalStorage(() => null)).toBe("blocked");
    expect(
      probeLocalStorage(() => {
        throw new Error("denied");
      }),
    ).toBe("blocked");
  });
});

describe("diagnoseFailure", () => {
  const crash = new TypeError("x is undefined");

  it("checks the network first, then support, and only then blames us", () => {
    expect(diagnoseFailure(crash, env({ online: false, translated: true }))).toEqual({
      caseId: "offline",
      offerReport: false,
    });
    expect(diagnoseFailure(crash, env({ browserIssues: ["safari-old"] })).caseId).toBe(
      "outdated-browser",
    );
    expect(diagnoseFailure(crash, env({ translated: true })).caseId).toBe("page-translation");
    expect(diagnoseFailure(crash, env())).toEqual({ caseId: "render-crash", offerReport: true });
    expect(diagnoseFailure(new Error("Maximum update depth exceeded."), env()).caseId).toBe(
      "render-loop",
    );
  });

  it("settles only on cases the catalogue knows", () => {
    const ids = new Set(LOAD_FAILURE_CASES.map((entry) => entry.id));
    for (const over of [{ online: false }, { browserIssues: ["a"] }, { translated: true }, {}]) {
      expect(ids.has(diagnoseFailure(crash, env(over)).caseId)).toBe(true);
    }
  });
});

describe("buildErrorReport", () => {
  it("builds a report the server accepts, with the site's address dropped from the stack", () => {
    const error = new TypeError("boom");
    error.stack = "TypeError: boom\n    at f (https://anh.chayla.app/assets/index-1.js:1:2)";
    const report = buildErrorReport(
      error,
      diagnoseFailure(error, env()),
      env(),
      "  tapped next  ",
      "https://anh.chayla.app",
    );
    expect(errorReportSchema.safeParse(report).success).toBe(true);
    expect(report.stack).toContain("(/assets/index-1.js:1:2)");
    expect(report.note).toBe("tapped next");
    expect(reportLines(report).map(([label]) => label)).toContain("Chi tiết kỹ thuật");
  });

  it("clips anything long to what the server accepts", () => {
    const error = new Error("m".repeat(5000));
    error.stack = "s".repeat(9000);
    const report = buildErrorReport(error, diagnoseFailure(error, env()), env(), "n".repeat(900));
    expect(errorReportSchema.safeParse(report).success).toBe(true);
  });
});
