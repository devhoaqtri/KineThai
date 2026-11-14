/**
 * Unsupported old browser and operating system catalog and detection.
 *
 * The app relies on Tailwind CSS v4 (`@property`, `oklch()`, `color-mix()`, CSS
 * nesting), dynamic viewport units (`dvh`), React 19 / ES2022 (`Object.hasOwn`),
 * Web Animations (`Element.animate`), `ResizeObserver`, and `IntersectionObserver`.
 * Browsers and operating systems below those baselines render broken layouts,
 * missing colors, or fail to boot.
 *
 * Exports: MINIMUM_SUPPORTED_VERSIONS, UNSUPPORTED_BROWSER_SPECS,
 *   UNSUPPORTED_OS_SPECS, UNSUPPORTED_BROWSER_COPY, evaluateBrowserSupport,
 *   detectRuntimeCapabilities, checkCurrentBrowserSupport,
 *   buildLegacyBrowserWarningScript
 * Depends on: none (leaf module)
 */

export interface MajorMinorVersion {
  readonly major: number;
  readonly minor: number;
}

export interface BrowserSupportRuleSpec {
  readonly id: string;
  readonly name: string;
  readonly unsupportedRule: string;
  readonly reason: string;
}

export interface BrowserCapabilities {
  readonly cssSupports: boolean;
  readonly oklch: boolean;
  readonly colorMix: boolean;
  readonly dvh: boolean;
  readonly cssRegisterProperty: boolean;
  readonly resizeObserver: boolean;
  readonly intersectionObserver: boolean;
  readonly webAnimations: boolean;
  readonly objectHasOwn: boolean;
}

export interface BrowserSupportIssue {
  readonly kind: "browser" | "os" | "capability";
  readonly id: string;
  readonly detected: string;
}

export interface BrowserSupportResult {
  readonly supported: boolean;
  readonly issues: readonly BrowserSupportIssue[];
  /** Concise human-readable summary of the detected old OS/browser, if any. */
  readonly detectedLabel: string | null;
}

/** Minimum versions required by the app's CSS, layout, and JS runtime features. */
export const MINIMUM_SUPPORTED_VERSIONS = {
  chrome: 111,
  edge: 111,
  safari: { major: 16, minor: 4 } as MajorMinorVersion,
  firefox: 128,
  samsungInternet: 21,
  opera: 97,
  cocCoc: 117,
  ucBrowser: 15,
  ios: { major: 16, minor: 4 } as MajorMinorVersion,
  android: 7,
  windowsNt: 10,
  /**
   * macOS 11+ and 10.15 Catalina both freeze UA strings at `10_15_7`. We only flag OS
   * strings <= 10.14 here; Catalina's max Safari (15.6) is caught by the Safari rule.
   */
  macOsExplicitMaxUnsupportedMinor: 14,
} as const;

