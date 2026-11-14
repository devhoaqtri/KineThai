/**
 * Every way the app can fail to load or keep loading for a reader, as data: the design
 * record for the failure flow. The error screen (shell ErrorComponent, lib/error-report)
 * settles on these ids; `coverage` says which cases are handled so far.
 *
 * The flow it is written for runs three checks in order, and stops at the first that
 * explains the failure:
 *   1. network  — is the reader online, and can they reach us?
 *   2. support  — can this browser / OS / app-browser run the site?
 *   3. app      — neither: a fault of ours. Build an error report the reader sees in full
 *                 and chooses to send to the admin, or not. Never sent on its own.
 *
 * `frequency` is an estimate for a Vietnamese, mostly-phone audience, not a measurement:
 * replace it with telemetry once reports come in. `coverage` says what already exists in
 * this codebase. Entries are listed in check order, most common first within a stage.
 *
 * Exports: LoadFailureStage, LoadFailureFrequency, LoadFailureCoverage, LoadFailureCase,
 *   LOAD_FAILURE_CASES, ERROR_REPORT_FIELDS
 * Depends on: none (leaf module, data only)
 */

export type LoadFailureStage = "network" | "support" | "app";
export type LoadFailureFrequency = "common" | "occasional" | "rare";
/** none: nothing handles it; partial: something reacts but the reader is not told why; covered: handled. */
export type LoadFailureCoverage = "none" | "partial" | "covered";

export type LoadFailureCase = {
  readonly id: string;
  readonly stage: LoadFailureStage;
  readonly title: string;
  readonly frequency: LoadFailureFrequency;
  /** How the app could tell this case apart from the others. */
  readonly detect: string;
  readonly coverage: LoadFailureCoverage;
  /** Where the existing handling lives, when there is any. */
  readonly existing?: string;
  /** What the flow should do. */
  readonly action: string;
  /** Draft line for the reader, in Vietnamese. */
  readonly readerHintVi: string;
  /** Whether the flow should offer the error report for this case. */
  readonly offerReport: boolean;
};

