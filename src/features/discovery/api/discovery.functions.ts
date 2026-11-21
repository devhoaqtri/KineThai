/**
 * API layer helpers for discovery functions.
 *
 * Exports: search, getDiscover, toggleFollow, getMe, updateProfile, getNotifications
 * Depends on: @tanstack/react-start, @/integrations/supabase/auth-middleware
 */

import { createServerFn } from "@tanstack/react-start";
import { accountFeaturesGate } from "@/lib/account-features";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { VOCAB_ONLY_MODE, isVocabularyPost } from "@/lib/feature-flags";

// ===== Search users + posts =====
/**
 * Server function: search.
 * @returns TanStack server function handle
 */
export const search = createServerFn({ method: "GET" })
  .middleware([accountFeaturesGate])
  .inputValidator((d: { q: string }) => z.object({ q: z.string().max(64) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const q = data.q.trim();
    if (!q) return { users: [], posts: [] };
    const like = `%${q.replace(/[%_]/g, "")}%`;
    const [{ data: users }, { data: posts }] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("id, username, display_name, avatar_url, bio")
        .or(`username.ilike.${like},display_name.ilike.${like}`)
        .limit(20),
      supabaseAdmin
        .from("posts")
        .select("id, author_id, post_type, canvas_html, media_urls, bg_gradient, created_at")
        .ilike("canvas_html", like)
        .order("created_at", { ascending: false })
        .limit(30),
    ]);
    return { users: users ?? [], posts: posts ?? [] };
  });

// ===== Discover (trending) =====
/**
 * Server function: getDiscover.
 * @returns TanStack server function handle
 */
export const getDiscover = createServerFn({ method: "GET" })
  .middleware([accountFeaturesGate])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: posts }, { data: profiles }] = await Promise.all([
      supabaseAdmin
        .from("posts")
        .select("id, author_id, post_type, canvas_html, media_urls, bg_gradient, created_at")
        .order("created_at", { ascending: false })
        .limit(80),
      supabaseAdmin
        .from("profiles")
        .select("id, username, display_name, avatar_url, bio")
        .order("created_at", { ascending: false })
        .limit(12),
    ]);
    let filteredPosts = (posts ?? []) as { id: string; author_id: string; canvas_html: string }[];
    if (VOCAB_ONLY_MODE) {
      filteredPosts = filteredPosts.filter((p) => isVocabularyPost(p as never));
    }
    return { posts: filteredPosts.slice(0, 36), profiles: profiles ?? [] };
  });

// ===== Follow / unfollow =====
/**
 * Server function: toggleFollow.
 * @returns TanStack server function handle
 */
export const toggleFollow = createServerFn({ method: "POST" })
  .middleware([accountFeaturesGate, requireSupabaseAuth])
  .inputValidator((d: { target_id: string }) => z.object({ target_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: me } = await supabase
      .from("profiles")
      .select("id")
      .eq("auth_user_id", userId)
      .maybeSingle();
    if (!me) throw new Error("Profile missing");
    if (me.id === data.target_id) throw new Error("Cannot follow self");
    const { data: existing } = await supabase
      .from("follows")
      .select("follower_id")
      .eq("follower_id", me.id)
      .eq("following_id", data.target_id)
      .maybeSingle();
    if (existing) {
      await supabase
        .from("follows")
        .delete()
        .eq("follower_id", me.id)
        .eq("following_id", data.target_id);
      return { following: false };
    }
    await supabase.from("follows").insert({ follower_id: me.id, following_id: data.target_id });
    return { following: true };
  });

// ===== Get my full identity (profile + follow set) =====
/**
 * Server function: getMe.
 * @returns TanStack server function handle
 */
export const getMe = createServerFn({ method: "GET" })
  .middleware([accountFeaturesGate, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url, bio, created_at")
      .eq("auth_user_id", userId)
      .maybeSingle();
    if (!profile) {
      return {
        profile: null,
        followingIds: [] as string[],
        stats: { posts: 0, followers: 0, following: 0 },
      };
    }
    const [{ data: following }, { count: followers }, { count: followingCount }, { count: posts }] =
      await Promise.all([
        supabase.from("follows").select("following_id").eq("follower_id", profile.id),
        supabase
          .from("follows")
          .select("*", { count: "exact", head: true })
          .eq("following_id", profile.id),
        supabase
          .from("follows")
          .select("*", { count: "exact", head: true })
          .eq("follower_id", profile.id),
        supabase
          .from("posts")
          .select("*", { count: "exact", head: true })
          .eq("author_id", profile.id),
      ]);
    return {
      profile,
      followingIds: (following ?? []).map((f) => f.following_id),
      stats: {
        posts: posts ?? 0,
        followers: followers ?? 0,
        following: followingCount ?? 0,
      },
    };
  });