/** Catalog of unsupported old browsers and WebViews. */
export const UNSUPPORTED_BROWSER_SPECS: readonly BrowserSupportRuleSpec[] = [
  {
    id: "ie",
    name: "Internet Explorer (mọi phiên bản, IE 6–11)",
    unsupportedRule: "Tất cả phiên bản (MSIE / Trident)",
    reason: "Không hỗ trợ ES modules, React 19, CSS variables và Web Animations.",
  },
  {
    id: "edge-legacy",
    name: "Microsoft Edge Legacy (EdgeHTML < 79)",
    unsupportedRule: "Edge/12 – Edge/18",
    reason: "Nhân EdgeHTML cũ thiếu ResizeObserver, ES2022 và Tailwind CSS v4.",
  },
  {
    id: "chrome",
    name: "Google Chrome / Chromium / Android WebView",
    unsupportedRule: `< ${MINIMUM_SUPPORTED_VERSIONS.chrome}`,
    reason: "Thiếu oklch(), color-mix() và các thuộc tính CSS hiện đại (ra mắt Chrome 111).",
  },
  {
    id: "safari",
    name: "Safari (macOS / iOS / iPadOS)",
    unsupportedRule: `< ${MINIMUM_SUPPORTED_VERSIONS.safari.major}.${MINIMUM_SUPPORTED_VERSIONS.safari.minor}`,
    reason: "Thiếu CSS @property (Safari 16.4), color-mix() (16.2) hoặc oklch()/dvh (15.4).",
  },
  {
    id: "firefox",
    name: "Mozilla Firefox",
    unsupportedRule: `< ${MINIMUM_SUPPORTED_VERSIONS.firefox} (bao gồm Firefox 115 ESR trở về trước)`,
    reason: "Thiếu CSS @property (Firefox 128) và Intl.Segmenter (Firefox 125).",
  },
  {
    id: "edge",
    name: "Microsoft Edge (Chromium)",
    unsupportedRule: `< ${MINIMUM_SUPPORTED_VERSIONS.edge}`,
    reason: "Dựa trên nhân Chromium cũ dưới 111, thiếu oklch() và color-mix().",
  },
  {
    id: "samsung-internet",
    name: "Samsung Internet",
    unsupportedRule: `< ${MINIMUM_SUPPORTED_VERSIONS.samsungInternet}`,
    reason: "Samsung Internet 20 trở về trước dùng Chromium <= 106, thiếu CSS màu hiện đại.",
  },
  {
    id: "opera",
    name: "Opera & Opera Mini",
    unsupportedRule: `Opera < ${MINIMUM_SUPPORTED_VERSIONS.opera} và toàn bộ Opera Mini`,
    reason: "Opera cũ thiếu Chromium 111; Opera Mini dùng proxy nén, làm hỏng animation.",
  },
  {
    id: "coccoc",
    name: "Cốc Cốc",
    unsupportedRule: `< ${MINIMUM_SUPPORTED_VERSIONS.cocCoc}`,
    reason: "Dựa trên nhân Chromium cũ dưới 111.",
  },
  {
    id: "uc-browser",
    name: "UC Browser",
    unsupportedRule: `< ${MINIMUM_SUPPORTED_VERSIONS.ucBrowser}`,
    reason: "Nhân WebView cũ thiếu API bố cục và hiệu ứng hiện đại.",
  },
  {
    id: "android-aosp",
    name: "Trình duyệt Android gốc cũ (AOSP WebKit) & BlackBerry / Symbian",
    unsupportedRule: "Android Stock Browser không có Chrome/, BlackBerry, Symbian",
    reason: "Trình duyệt hệ thống cũ không hỗ trợ ES modules và Web Animations.",
  },
];

/** Catalog of unsupported old operating systems. */
export const UNSUPPORTED_OS_SPECS: readonly BrowserSupportRuleSpec[] = [
  {
    id: "ios",
    name: "iOS / iPadOS",
    unsupportedRule: `< ${MINIMUM_SUPPORTED_VERSIONS.ios.major}.${MINIMUM_SUPPORTED_VERSIONS.ios.minor} (iOS 9–15, 16.0–16.3)`,
    reason:
      "Trên iOS, mọi trình duyệt và app (Zalo, Facebook, Messenger, Chrome, Safari) đều dùng chung WebKit của hệ điều hành.",
  },
  {
    id: "android",
    name: "Android",
    unsupportedRule: `< ${MINIMUM_SUPPORTED_VERSIONS.android}.0 (Android 4.x KitKat, 5.x Lollipop, 6.x Marshmallow)`,
    reason:
      "Ngừng cập nhật Chrome và Android System WebView ở mức Chromium <= 106, thấp hơn ngưỡng 111.",
  },
  {
    id: "windows",
    name: "Windows & Windows Phone",
    unsupportedRule: "Windows XP / Vista / 7 / 8 / 8.1 (Windows NT < 10.0) và mọi Windows Phone",
    reason: "Chrome/Edge dừng ở bản 109 và Firefox dừng ở bản 115 ESR trên Windows 7/8/8.1.",
  },
  {
    id: "macos",
    name: "macOS",
    unsupportedRule: "<= 10.14 Mojave (và Safari <= 15.6 trên macOS 10.15 Catalina)",
    reason: "Không thể cài Safari 16.4+ hoặc Chrome/Edge mới.",
  },
];

