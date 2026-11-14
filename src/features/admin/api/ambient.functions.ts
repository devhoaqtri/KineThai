/**
 * Admin ambient-track CRUD server functions (Supabase-backed).
 *
 * Exports: listAmbientTracks, addAmbientTrack, deleteAmbientTrack
 * Depends on: @tanstack/react-start, zod, supabaseAdmin, require-admin
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdminAccess } from "../lib/admin-access";
import { requireAdminContext } from "../lib/require-admin";

export type AmbientTrack = {
  id: string;
  url: string;
  name: string;
  bpm: number;
  sort_order: number;
  created_at: string;
};

/** Untyped table accessor — the ambient_tracks table exists after migration
 *  but the generated Database type has not been regenerated yet. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function tracksTable(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (supabaseAdmin as any).from("ambient_tracks");
}

// ---------------------------------------------------------------------------
// List (public read — no auth gate so the feed player can fetch too)
// ---------------------------------------------------------------------------

export const listAmbientTracks = createServerFn({ method: "GET" }).handler(
  async (): Promise<AmbientTrack[]> => {
    const table = await tracksTable();
    const { data, error } = await table
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as AmbientTrack[];
  },
);

// ---------------------------------------------------------------------------
// Add
// ---------------------------------------------------------------------------

const addSchema = z.object({
  url: z.string().url().max(2048),
  name: z.string().max(200).default(""),
  bpm: z.number().int().min(40).max(300).default(120),
});

export const addAmbientTrack = createServerFn({ method: "POST" })
  .middleware([requireAdminAccess])
  .inputValidator(addSchema.parse)
  .handler(async ({ context, data: input }) => {
    await requireAdminContext({ authUserId: context.userId });
    const table = await tracksTable();
    // Auto-assign sort_order as max + 1
    const { data: existing } = await table
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1);
    const nextOrder = ((existing?.[0]?.sort_order as number) ?? 0) + 1;
    const { data, error } = await table
      .insert({ ...input, sort_order: nextOrder })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as AmbientTrack;
  });

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

const deleteSchema = z.object({ id: z.string().uuid() });

export const deleteAmbientTrack = createServerFn({ method: "POST" })
  .middleware([requireAdminAccess])
  .inputValidator(deleteSchema.parse)
  .handler(async ({ context, data: input }) => {
    await requireAdminContext({ authUserId: context.userId });
    const table = await tracksTable();
    const { error } = await table.delete().eq("id", input.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
