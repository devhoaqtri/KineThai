/**
 * Authenticated single-post permalink server function.
 *
 * Exports: getPost
 * Depends on: supabase auth middleware, admin client
 */

import { createServerFn } from "@tanstack/react-start";
import { accountFeaturesGate } from "@/lib/account-features";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Server function: getPost.
 * @returns TanStack server function handle
 */
export const getPost = createServerFn({ method: "GET" })
  .middleware([accountFeaturesGate, requireSupabaseAuth])
  .inputValidator((d: { post_id: string }) => z.object({ post_id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: post, error } = await supabaseAdmin
      .from("posts")
      .select("id, author_id, post_type, canvas_html, media_urls, bg_gradient, created_at")
      .eq("id", data.post_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!post) throw new Error("Post not found");

    const [{ data: likes }, { data: comments }] = await Promise.all([
      supabaseAdmin.from("likes").select("post_id, user_id").eq("post_id", data.post_id),
      supabaseAdmin
        .from("comments")
        .select("id, post_id, user_id, chip_id, created_at")
        .eq("post_id", data.post_id)
        .order("created_at", { ascending: true }),
    ]);

    const profileIds = [
      ...new Set([post.author_id, ...(comments ?? []).map((comment) => comment.user_id)]),
    ];
    const { data: profiles } = profileIds.length
      ? await supabaseAdmin
          .from("profiles")
          .select("id, username, display_name, avatar_url")
          .in("id", profileIds)
      : { data: [] };

    return {
      post,
      profiles: profiles ?? [],
      likes: likes ?? [],
      comments: comments ?? [],
    };
  });
