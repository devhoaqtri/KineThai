/**
 * Whether this session may see the video export controls.
 *
 * Export runs on the admin's own machine and never on the hosted site, so a production
 * build answers false outright: the admin check, its auth client and every control behind
 * this hook are then dead code, and the build removes them.
 *
 * Exports: useCanExport
 * Depends on: useIsAdmin
 */

import { useIsAdmin } from "./useIsAdmin";

/** @returns true for an admin on the dev server; false in every production build */
// Optional-chained like ambient.ts: Vite still replaces import.meta.env with a literal,
// and bare-Node guard scripts can import this module without a top-level throw.
export const useCanExport: () => boolean =
  (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true ? useIsAdmin : () => false;
