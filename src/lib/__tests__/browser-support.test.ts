import vm from "node:vm";
import { describe, expect, it } from "vitest";
import {
  buildLegacyBrowserWarningScript,
  evaluateBrowserSupport,
  UNSUPPORTED_BROWSER_COPY,
  UNSUPPORTED_BROWSER_SPECS,
  UNSUPPORTED_OS_SPECS,
  type BrowserCapabilities,
} from "../browser-support";

const ALL_CAPABILITIES: BrowserCapabilities = {
  cssSupports: true,
  oklch: true,
  colorMix: true,
  dvh: true,
  cssRegisterProperty: true,
  resizeObserver: true,
  intersectionObserver: true,
  webAnimations: true,
  objectHasOwn: true,
};

describe("browser-support catalog and detection", () => {
  it("exports non-empty catalogs of unsupported browsers and operating systems", () => {
    expect(UNSUPPORTED_BROWSER_SPECS.length).toBeGreaterThanOrEqual(8);
    expect(UNSUPPORTED_OS_SPECS.length).toBeGreaterThanOrEqual(4);
    expect(UNSUPPORTED_BROWSER_COPY.title).toContain("không như mong đợi");
  });

  it.each([
    [
      "Internet Explorer 11",
      "Mozilla/5.0 (Windows NT 10.0; WOW64; Trident/7.0; rv:11.0) like Gecko",
      ["ie"],
    ],
    [
      "Internet Explorer 8 on Windows 7",
      "Mozilla/4.0 (compatible; MSIE 8.0; Windows NT 6.1; Trident/4.0)",
      ["ie", "windows"],
    ],
    [
      "Edge Legacy (EdgeHTML 18)",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/70.0.3538.102 Safari/537.36 Edge/18.18362",
      ["edge-legacy"],
    ],
    [
      "Edge Chromium < 111",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36 Edg/109.0.1518.78",
      ["edge"],
    ],
    [
      "Chrome 109 on Windows 7",
      "Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36",
      ["chrome", "windows"],
    ],
    [
      "Android Facebook WebView with old Chromium 96",
      "Mozilla/5.0 (Linux; Android 10; SM-A505F Build/QP1A.190711.020; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/96.0.4664.104 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/345.0.0.34.118;]",
      ["chrome"],
    ],
    [
      "Safari 15.6 on macOS Catalina",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6.1 Safari/605.1.15",
      ["safari"],
    ],
    [
      "Safari 16.3 on macOS",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Safari/605.1.15",
      ["safari"],
    ],
    [
      "Firefox 115 ESR on Windows 8.1",
      "Mozilla/5.0 (Windows NT 6.3; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0",
      ["firefox", "windows"],
    ],
    [
      "Firefox 127 on Windows 10",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0",
      ["firefox"],
    ],
    [
      "Samsung Internet 20",
      "Mozilla/5.0 (Linux; Android 12; SM-S908B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/20.0 Chrome/106.0.5249.126 Mobile Safari/537.36",
      ["samsung-internet"],
    ],
    [
      "Opera 96",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36 OPR/96.0.0.0",
      ["opera"],
    ],
    [
      "Opera Mini",
      "Opera/9.80 (Android; Opera Mini/36.2.2254/119.132; U; en) Presto/2.12.423 Version/12.16",
      ["opera-mini"],
    ],
    [
      "Coc Coc < 117",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) coc_coc_browser/116.0.144 Chrome/110.0.5481.178 Safari/537.36",
      ["coccoc"],
    ],
    [
      "UC Browser 13",
      "Mozilla/5.0 (Linux; U; Android 10; en-US; CPH1909) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/78.0.3904.108 UCBrowser/13.4.0.1306 Mobile Safari/537.36",
      ["uc-browser"],
    ],
    [
      "Legacy Android 4.3 AOSP browser",
      "Mozilla/5.0 (Linux; U; Android 4.3; en-us; GT-I9300 Build/JSS15J) AppleWebKit/534.30 (KHTML, like Gecko) Version/4.0 Mobile Safari/534.30",
      ["android-aosp", "android"],
    ],
    [
      "iOS 15.8 Zalo in-app browser",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 15_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Zalo",
      ["ios"],
    ],
    [
      "Chrome iOS on iOS 16.3 (uses OS WebKit)",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/128.0.6613.98 Mobile/15E148 Safari/604.1",
      ["ios"],
    ],
    [
      "Android 6.0 with Chrome 106",
      "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.0.0 Mobile Safari/537.36",
      ["chrome", "android"],
    ],
    [
      "macOS 10.14 Mojave with Firefox 128",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.14; rv:128.0) Gecko/20100101 Firefox/128.0",
      ["macos"],
    ],
  ])("flags %s as unsupported", (_label, ua, expectedIds) => {
    const result = evaluateBrowserSupport({ userAgent: ua, capabilities: ALL_CAPABILITIES });
    expect(result.supported).toBe(false);
    expect(result.issues.map((i) => i.id)).toEqual(expectedIds);
    expect(result.detectedLabel).toBeTruthy();
  });

  it.each([
    [
      "Modern Chrome on macOS (frozen 10_15_7 UA)",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    ],
    [
      "Safari 17.5 on macOS",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
    ],
    [
      "Safari 16.4 on macOS",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.4 Safari/605.1.15",
    ],
    [
      "Edge 128 on Windows 10/11",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0",
    ],
    [
      "Firefox 128 on Windows 10",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0",
    ],
    [
      "Coc Coc 125 on Windows 10",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) coc_coc_browser/125.0.0 Chrome/119.0.0.0 Safari/537.36",
    ],
    [
      "iOS 17.5 Zalo in-app browser",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21F79 Zalo",
    ],
    [
      "Chrome iOS on iOS 16.4",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/128.0.6613.98 Mobile/15E148 Safari/604.1",
    ],
    [
      "Android 13 Facebook WebView with Chrome 124",
      "Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A.230805.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0.6367.179 Mobile Safari/537.36 [FB_IAB/FB4A;]",
    ],
    [
      "Samsung Internet 22 on Android 13",
      "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/22.0 Chrome/111.0.5563.116 Mobile Safari/537.36",
    ],
  ])("allows %s", (_label, ua) => {
    const result = evaluateBrowserSupport({ userAgent: ua, capabilities: ALL_CAPABILITIES });
    expect(result.supported).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.detectedLabel).toBeNull();
  });

  it("flags missing runtime CSS/DOM capabilities even when UA looks modern", () => {
    const result = evaluateBrowserSupport({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
      capabilities: { ...ALL_CAPABILITIES, oklch: false },
    });
    expect(result.supported).toBe(false);
    expect(result.issues.map((i) => i.id)).toEqual(["modern-css"]);
  });

  it("builds an ES5-safe legacy fallback script that warns when React fails to boot on old browsers", () => {
    const script = buildLegacyBrowserWarningScript();
    expect(script).not.toMatch(/\b(const|let)\b|=>|`/);

    function runScriptWith(ua: string, booted: boolean) {
      const appended: Array<{ id: string; text: string }> = [];
      let scheduledFn: (() => void) | null = null;
      const createNode = () => {
        const node = {
          id: "",
          type: "",
          style: { cssText: "" },
          children: [] as unknown[],
          parentNode: null as { removeChild: () => void } | null,
          setAttribute: () => {},
          appendChild: (child: unknown) => {
            node.children.push(child);
          },
          onclick: null as (() => void) | null,
        };
        return node;
      };
      const context: Record<string, unknown> = {
        navigator: { userAgent: ua },
        CSS: {
          supports: () => true,
          registerProperty: () => {},
        },
        ResizeObserver: function () {},
        Object: { hasOwn: () => true },
        setTimeout: (fn: () => void) => {
          scheduledFn = fn;
        },
        document: {
          body: {
            appendChild: (el: {
              id: string;
              children: Array<{ children: Array<{ text?: string }> }>;
            }) => {
              const firstText = el.children[0]?.children[0]?.text ?? "";
              appended.push({ id: el.id, text: firstText });
            },
          },
          getElementById: () => null,
          createElement: createNode,
          createTextNode: (text: string) => ({ text }),
        },
      };
      context.window = Object.assign(context, { __KINE_APP_BOOTED__: booted });
      vm.runInNewContext(script, context);
      if (scheduledFn) (scheduledFn as () => void)();
      return appended;
    }

    const ieResult = runScriptWith(
      "Mozilla/5.0 (Windows NT 6.1; WOW64; Trident/7.0; rv:11.0) like Gecko",
      false,
    );
    expect(ieResult).toHaveLength(1);
    expect(ieResult[0].text).toBe(UNSUPPORTED_BROWSER_COPY.title);

    const modernResult = runScriptWith(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
      false,
    );
    expect(modernResult).toEqual([]);

    const bootedResult = runScriptWith(
      "Mozilla/5.0 (Windows NT 6.1; WOW64; Trident/7.0; rv:11.0) like Gecko",
      true,
    );
    expect(bootedResult).toEqual([]);
  });
});
