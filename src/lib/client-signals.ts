/**
 * What our own page tells the server about the browser it runs in, for lib/bot-signals.
 * Today one thing: whether the browser says it is driven by automation (WebDriver sets
 * navigator.webdriver; Puppeteer, Playwright and Selenium all do unless hidden on purpose).
 *
 * Exports: CLIENT_AUTOMATION_HEADER, isAutomatedBrowser, clientSignalHeaders
 * Depends on: none (leaf module, safe in the page bundle)
 */

/** Set by our own page when navigator.webdriver is true; read by lib/bot-signals. */
export const CLIENT_AUTOMATION_HEADER = "x-client-automation";

/** @returns Whether this browser reports being driven by automation. */
export function isAutomatedBrowser(): boolean {
  return typeof navigator !== "undefined" && navigator.webdriver === true;
}

/**
 * Headers for a write to a public endpoint (word and error reports, telemetry by fetch).
 * @returns The automation header when it applies, else nothing
 */
export function clientSignalHeaders(): Record<string, string> {
  return isAutomatedBrowser() ? { [CLIENT_AUTOMATION_HEADER]: "1" } : {};
}