// ===== Update profile =====
/**
 * Server function: updateProfile.
 * @returns TanStack server function handle
 */
export const updateProfile = createServerFn({ method: "POST" })
  .middleware([accountFeaturesGate, requireSupabaseAuth])
  .inputValidator((d: { display_name?: string; bio?: string; avatar_url?: string }) =>
    z
      .object({
        display_name: z.string().min(1).max(60).optional(),
        bio: z.string().max(280).optional(),
        avatar_url: z.string().url().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("profiles").update(data).eq("auth_user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ===== Notifications (computed: likes + comments + follows on my content) =====
/**
 * Server function: getNotifications.
 * @returns TanStack server function handle
 */
export const getNotifications = createServerFn({ method: "GET" })
  .middleware([accountFeaturesGate, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: me } = await supabase
      .from("profiles")
      .select("id")
      .eq("auth_user_id", userId)
      .maybeSingle();
    if (!me) return { items: [] };
    const { data: myPosts } = await supabase
      .from("posts")
      .select("id, canvas_html")
      .eq("author_id", me.id);
    const postIds = (myPosts ?? []).map((p) => p.id);
    const postById = new Map((myPosts ?? []).map((p) => [p.id, p]));

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: likes }, { data: comments }, { data: followers }] = await Promise.all([
      postIds.length
        ? supabaseAdmin
            .from("likes")
            .select("user_id, post_id, created_at")
            .in("post_id", postIds)
            .neq("user_id", me.id)
            .order("created_at", { ascending: false })
            .limit(40)
        : Promise.resolve({
            data: [] as { user_id: string; post_id: string; created_at: string }[],
          }),
      postIds.length
        ? supabaseAdmin
            .from("comments")
            .select("user_id, post_id, chip_id, created_at")
            .in("post_id", postIds)
            .neq("user_id", me.id)
            .order("created_at", { ascending: false })
            .limit(40)
        : Promise.resolve({
            data: [] as { user_id: string; post_id: string; chip_id: string; created_at: string }[],
          }),
      supabaseAdmin
        .from("follows")
        .select("follower_id, created_at")
        .eq("following_id", me.id)
        .order("created_at", { ascending: false })
        .limit(40),
    ]);

    const actorIds = new Set<string>();
    (likes ?? []).forEach((l) => actorIds.add(l.user_id));
    (comments ?? []).forEach((c) => actorIds.add(c.user_id));
    (followers ?? []).forEach((f) => actorIds.add(f.follower_id));

    const { data: actors } = await supabaseAdmin
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .in("id", [...actorIds]);
    const actorById = new Map((actors ?? []).map((a) => [a.id, a]));

    type Item = {
      kind: "like" | "comment" | "follow";
      actor: {
        id: string;
        username: string;
        display_name: string;
        avatar_url: string | null;
      } | null;
      post_id?: string;
      post_preview?: string;
      chip_id?: string;
      created_at: string;
    };
    const items: Item[] = [];
    for (const l of likes ?? [])
      items.push({
        kind: "like",
        actor: actorById.get(l.user_id) ?? null,
        post_id: l.post_id,
        post_preview: postById.get(l.post_id)?.canvas_html,
        created_at: l.created_at,
      });
    for (const c of comments ?? [])
      items.push({
        kind: "comment",
        actor: actorById.get(c.user_id) ?? null,
        post_id: c.post_id,
        post_preview: postById.get(c.post_id)?.canvas_html,
        chip_id: c.chip_id,
        created_at: c.created_at,
      });
    for (const f of followers ?? [])
      items.push({
        kind: "follow",
        actor: actorById.get(f.follower_id) ?? null,
        created_at: f.created_at,
      });
    items.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    return { items: items.slice(0, 60) };
  });