/** Vietnamese warning copy shown when an unsupported browser or OS is detected. */
export const UNSUPPORTED_BROWSER_COPY = {
  title: "Trang có thể hoạt động không như mong đợi",
  description:
    "Trình duyệt hoặc hệ điều hành bạn đang dùng đã cũ nên một số hiệu ứng, màu sắc hoặc tính năng có thể hiển thị sai hay không chạy. Hãy cập nhật thiết bị hoặc mở trang bằng trình duyệt mới hơn (Chrome, Safari, Firefox, Edge).",
  dismissLabel: "Đã hiểu",
} as const;

function compareVersions(majorA: number, minorA: number, majorB: number, minorB: number): number {
  if (majorA !== majorB) return majorA - majorB;
  return minorA - minorB;
}

function parseIntMatch(ua: string, pattern: RegExp): number | null {
  const match = pattern.exec(ua);
  if (!match) return null;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseMajorMinorMatch(ua: string, pattern: RegExp): MajorMinorVersion | null {
  const match = pattern.exec(ua);
  if (!match) return null;
  const major = Number.parseInt(match[1], 10);
  const minor = match[2] ? Number.parseInt(match[2], 10) : 0;
  if (Number.isNaN(major) || Number.isNaN(minor)) return null;
  return { major, minor };
}

function windowsNameFromNt(major: number, minor: number): string {
  if (major === 5) return minor === 0 ? "Windows 2000" : "Windows XP";
  if (major === 6 && minor === 0) return "Windows Vista";
  if (major === 6 && minor === 1) return "Windows 7";
  if (major === 6 && minor === 2) return "Windows 8";
  if (major === 6 && minor === 3) return "Windows 8.1";
  return `Windows NT ${major}.${minor}`;
}

function detectUnsupportedOs(ua: string): BrowserSupportIssue | null {
  if (/Windows Phone|IEMobile/i.test(ua)) {
    return { kind: "os", id: "windows-phone", detected: "Windows Phone" };
  }

  const winNt = parseMajorMinorMatch(ua, /Windows NT (\d+)\.(\d+)/i);
  if (winNt && winNt.major < MINIMUM_SUPPORTED_VERSIONS.windowsNt) {
    return {
      kind: "os",
      id: "windows",
      detected: windowsNameFromNt(winNt.major, winNt.minor),
    };
  }

  const ios = parseMajorMinorMatch(ua, /(?:iPhone|iPad|iPod)[^)]*?\bOS (\d+)[_.](\d+)/i);
  if (
    ios &&
    compareVersions(
      ios.major,
      ios.minor,
      MINIMUM_SUPPORTED_VERSIONS.ios.major,
      MINIMUM_SUPPORTED_VERSIONS.ios.minor,
    ) < 0
  ) {
    return { kind: "os", id: "ios", detected: `iOS ${ios.major}.${ios.minor}` };
  }

  const android = parseMajorMinorMatch(ua, /\bAndroid\s+(\d+)(?:\.(\d+))?/i);
  if (android && android.major < MINIMUM_SUPPORTED_VERSIONS.android) {
    return {
      kind: "os",
      id: "android",
      detected:
        android.minor > 0
          ? `Android ${android.major}.${android.minor}`
          : `Android ${android.major}`,
    };
  }

  const macOs = parseMajorMinorMatch(ua, /Mac OS X (\d+)[_.](\d+)/i);
  if (
    macOs &&
    (macOs.major < 10 ||
      (macOs.major === 10 &&
        macOs.minor <= MINIMUM_SUPPORTED_VERSIONS.macOsExplicitMaxUnsupportedMinor))
  ) {
    return {
      kind: "os",
      id: "macos",
      detected: `macOS ${macOs.major}.${macOs.minor}`,
    };
  }

  return null;
}

