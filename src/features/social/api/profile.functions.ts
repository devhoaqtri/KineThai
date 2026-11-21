/**
 * Profile read + ensure-profile server functions.
 *
 * Exports: getProfile, ensureProfile
 * Depends on: supabase auth middleware, admin client
 */

import { createServerFn } from "@tanstack/react-start";
import { accountFeaturesGate } from "@/lib/account-features";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Server function: getProfile.
 * @returns TanStack server function handle
 */
export const getProfile = createServerFn({ method: "GET" })
  .middleware([accountFeaturesGate])
  .inputValidator((d: { username: string }) => d)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, username, display_name, avatar_url, bio, created_at")
      .eq("username", data.username)
      .maybeSingle();
    if (!profile) throw new Error("Not found");
    const { data: posts } = await supabaseAdmin
      .from("posts")
      .select("id, post_type, canvas_html, media_urls, bg_gradient, created_at")
      .eq("author_id", profile.id)
      .order("created_at", { ascending: false });
    const postIds = (posts ?? []).map((p) => p.id);
    const [{ count: followers }, { count: following }, { data: likes }, { data: comments }] =
      await Promise.all([
        supabaseAdmin
          .from("follows")
          .select("*", { count: "exact", head: true })
          .eq("following_id", profile.id),
        supabaseAdmin
          .from("follows")
          .select("*", { count: "exact", head: true })
          .eq("follower_id", profile.id),
        postIds.length
          ? supabaseAdmin.from("likes").select("post_id").in("post_id", postIds)
          : Promise.resolve({ data: [] as { post_id: string }[] }),
        postIds.length
          ? supabaseAdmin.from("comments").select("post_id").in("post_id", postIds)
          : Promise.resolve({ data: [] as { post_id: string }[] }),
      ]);

    const engagementByPost: Record<string, { likes: number; comments: number }> = {};
    for (const id of postIds) engagementByPost[id] = { likes: 0, comments: 0 };
    for (const like of likes ?? []) engagementByPost[like.post_id]!.likes += 1;
    for (const comment of comments ?? []) engagementByPost[comment.post_id]!.comments += 1;

    return {
      profile,
      posts: posts ?? [],
      followers: followers ?? 0,
      following: following ?? 0,
      totalLikes: (likes ?? []).length,
      totalComments: (comments ?? []).length,
      engagementByPost,
    };
  });

// ===== Authenticated actions =====

/**
 * Server function: ensureProfile.
 * @returns TanStack server function handle
 */
export const ensureProfile = createServerFn({ method: "POST" })
  .middleware([accountFeaturesGate, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId, claims } = context;
    const { data: existing } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .eq("auth_user_id", userId)
      .maybeSingle();
    if (existing) return existing;

    const email = (claims.email as string) || `user-${userId.slice(0, 6)}@demo`;
    const baseHandle =
      (claims.user_metadata as Record<string, unknown> | undefined)?.preferred_username ||
      (claims.user_metadata as Record<string, unknown> | undefined)?.name ||
      email.split("@")[0];
    const username = `${String(baseHandle)
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "")
      .slice(0, 14)}_${userId.slice(0, 4)}`;
    const display =
      ((claims.user_metadata as Record<string, unknown> | undefined)?.full_name as string) ||
      ((claims.user_metadata as Record<string, unknown> | undefined)?.name as string) ||
      "New Creator";
    const avatar =
      ((claims.user_metadata as Record<string, unknown> | undefined)?.avatar_url as string) ||
      `https://i.pravatar.cc/200?u=${userId}`;

    const { data: created, error } = await supabase
      .from("profiles")
      .insert({
        auth_user_id: userId,
        username,
        display_name: display,
        avatar_url: avatar,
        bio: "",
      })
      .select("id, username, display_name, avatar_url")
      .single();
    if (error) throw new Error(error.message);

    const { emitTelemetryEvent } = await import("@/features/admin/lib/emit");
    void emitTelemetryEvent({
      mode: "live",
      event_type: "user.registered",
      actor_user_id: created.id,
      entity_type: "profile",
      entity_id: created.id,
      metadata: { username: created.username },
    });

    return created;
  });
