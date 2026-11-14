/**
 * Client-safe check for whether local dev demo admin mode is enabled.
 *
 * Kept separate from require-admin.ts so client hooks (useIsAdmin, useAdminMode)
 * never pull server-only admin dependencies into browser bundles.
 *
 * Exports: isDemoAdminEnabled
 * Depends on: none
 */

/**
 * Whether demo sessions may access dev admin helpers (VITE_DEMO_ADMIN=1|true under `npm run dev`).
 *
 * A production build never honours this flag, whatever the environment says.
 * @returns true when demo admin is enabled in development
 */
export function isDemoAdminEnabled(): boolean {
  if (!import.meta.env.DEV) return false;
  const raw =
    (typeof import.meta !== "undefined" &&
      (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_DEMO_ADMIN) ||
    (typeof process !== "undefined" ? process.env.VITE_DEMO_ADMIN : undefined) ||
    "";
  return raw === "1" || raw.toLowerCase() === "true";
}