export const LOAD_FAILURE_CASES: readonly LoadFailureCase[] = [
  // ── 1. Network ────────────────────────────────────────────────────────────────
  {
    id: "offline",
    stage: "network",
    title: "Device is offline",
    frequency: "common",
    detect: "navigator.onLine === false, or a fetch rejects with TypeError while it is false.",
    coverage: "covered",
    existing:
      "shell ReaderNotices (offline / back online) and the error screen; lib/feed-fallback retries",
    action: "Say the device is offline; retry by itself on the window 'online' event.",
    readerHintVi: "Bạn đang không có mạng. Ứng dụng sẽ tự tải lại khi có mạng.",
    offerReport: false,
  },
  {
    id: "slow-network",
    stage: "network",
    title: "Network too slow (weak 3G/4G, crowded Wi-Fi)",
    frequency: "common",
    detect:
      "No first word on screen after ~8 s with no error yet; navigator.connection.effectiveType is 2g/slow-2g/3g or saveData is on (Chromium only).",
    coverage: "none",
    action:
      "Keep the loader and add a 'slow network' line after ~8 s; keep waiting, do not fail early.",
    readerHintVi: "Mạng đang chậm, bạn chờ thêm chút nhé.",
    offerReport: false,
  },
  {
    id: "connection-dropped",
    stage: "network",
    title: "Connection dropped mid-session (Wi-Fi to 4G, elevator, tunnel)",
    frequency: "common",
    detect:
      "A request rejects with TypeError after earlier ones succeeded; 'offline'/'online' events fire.",
    coverage: "partial",
    existing:
      "lib/feed-fallback backoff and background retry; the stream keeps serving words it holds",
    action:
      "Keep reading from what is loaded; show a quiet 'reconnecting' note only if the reader runs out.",
    readerHintVi: "Mất kết nối. Đang thử kết nối lại…",
    offerReport: false,
  },
  {
    id: "server-unreachable",
    stage: "network",
    title: "Our server is down, restarting or cold (internet itself is fine)",
    frequency: "occasional",
    detect:
      "Own /api/public/* times out or answers 5xx while the device is online. Telling this apart from 'no internet' needs a second probe target (see decision note on captive-portal).",
    coverage: "partial",
    existing:
      "lib/feed-fallback retries; a cold server spends 2–3 s loading decks (lib/demo-deck ships the demo with the page for this reason)",
    action:
      "Say it is our side, not theirs; retry in the background; offer the report if it lasts.",
    readerHintVi: "Máy chủ đang bận. Không phải lỗi mạng của bạn, mình đang thử lại.",
    offerReport: true,
  },
  {
    id: "captive-portal",
    stage: "network",
    title: "Wi-Fi needs a login page (café, hotel, school, airport)",
    frequency: "occasional",
    detect:
      "navigator.onLine is true but our JSON endpoints answer HTML (content-type text/html), a redirect to another host, or JSON.parse fails. Decision: probing a known third-party endpoint would make it certain but sends the reader's IP elsewhere; own-origin checks only are the private choice.",
    coverage: "none",
    action: "Tell the reader to open the Wi-Fi login page, then retry.",
    readerHintVi: "Wi-Fi này cần đăng nhập. Bạn mở trình duyệt để đăng nhập Wi-Fi rồi thử lại.",
    offerReport: false,
  },
  {
    id: "content-blocker",
    stage: "network",
    title: "Ad/content blocker blocks some of our requests (telemetry, fonts)",
    frequency: "occasional",
    detect:
      "One kind of request (e.g. /api/public/telemetry) always rejects with TypeError while the feed's own requests succeed.",
    coverage: "partial",
    existing: "telemetry and engagement are best-effort; the feed does not wait on them",
    action: "Never block reading on non-essential requests; say nothing to the reader.",
    readerHintVi: "",
    offerReport: false,
  },
  {
    id: "rate-limited",
    stage: "network",
    title: "Server refuses with RATE_LIMITED",
    frequency: "rare",
    detect: "API error code RATE_LIMITED, with Retry-After.",
    coverage: "covered",
    existing: "lib/feed-fallback backgroundRetryDelay honours Retry-After",
    action: "Wait as told; keep serving held words.",
    readerHintVi: "Bạn lướt nhanh quá! Chờ vài giây để tải thêm từ.",
    offerReport: false,
  },
  {
    id: "network-filter",
    stage: "network",
    title: "Domain blocked by a school/company firewall, parental control or ISP",
    frequency: "rare",
    detect:
      "Every request to our origin fails with TypeError while navigator.onLine is true; indistinguishable from server-unreachable without an outside probe.",
    coverage: "none",
    action:
      "Mention 'the network you are on may block this site' as one possibility after server-unreachable lasts.",
    readerHintVi: "Mạng bạn đang dùng có thể đang chặn trang này. Thử bằng 4G hoặc mạng khác.",
    offerReport: false,
  },
  {
    id: "vpn-proxy",
    stage: "network",
    title: "VPN or proxy breaks or slows requests",
    frequency: "rare",
    detect: "Not detectable from the page; looks like slow-network or server-unreachable.",
    coverage: "none",
    action: "List 'turn off VPN' among the tips on a lasting failure.",
    readerHintVi: "Nếu bạn đang bật VPN, thử tắt rồi tải lại.",
    offerReport: false,
  },
  {
    id: "carrier-interstitial",
    stage: "network",
    title: "Mobile data used up; the carrier injects a top-up page",
    frequency: "rare",
    detect: "Same signature as captive-portal (HTML instead of JSON), on a cellular connection.",
    coverage: "none",
    action: "Folded into captive-portal's message, adding 'check your data plan'.",
    readerHintVi: "Có thể gói dữ liệu di động đã hết. Bạn kiểm tra lại gói cước nhé.",
    offerReport: false,
  },
  {
    id: "proxy-browser",
    stage: "network",
    title: "Proxy browser that renders on its servers (Opera Mini extreme mode)",
    frequency: "rare",
    detect:
      "UA contains 'Opera Mini'; scripts barely run, so only the ES5 fallback script or <noscript> can speak.",
    coverage: "none",
    action: "Static message via the legacy fallback script: use another browser.",
    readerHintVi: "Trình duyệt này không chạy được trang. Bạn mở bằng Chrome hoặc Safari nhé.",
    offerReport: false,
  },
  {
    id: "clock-skew",
    stage: "network",
    title: "Device clock far off",
    frequency: "rare",
    detect:
      "Before load: the browser's own certificate error, unreachable by the page. After load: compare the server's Date header with Date.now().",
    coverage: "none",
    action: "Only for streaks and daily goals: warn when off by more than a day.",
    readerHintVi: "Giờ trên máy bạn đang sai. Chỉnh lại giờ để chuỗi ngày học được tính đúng.",
    offerReport: false,
  },

  // ── 2. Browser / OS support ───────────────────────────────────────────────────
  {
    id: "in-app-browser",
    stage: "support",
    title: "Opened inside Zalo, Messenger, Facebook, TikTok or Instagram",
    frequency: "common",
    detect:
      "UA contains Zalo, FBAN/FBAV, Instagram, musical_ly/TikTok, Line. These web views may drop local storage between visits and restrict audio.",
    coverage: "none",
    action:
      "Non-blocking hint to open in the real browser, so progress is kept; never block reading.",
    readerHintVi: "Bạn đang mở trong ứng dụng khác. Mở bằng trình duyệt để lưu tiến độ học.",
    offerReport: false,
  },
  {
    id: "outdated-browser",
    stage: "support",
    title: "Browser below the site's baselines",
    frequency: "occasional",
    detect: "checkCurrentBrowserSupport() in lib/browser-support.",
    coverage: "covered",
    existing: "lib/browser-support + UnsupportedBrowserWarning (and an ES5 fallback script)",
    action: "Already warned; the failure flow should point at that warning instead of the report.",
    readerHintVi: "Trình duyệt của bạn đã cũ. Cập nhật để dùng trang ổn định.",
    offerReport: false,
  },
  {
    id: "outdated-os",
    stage: "support",
    title: "OS too old to get a supported browser (old iOS, old Android)",
    frequency: "occasional",
    detect: "UNSUPPORTED_OS_SPECS in lib/browser-support.",
    coverage: "covered",
    existing: "lib/browser-support",
    action: "As outdated-browser.",
    readerHintVi: "Hệ điều hành của máy đã cũ nên trang có thể không chạy đúng.",
    offerReport: false,
  },
  {
    id: "page-translation",
    stage: "support",
    title: "Browser auto-translates the page (Chrome/Edge/Safari translate)",
    frequency: "occasional",
    detect:
      "<html> gets class 'translated-ltr'/'translated-rtl' (Chrome) or text is wrapped in <font>; React then throws NotFoundError on removeChild/insertBefore. Likely when the phone's language is English and the page is Vietnamese.",
    coverage: "covered",
    existing: 'translate="no" + notranslate meta in RootShell; the error screen names it',
    action:
      'Prevention, not recovery: translate="no" on <html> plus <meta name="google" content="notranslate">. Detect the crash signature and say \'turn off translation\'.',
    readerHintVi: "Tắt tính năng dịch trang của trình duyệt rồi tải lại nhé.",
    offerReport: false,
  },
  {
    id: "storage-unavailable",
    stage: "support",
    title: "Local storage blocked (private mode, site data blocked in settings)",
    frequency: "occasional",
    detect:
      "localStorage.setItem/removeItem of a probe key throws (SecurityError or QuotaExceededError at size 0).",
    coverage: "covered",
    existing: "lib/storage-probe + shell ReaderNotices",
    action: "Keep reading working in memory; tell the reader progress will not be kept.",
    readerHintVi:
      "Trình duyệt đang chặn lưu dữ liệu (chế độ ẩn danh?). Tiến độ học sẽ không được lưu.",
    offerReport: false,
  },
  {
    id: "low-memory-reload",
    stage: "support",
    title: "Tab killed and reloaded for memory (cheap Android, iOS in background)",
    frequency: "occasional",
    detect: "document.wasDiscarded (Chromium); a 'reload' navigation the reader did not ask for.",
    coverage: "none",
    action: "Resume where the reader was (stream position) instead of starting over.",
    readerHintVi: "",
    offerReport: false,
  },
  {
    id: "old-webview",
    stage: "support",
    title: "Android System WebView not updated (affects every in-app browser)",
    frequency: "occasional",
    detect:
      "UA has '; wv)' with an old Chrome version; caught by the capability checks in lib/browser-support.",
    coverage: "partial",
    existing: "lib/browser-support capability detection",
    action: "Point the reader to update 'Android System WebView' in Play Store, or open in Chrome.",
    readerHintVi: "Cập nhật 'Android System WebView' trên CH Play, hoặc mở bằng Chrome.",
    offerReport: false,
  },
  {
    id: "desktop-site-mode",
    stage: "support",
    title: "Chrome 'Desktop site' on a tablet",
    frequency: "rare",
    detect: "lib/desktop-mode.",
    coverage: "covered",
    existing: "lib/desktop-mode notice",
    action: "Already handled.",
    readerHintVi: "Bỏ chọn 'Trang web cho máy tính' trong menu Chrome.",
    offerReport: false,
  },
  {
    id: "dom-mutating-extension",
    stage: "support",
    title: "Extension rewrites the page (Grammarly, Dark Reader, translators)",
    frequency: "rare",
    detect: "Same React NotFoundError signature as page-translation, without the translate class.",
    coverage: "none",
    action: "Suggest disabling extensions for this site; offer the report if it repeats.",
    readerHintVi:
      "Một tiện ích của trình duyệt đang can thiệp vào trang. Thử tắt tiện ích rồi tải lại.",
    offerReport: true,
  },
  {
    id: "storage-full",
    stage: "support",
    title: "Local storage full (large imported packs)",
    frequency: "rare",
    detect: "QuotaExceededError on setItem after earlier writes worked.",
    coverage: "covered",
    existing: "lib/storage-probe + shell ReaderNotices",
    action: "Say what cannot be saved; offer to remove imported packs.",
    readerHintVi: "Bộ nhớ của trang đã đầy. Xóa bớt bộ từ đã nhập để lưu tiếp.",
    offerReport: false,
  },
  {
    id: "storage-evicted",
    stage: "support",
    title: "Browser cleared the site's data (Safari's 7-day rule, cleanup apps)",
    frequency: "rare",
    detect:
      "Not detectable: the reader simply looks new. lib/durable-storage asks the browser to keep data.",
    coverage: "partial",
    existing: "lib/durable-storage requestDurableStorage",
    action: "Nothing to show; only an account could prevent it.",
    readerHintVi: "",
    offerReport: false,
  },
  {
    id: "javascript-disabled",
    stage: "support",
    title: "JavaScript turned off",
    frequency: "rare",
    detect: "<noscript> is the only thing that renders.",
    coverage: "none",
    action: "A <noscript> line asking to turn JavaScript on.",
    readerHintVi: "Trang cần bật JavaScript để chạy.",
    offerReport: false,
  },
  {
    id: "fonts-failed",
    stage: "support",
    title: "Web fonts fail or arrive very late",
    frequency: "rare",
    detect:
      "document.fonts.ready not settled after ~5 s, or document.fonts.check() false for the card faces.",
    coverage: "partial",
    existing: "measured layout steps down and never back up, so late fonts can leave a page small",
    action: "Lay out with the fallback face after a timeout and re-measure once the font lands.",
    readerHintVi: "",
    offerReport: false,
  },

  // ── 3. App (ours): offer the error report ────────────────────────────────────
  {
    id: "stale-chunk-after-deploy",
    stage: "app",
    title: "Code chunk gone after a new deploy",
    frequency: "common",
    detect:
      "A dynamic import rejects: 'Failed to fetch dynamically imported module' (Chromium), 'Importing a module script failed' (Safari), 'error loading dynamically imported module' (Firefox).",
    coverage: "covered",
    existing: "lib/stale-chunk: vite:preloadError and the error screen reload once",
    action:
      "Reload once, guarded by a sessionStorage flag so it cannot loop; report only if it fails again.",
    readerHintVi: "Trang vừa được cập nhật. Đang tải lại…",
    offerReport: false,
  },
  {
    id: "stuck-loading",
    stage: "app",
    title: "Loader never ends, with no error",
    frequency: "occasional",
    detect:
      "Watchdog: no first word on screen ~15 s after load, nothing failed, network and support checks pass.",
    coverage: "none",
    action: "Run the checks; if they pass, offer the report with the feed log attached.",
    readerHintVi: "Trang tải lâu bất thường. Bạn có muốn gửi báo cáo lỗi cho tụi mình không?",
    offerReport: true,
  },
  {
    id: "render-crash",
    stage: "app",
    title: "A component throws (error boundary screen)",
    frequency: "occasional",
    detect: "Root errorComponent / React error boundary.",
    coverage: "covered",
    existing:
      "shell ErrorComponent (Vietnamese) with the opt-in report (lib/error-report, /api/public/error-report)",
    action: "Vietnamese screen: try again, go home, and the opt-in report.",
    readerHintVi: "Có lỗi xảy ra. Bạn thử tải lại, hoặc gửi báo cáo để tụi mình sửa.",
    offerReport: true,
  },
  {
    id: "api-not-json",
    stage: "app",
    title: "API answers an HTML error page (host/CDN 502, maintenance)",
    frequency: "occasional",
    detect:
      "content-type is not application/json, or JSON.parse fails, on a request that reached our origin.",
    coverage: "partial",
    existing: "lib/feed-fallback treats it as a passing failure",
    action: "Treat as server-unreachable; include status and the first bytes in the report.",
    readerHintVi: "Máy chủ đang gặp sự cố. Mình đang thử lại.",
    offerReport: true,
  },
  {
    id: "api-error-code",
    stage: "app",
    title: "API refuses with UNAVAILABLE, INVALID_REQUEST, FORBIDDEN or NOT_FOUND",
    frequency: "occasional",
    detect: "The error code in the API's JSON body.",
    coverage: "partial",
    existing: "lib/feed-fallback (stream); an unknown share code opens the reader's own feed",
    action: "UNAVAILABLE retries; INVALID_REQUEST and FORBIDDEN are our bugs and go to the report.",
    readerHintVi: "Không tải được từ mới. Bạn có muốn gửi báo cáo lỗi không?",
    offerReport: true,
  },
  {
    id: "unhandled-rejection",
    stage: "app",
    title: "Unhandled promise rejection or window error",
    frequency: "occasional",
    detect: "window 'unhandledrejection' / 'error' events.",
    coverage: "partial",
    existing: "lib/error-capture and the feed log record window errors and rejections",
    action: "Log only; never interrupt reading unless the screen is actually broken.",
    readerHintVi: "",
    offerReport: false,
  },
  {
    id: "stale-feed-cursor",
    stage: "app",
    title: "Stream cursor stale after a deck change (CATALOG_CHANGED, STREAM_EXPIRED)",
    frequency: "occasional",
    detect: "Those API error codes, or a cursor that no longer parses.",
    coverage: "covered",
    existing: "lib/feed-fallback fresh stream on a derived seed",
    action: "Already handled.",
    readerHintVi: "",
    offerReport: false,
  },
  {
    id: "empty-feed",
    stage: "app",
    title: "Filters match no word",
    frequency: "occasional",
    detect: "An empty page for the chosen level/topic/track.",
    coverage: "covered",
    existing: "lib/feed-fallback widens level → topic → track",
    action: "Already handled.",
    readerHintVi: "",
    offerReport: false,
  },
  {
    id: "corrupt-local-state",
    stage: "app",
    title: "Saved local data unreadable (older version's format, interrupted write)",
    frequency: "rare",
    detect: "JSON.parse or a shape check throws while reading localStorage on boot, on every load.",
    coverage: "none",
    action:
      "Guarded reads that fall back to defaults; a 'reset data on this device' button on the error screen as the last resort.",
    readerHintVi: "Dữ liệu lưu trên máy bị lỗi. Bạn có thể đặt lại dữ liệu để dùng tiếp.",
    offerReport: true,
  },
  {
    id: "corrupt-custom-pack",
    stage: "app",
    title: "An imported pack is malformed",
    frequency: "rare",
    detect: "lib/custom-pack validation fails when paging it.",
    coverage: "partial",
    existing: "lib/custom-pack validates on import",
    action: "Skip that pack, name it, offer to remove it.",
    readerHintVi: "Bộ từ bạn nhập bị lỗi nên đã được bỏ qua.",
    offerReport: false,
  },
  {
    id: "render-loop",
    stage: "app",
    title: "Infinite render loop ('Maximum update depth exceeded')",
    frequency: "rare",
    detect: "That React error message, usually from a fit or measure loop.",
    coverage: "covered",
    existing: "shell ErrorComponent names it render-loop and offers the report",
    action: "As render-crash; the report should carry the stage and word id.",
    readerHintVi: "Có lỗi xảy ra. Bạn thử tải lại, hoặc gửi báo cáo để tụi mình sửa.",
    offerReport: true,
  },
  {
    id: "hydration-mismatch",
    stage: "app",
    title: "Server and browser render differently",
    frequency: "rare",
    detect: "React recoverable hydration error (onRecoverableError).",
    coverage: "none",
    action: "Log only; usually invisible to the reader.",
    readerHintVi: "",
    offerReport: false,
  },
  {
    id: "backend-service-down",
    stage: "app",
    title: "Supabase down (reports, engagement, telemetry fail)",
    frequency: "rare",
    detect: "Those endpoints fail while /api/public/vocabulary works.",
    coverage: "partial",
    existing: "word report shows 'Chưa gửi được'; the feed does not depend on them",
    action: "Keep reading; queue nothing, retry nothing in a loop.",
    readerHintVi: "",
    offerReport: false,
  },
  {
    id: "hosting-outage",
    stage: "app",
    title: "Hosting or CDN outage: the page itself does not arrive",
    frequency: "rare",
    detect: "Nothing of ours runs; the browser shows its own error.",
    coverage: "none",
    action: "Out of the app's reach; only a status page elsewhere could help.",
    readerHintVi: "",
    offerReport: false,
  },
];

/**
 * What an opt-in error report would carry. The reader sees all of it before choosing to
 * send; nothing is sent automatically, and no field identifies the reader.
 */
export const ERROR_REPORT_FIELDS = [
  { key: "caseId", note: "LOAD_FAILURE_CASES id the checks settled on, or 'unknown'" },
  { key: "checks", note: "result of each stage: online, probe status, browser-support issues" },
  { key: "error", note: "error name and message; stack trimmed to our own frames" },
  { key: "where", note: "route, card stage, word id on screen (not the reader's history)" },
  { key: "build", note: "app build id / deploy time" },
  { key: "device", note: "browser and OS name+version, in-app browser name, viewport, DPR, touch" },
  { key: "network", note: "effectiveType, saveData, online state (no IP stored)" },
  { key: "storage", note: "whether local storage works; never its contents" },
  { key: "feedLog", note: "last ~30 feed-log lines (fetch, retry, drift causes)" },
  { key: "locale", note: "host language (anh., hoa., …)" },
  { key: "time", note: "when, plus seconds since page load" },
  { key: "note", note: "optional words the reader adds" },
] as const;
