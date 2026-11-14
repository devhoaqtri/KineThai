/**
 * Resolve admin data mode (demo session vs live).
 *
 * Exports: useAdminMode, useAdminSearchRange
 * Depends on: session, date-range, router search
 */

import { useMemo } from "react";
import { isDemoSession } from "@/features/session";
import { parseAdminRange, type AdminRangePreset } from "../lib/date-range";
import { isDemoAdminEnabled } from "../lib/demo-admin-flag";
import type { AdminMode } from "../api/queries";

/**
 * Demo when local demo admin session is active in dev; otherwise live.
 * @returns admin mode
 */
export function useAdminMode(): AdminMode {
  return isDemoSession() && isDemoAdminEnabled() ? "demo" : "live";
}

/**
 * Parse range from search params object.
 * @param search - router search
 * @returns from/to + preset
 */
export function useAdminSearchRange(search: {
  range?: AdminRangePreset;
  from?: string;
  to?: string;
}): { from: string; to: string; preset: AdminRangePreset } {
  return useMemo(() => {
    const preset = search.range ?? "30d";
    const { from, to } = parseAdminRange(preset, search.from, search.to);
    return { from, to, preset };
  }, [search.range, search.from, search.to]);
}