function detectUnsupportedBrowser(ua: string): BrowserSupportIssue | null {
  if (/MSIE\s+\d+|Trident\/\d+/i.test(ua)) {
    const ieVer = parseIntMatch(ua, /MSIE\s+(\d+)/i) ?? (/\bTrident\/7\.0/i.test(ua) ? 11 : null);
    return {
      kind: "browser",
      id: "ie",
      detected: ieVer ? `Internet Explorer ${ieVer}` : "Internet Explorer",
    };
  }

  const edgeLegacy = parseIntMatch(ua, /\bEdge\/(\d+)/i);
  if (edgeLegacy !== null) {
    return {
      kind: "browser",
      id: "edge-legacy",
      detected: `Edge Legacy ${edgeLegacy}`,
    };
  }

  if (/Opera Mini/i.test(ua)) {
    return { kind: "browser", id: "opera-mini", detected: "Opera Mini" };
  }

  if (/BlackBerry|BB10|Symbian|Series60|NokiaBrowser/i.test(ua)) {
    return { kind: "browser", id: "legacy-mobile", detected: "Trình duyệt di động cũ" };
  }

  if (
    /\bAndroid\b/i.test(ua) &&
    /\bAppleWebKit\b/i.test(ua) &&
    /\bVersion\/\d/i.test(ua) &&
    !/\bChrome\/\d/i.test(ua)
  ) {
    return { kind: "browser", id: "android-aosp", detected: "Android Browser cũ" };
  }

  const uc = parseIntMatch(ua, /\bUCBrowser\/(\d+)/i);
  if (uc !== null) {
    return uc < MINIMUM_SUPPORTED_VERSIONS.ucBrowser
      ? { kind: "browser", id: "uc-browser", detected: `UC Browser ${uc}` }
      : null;
  }
  if (/\bUCWEB\b/i.test(ua)) {
    return { kind: "browser", id: "uc-browser", detected: "UC Browser" };
  }

  const cocCoc = parseIntMatch(ua, /\bcoc_coc_browser\/(\d+)/i);
  if (cocCoc !== null) {
    return cocCoc < MINIMUM_SUPPORTED_VERSIONS.cocCoc
      ? { kind: "browser", id: "coccoc", detected: `Cốc Cốc ${cocCoc}` }
      : null;
  }

  const samsung = parseIntMatch(ua, /\bSamsungBrowser\/(\d+)/i);
  if (samsung !== null) {
    return samsung < MINIMUM_SUPPORTED_VERSIONS.samsungInternet
      ? { kind: "browser", id: "samsung-internet", detected: `Samsung Internet ${samsung}` }
      : null;
  }

  const opera = parseIntMatch(ua, /\bOPR\/(\d+)/i) ?? parseIntMatch(ua, /\bOpera\/(\d+)/i);
  if (opera !== null) {
    return opera < MINIMUM_SUPPORTED_VERSIONS.opera
      ? { kind: "browser", id: "opera", detected: `Opera ${opera}` }
      : null;
  }

  const edge = parseIntMatch(ua, /\bEdgA?\/(\d+)/i);
  if (edge !== null) {
    return edge < MINIMUM_SUPPORTED_VERSIONS.edge
      ? { kind: "browser", id: "edge", detected: `Edge ${edge}` }
      : null;
  }

  const firefox = parseIntMatch(ua, /\bFirefox\/(\d+)/i);
  if (firefox !== null) {
    return firefox < MINIMUM_SUPPORTED_VERSIONS.firefox
      ? { kind: "browser", id: "firefox", detected: `Firefox ${firefox}` }
      : null;
  }

  const isIosDevice = /\b(?:iPhone|iPad|iPod)\b/i.test(ua);
  if (!isIosDevice) {
    const chrome = parseIntMatch(ua, /\b(?:Chrome|Chromium)\/(\d+)/i);
    if (chrome !== null) {
      return chrome < MINIMUM_SUPPORTED_VERSIONS.chrome
        ? { kind: "browser", id: "chrome", detected: `Chrome ${chrome}` }
        : null;
    }
  }

  // Desktop/iPadOS Safari carries `Version/X.Y Safari/...` without Chromium/Firefox tokens.
  const isSafariUa =
    /\bSafari\/\d/i.test(ua) &&
    !/\b(?:Chrome|Chromium|CriOS|FxiOS|Edg|EdgiOS|EdgA|OPR|SamsungBrowser|coc_coc_browser|UCBrowser|Android)\b/i.test(
      ua,
    );
  if (isSafariUa) {
    const safari = parseMajorMinorMatch(ua, /\bVersion\/(\d+)(?:\.(\d+))?/i);
    if (
      safari &&
      compareVersions(
        safari.major,
        safari.minor,
        MINIMUM_SUPPORTED_VERSIONS.safari.major,
        MINIMUM_SUPPORTED_VERSIONS.safari.minor,
      ) < 0
    ) {
      return {
        kind: "browser",
        id: "safari",
        detected: `Safari ${safari.major}.${safari.minor}`,
      };
    }
  }

  return null;
}

