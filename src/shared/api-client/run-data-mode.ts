/**
 * Demo vs live data-mode helpers for feature API layers.
 *
 * Exports: runDataMode (pick demo or live async work), isDemoDataMode
 * Depends on: @/features/session resolveDataMode
 */

import { resolveDataMode, type DataMode } from "@/features/session/data-mode";

export type DataModeBranches<T> = {
  /** Work to run when the user is in the offline demo session. */
  demo: () => T | Promise<T>;
  /** Work to run when talking to live TanStack serverFns / Supabase. */
  live: () => T | Promise<T>;
};

/**
 * Run either the demo or live branch based on the current data mode.
 * Prefer this over scattering `isDemoSession() ? … : …` in components.
 *
 * @param branches - Object with `demo` and `live` producers of the same result type
 * @param mode - Optional explicit mode; defaults to resolveDataMode()
 * @returns Whatever the selected branch returns
 */
export async function runDataMode<T>(
  branches: DataModeBranches<T>,
  mode: DataMode = resolveDataMode(),
): Promise<T> {
  if (mode === "demo") {
    return branches.demo();
  }
  return branches.live();
}

/**
 * Synchronous variant when both branches are sync (e.g. building a value).
 *
 * @param branches - Object with sync `demo` and `live` producers
 * @param mode - Optional explicit mode; defaults to resolveDataMode()
 * @returns The selected branch's value
 */
export function pickDataMode<T>(
  branches: { demo: () => T; live: () => T },
  mode: DataMode = resolveDataMode(),
): T {
  return mode === "demo" ? branches.demo() : branches.live();
}

/**
 * Report whether the given (or current) mode is demo.
 *
 * @param mode - Mode to check; defaults to resolveDataMode()
 * @returns true when mode is "demo"
 */
export function isDemoDataMode(mode: DataMode = resolveDataMode()): boolean {
  return mode === "demo";
}
