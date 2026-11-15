import { afterEach, describe, expect, it, vi } from "vitest";
import { classifyWriter, noteBotRefusal } from "../bot-signals";
import { CLIENT_AUTOMATION_HEADER } from "../client-signals";

const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1";
const OLD_ZALO_WEBVIEW =
  "Mozilla/5.0 (Linux; Android 9; SM-J600G Build/PPR1.180610.011; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/95.0.4638.74 Mobile Safari/537.36 Zalo android/12000";

/** A write from our own page: same-origin fetch or beacon, with a browser's headers. */
function write(
  headers: Record<string, string | null>,
  url = "https://anh.chayla.app/api/public/telemetry",
) {
  const base: Record<string, string> = {
    "user-agent": ANDROID_CHROME,
    "accept-language": "vi-VN,vi;q=0.9",
    "sec-fetch-site": "same-origin",
    "sec-fetch-mode": "cors",
    "sec-ch-ua": '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
  };
  for (const [key, value] of Object.entries(headers)) {
    if (value === null) delete base[key];
    else base[key] = value;
  }
  return new Request(url, { method: "POST", headers: base });
}

describe("classifyWriter", () => {
  it("passes a reader's browser with nothing to note", () => {
    expect(classifyWriter(write({}))).toEqual({ reject: false, enforcing: [], shadow: [] });
  });

  it("passes a sendBeacon write (no-cors) from our page", () => {
    expect(classifyWriter(write({ "sec-fetch-mode": "no-cors" })).reject).toBe(false);
  });

  it("passes Safari and Chrome on iPhone, which send no client hints", () => {
    for (const agent of [IPHONE_SAFARI, IPHONE_CHROME]) {
      const verdict = classifyWriter(write({ "user-agent": agent, "sec-ch-ua": null }));
      expect(verdict).toEqual({ reject: false, enforcing: [], shadow: [] });
    }
  });

  it("refuses tools, crawlers and headless drivers", () => {
    for (const agent of [
      "curl/8.4.0",
      "python-requests/2.31",
      "Mozilla/5.0 (compatible; Googlebot/2.1)",
      "Mozilla/5.0 HeadlessChrome/130.0",
    ]) {
      const verdict = classifyWriter(write({ "user-agent": agent }));
      expect(verdict.reject).toBe(true);
      expect(verdict.enforcing).toContain("tool-agent");
    }
  });

  it("refuses a browser that says it is under automation", () => {
    const verdict = classifyWriter(write({ [CLIENT_AUTOMATION_HEADER]: "1" }));
    expect(verdict.enforcing).toEqual(["client-automation"]);
  });

  it("refuses a write sent from another site", () => {
    expect(classifyWriter(write({ "sec-fetch-site": "cross-site" })).enforcing).toEqual([
      "cross-site",
    ]);
  });

  it("only records what an old in-app browser may also look like", () => {
    const verdict = classifyWriter(
      write({
        "user-agent": OLD_ZALO_WEBVIEW,
        "sec-ch-ua": null,
        "accept-language": null,
        "sec-fetch-site": null,
      }),
    );
    expect(verdict.reject).toBe(false);
    expect(verdict.shadow).toEqual([
      "no-accept-language",
      "no-fetch-metadata",
      "missing-client-hints",
      "stale-chromium",
    ]);
  });

  it("notes client hints that do not match the user agent's version", () => {
    expect(classifyWriter(write({ "sec-ch-ua": '"Chromium";v="120"' })).shadow).toEqual([
      "client-hints-mismatch",
    ]);
  });

  it("does not expect Fetch Metadata over plain http, where browsers send none", () => {
    const verdict = classifyWriter(
      write(
        { "sec-fetch-site": null, "sec-ch-ua": null },
        "http://192.168.1.50:5195/api/public/telemetry",
      ),
    );
    expect(verdict).toEqual({ reject: false, enforcing: [], shadow: [] });
  });
});

describe("noteBotRefusal", () => {
  afterEach(() => vi.restoreAllMocks());

  it("logs the first refusal for a path and reason, then one line a minute", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const verdict = { reject: true, enforcing: ["client-automation"], shadow: [] };
    noteBotRefusal("/api/public/test-only", verdict, 0);
    noteBotRefusal("/api/public/test-only", verdict, 1000);
    noteBotRefusal("/api/public/test-only", verdict, 2000);
    expect(warn).toHaveBeenCalledTimes(1);
    noteBotRefusal("/api/public/test-only", verdict, 61_000);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[1]![0]).toContain("client-automation: refused 3 in the last 61 s");
  });
});