function detectMissingCapabilities(capabilities: BrowserCapabilities): BrowserSupportIssue[] {
  const issues: BrowserSupportIssue[] = [];
  if (
    !capabilities.cssSupports ||
    !capabilities.oklch ||
    !capabilities.colorMix ||
    !capabilities.dvh ||
    !capabilities.cssRegisterProperty
  ) {
    issues.push({
      kind: "capability",
      id: "modern-css",
      detected: "Thiếu hỗ trợ CSS hiện đại",
    });
  }
  if (
    !capabilities.resizeObserver ||
    !capabilities.intersectionObserver ||
    !capabilities.webAnimations ||
    !capabilities.objectHasOwn
  ) {
    issues.push({
      kind: "capability",
      id: "modern-dom-js",
      detected: "Thiếu API trình duyệt cần thiết",
    });
  }
  return issues;
}

/**
 * Evaluate whether a browser user agent and/or runtime capabilities meet the app's requirements.
 * @param params.userAgent - Navigator user agent string
 * @param params.capabilities - Optional measured runtime capabilities
 * @returns Support verdict, detected issues, and readable label
 */
export function evaluateBrowserSupport({
  userAgent,
  capabilities,
}: {
  userAgent: string;
  capabilities?: BrowserCapabilities | null;
}): BrowserSupportResult {
  const issues: BrowserSupportIssue[] = [];
  const ua = userAgent.trim();

  if (ua.length > 0) {
    const browserIssue = detectUnsupportedBrowser(ua);
    if (browserIssue) issues.push(browserIssue);
    const osIssue = detectUnsupportedOs(ua);
    if (osIssue) issues.push(osIssue);
  }

  if (capabilities) {
    issues.push(...detectMissingCapabilities(capabilities));
  }

  const uaLabels = issues
    .filter((issue) => issue.kind === "browser" || issue.kind === "os")
    .map((issue) => issue.detected);
  const detectedLabel = uaLabels.length > 0 ? uaLabels.join(" · ") : null;

  return {
    supported: issues.length === 0,
    issues,
    detectedLabel,
  };
}

/**
 * Probe current browser runtime APIs safely. Returns `null` during SSR or in DOM test
 * environments (jsdom/happy-dom) so missing test stubs never produce false warnings.
 */
export function detectRuntimeCapabilities(): BrowserCapabilities | null {
  if (typeof window === "undefined" || typeof document === "undefined") return null;
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  if (!ua || /jsdom|happy-dom/i.test(ua)) return null;

  const hasCssSupports =
    typeof window.CSS !== "undefined" && typeof window.CSS.supports === "function";

  const safeSupports = (prop: string, value: string): boolean => {
    if (!hasCssSupports) return false;
    try {
      return window.CSS.supports(prop, value);
    } catch {
      return false;
    }
  };

  return {
    cssSupports: hasCssSupports,
    oklch: safeSupports("color", "oklch(0.7 0.2 340)"),
    colorMix: safeSupports("color", "color-mix(in srgb, #fff 50%, #000)"),
    dvh: safeSupports("height", "100dvh"),
    cssRegisterProperty:
      typeof window.CSS !== "undefined" && typeof window.CSS.registerProperty === "function",
    resizeObserver: typeof window.ResizeObserver === "function",
    intersectionObserver: typeof window.IntersectionObserver === "function",
    webAnimations:
      typeof Element !== "undefined" && typeof Element.prototype.animate === "function",
    objectHasOwn: typeof Object.hasOwn === "function",
  };
}

/** Check support on the currently executing browser environment. */
export function checkCurrentBrowserSupport(): BrowserSupportResult {
  if (typeof navigator === "undefined") {
    return { supported: true, issues: [], detectedLabel: null };
  }
  return evaluateBrowserSupport({
    userAgent: navigator.userAgent ?? "",
    capabilities: detectRuntimeCapabilities(),
  });
}

/**
 * Build an ES5-safe inline bootstrap script that renders the Vietnamese warning banner
 * if the main ES2022/React bundle fails to boot on very old browsers (e.g., IE 11,
 * EdgeHTML, iOS <= 13, Android <= 6 WebView).
 *
 * Uses `MINIMUM_SUPPORTED_VERSIONS` and `UNSUPPORTED_BROWSER_COPY` as its single source
 * of truth so rules never drift.
 */
export function buildLegacyBrowserWarningScript(): string {
  const min = MINIMUM_SUPPORTED_VERSIONS;
  return `(function () {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  var dismissedKey = "kine.browser_compat_dismissed";
  function readDismissed() {
    try { return window.sessionStorage && window.sessionStorage.getItem(dismissedKey) === "1"; } catch (e) { return false; }
  }
  function parseVer(ua, re) {
    var m = re.exec(ua);
    if (!m) return null;
    var maj = parseInt(m[1], 10);
    var minV = m[2] ? parseInt(m[2], 10) : 0;
    return isNaN(maj) ? null : { maj: maj, min: isNaN(minV) ? 0 : minV };
  }
  function lt(v, reqMaj, reqMin) {
    return v && (v.maj < reqMaj || (v.maj === reqMaj && v.min < reqMin));
  }
  function isUnsupportedLegacy() {
    var ua = (window.navigator && window.navigator.userAgent) || "";
    if (!ua || /jsdom|happy-dom/i.test(ua)) return false;
    if (/MSIE\\s+\\d+|Trident\\/\\d+|\\bEdge\\/\\d+|Opera Mini|BlackBerry|BB10|Symbian|Series60|NokiaBrowser|UCWEB|Windows Phone|IEMobile/i.test(ua)) return true;
    var uc = parseVer(ua, /\\bUCBrowser\\/(\\d+)/i);
    if (uc && uc.maj < ${min.ucBrowser}) return true;
    var win = parseVer(ua, /Windows NT (\\d+)\\.(\\d+)/i);
    if (win && win.maj < ${min.windowsNt}) return true;
    var ios = parseVer(ua, /(?:iPhone|iPad|iPod)[^)]*?\\bOS (\\d+)[_.](\\d+)/i);
    if (lt(ios, ${min.ios.major}, ${min.ios.minor})) return true;
    var andr = parseVer(ua, /\\bAndroid\\s+(\\d+)(?:\\.(\\d+))?/i);
    if (andr && andr.maj < ${min.android}) return true;
    var mac = parseVer(ua, /Mac OS X (\\d+)[_.](\\d+)/i);
    if (mac && (mac.maj < 10 || (mac.maj === 10 && mac.min <= ${min.macOsExplicitMaxUnsupportedMinor}))) return true;
    if (/\\bAndroid\\b/i.test(ua) && /\\bAppleWebKit\\b/i.test(ua) && /\\bVersion\\/\\d/i.test(ua) && !/\\bChrome\\/\\d/i.test(ua)) return true;
    var ff = parseVer(ua, /\\bFirefox\\/(\\d+)/i);
    if (ff && ff.maj < ${min.firefox}) return true;
    var edg = parseVer(ua, /\\bEdgA?\\/(\\d+)/i);
    if (edg && edg.maj < ${min.edge}) return true;
    var sam = parseVer(ua, /\\bSamsungBrowser\\/(\\d+)/i);
    if (sam && sam.maj < ${min.samsungInternet}) return true;
    var opr = parseVer(ua, /\\b(?:OPR|Opera)\\/(\\d+)/i);
    if (opr && opr.maj < ${min.opera}) return true;
    var cc = parseVer(ua, /\\bcoc_coc_browser\\/(\\d+)/i);
    if (cc && cc.maj < ${min.cocCoc}) return true;
    if (!/\\b(?:iPhone|iPad|iPod)\\b/i.test(ua)) {
      var chr = parseVer(ua, /\\b(?:Chrome|Chromium)\\/(\\d+)/i);
      if (chr && chr.maj < ${min.chrome}) return true;
    }
    if (/\\bSafari\\/\\d/i.test(ua) && !/\\b(?:Chrome|Chromium|CriOS|FxiOS|Edg|EdgiOS|EdgA|OPR|SamsungBrowser|coc_coc_browser|UCBrowser|Android)\\b/i.test(ua)) {
      var saf = parseVer(ua, /\\bVersion\\/(\\d+)(?:\\.(\\d+))?/i);
      if (lt(saf, ${min.safari.major}, ${min.safari.minor})) return true;
    }
    try {
      if (!window.CSS || typeof window.CSS.supports !== "function") return true;
      if (!window.CSS.supports("color", "oklch(0.7 0.2 340)") || !window.CSS.supports("color", "color-mix(in srgb, #fff 50%, #000)") || !window.CSS.supports("height", "100dvh")) return true;
      if (typeof window.CSS.registerProperty !== "function" || typeof window.ResizeObserver !== "function" || typeof Object.hasOwn !== "function") return true;
    } catch (e) { return true; }
    return false;
  }
  function renderFallbackBanner() {
    if (window.__KINE_APP_BOOTED__ || readDismissed() || !isUnsupportedLegacy()) return;
    if (document.getElementById("kine-legacy-browser-warning") || !document.body) return;
    var wrap = document.createElement("div");
    wrap.id = "kine-legacy-browser-warning";
    wrap.setAttribute("role", "alert");
    wrap.style.cssText = "position:fixed;top:12px;left:12px;right:12px;z-index:9990;max-width:520px;margin:0 auto;padding:14px 16px;border-radius:14px;background:#1b1128;border:1px solid #f59e0b;color:#fffbeb;font-family:system-ui,-apple-system,sans-serif;box-shadow:0 12px 32px rgba(0,0,0,0.55);";
    var title = document.createElement("div");
    title.style.cssText = "font-size:15px;font-weight:700;margin-bottom:4px;color:#fcd34d;";
    title.appendChild(document.createTextNode(${JSON.stringify(UNSUPPORTED_BROWSER_COPY.title)}));
    var body = document.createElement("div");
    body.style.cssText = "font-size:13px;line-height:1.45;color:#f3f4f6;margin-bottom:10px;";
    body.appendChild(document.createTextNode(${JSON.stringify(UNSUPPORTED_BROWSER_COPY.description)}));
    var btn = document.createElement("button");
    btn.type = "button";
    btn.style.cssText = "background:#f59e0b;color:#111827;border:0;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:700;cursor:pointer;";
    btn.appendChild(document.createTextNode(${JSON.stringify(UNSUPPORTED_BROWSER_COPY.dismissLabel)}));
    btn.onclick = function () {
      try { if (window.sessionStorage) window.sessionStorage.setItem(dismissedKey, "1"); } catch (e) {}
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
    };
    wrap.appendChild(title);
    wrap.appendChild(body);
    wrap.appendChild(btn);
    document.body.appendChild(wrap);
  }
  window.setTimeout(renderFallbackBanner, 900);
})();`;
}
