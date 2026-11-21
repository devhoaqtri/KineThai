/**
 * Authenticated social mutations: create post, like, comment.
 *
 * Exports: createPost, toggleLike, addComment
 * Depends on: supabase auth middleware, lib/canvas resolveCanvasBackground
 */

import { createServerFn } from "@tanstack/react-start";
import { accountFeaturesGate } from "@/lib/account-features";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCanvasBackground } from "@/features/canvas";
import { z } from "zod";

const POST_TYPES = ["text", "image", "video", "slideshow", "link"] as const;

/**
 * Server function: createPost.
 * @returns TanStack server function handle
 */
export const createPost = createServerFn({ method: "POST" })
  .middleware([accountFeaturesGate, requireSupabaseAuth])
  .inputValidator(
    (d: { post_type: string; canvas_html: string; media_urls?: string[]; bg_gradient: string }) =>
      z
        .object({
          post_type: z.enum(POST_TYPES),
          canvas_html: z
            .string()
            .min(1)
            .max(1024 * 1024), // 1MB cap
          media_urls: z.array(z.string().url()).max(10).optional().default([]),
          bg_gradient: z.string().max(500),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("auth_user_id", userId)
      .maybeSingle();
    if (!profile) throw new Error("Profile missing");
    const { data: post, error } = await supabase
      .from("posts")
      .insert({
        author_id: profile.id,
        post_type: data.post_type,
        canvas_html: data.canvas_html,
        media_urls: data.media_urls ?? [],
        bg_gradient: resolveCanvasBackground(data.bg_gradient, profile.id),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const { emitTelemetryEvent } = await import("@/features/admin/lib/emit");
    void emitTelemetryEvent({
      mode: "live",
      event_type: "content.created",
      actor_user_id: profile.id,
      entity_type: "post",
      entity_id: post.id,
      metadata: { post_type: data.post_type },
    });
    void emitTelemetryEvent({
      mode: "live",
      event_type: "link.created",
      actor_user_id: profile.id,
      entity_type: "post",
      entity_id: post.id,
      metadata: { path: `/p/${post.id}` },
    });

    return post;
  });

/**
 * Server function: toggleLike.
 * @returns TanStack server function handle
 */
export const toggleLike = createServerFn({ method: "POST" })
  .middleware([accountFeaturesGate, requireSupabaseAuth])
  .inputValidator((d: { post_id: string }) => z.object({ post_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("auth_user_id", userId)
      .maybeSingle();
    if (!profile) throw new Error("Profile missing");
    const { data: existing } = await supabase
      .from("likes")
      .select("*")
      .eq("user_id", profile.id)
      .eq("post_id", data.post_id)
      .maybeSingle();
    if (existing) {
      await supabase.from("likes").delete().eq("user_id", profile.id).eq("post_id", data.post_id);
      return { liked: false };
    }
    await supabase.from("likes").insert({ user_id: profile.id, post_id: data.post_id });
    const { emitTelemetryEvent } = await import("@/features/admin/lib/emit");
    void emitTelemetryEvent({
      mode: "live",
      event_type: "link.interacted",
      actor_user_id: profile.id,
      entity_type: "post",
      entity_id: data.post_id,
      metadata: { interaction: "like" },
    });
    return { liked: true };
  });

/**
 * Server function: addComment.
 * @returns TanStack server function handle
 */
export const addComment = createServerFn({ method: "POST" })
  .middleware([accountFeaturesGate, requireSupabaseAuth])
  .inputValidator((d: { post_id: string; chip_id: string }) =>
    z
      .object({
        post_id: z.string().uuid(),
        chip_id: z
          .string()
          .trim()
          .min(1)
          .max(240)
          .refine((value) => value.trim().split(/\s+/).length <= 36, {
            message: "Comment must be 36 words or fewer",
          }),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("auth_user_id", userId)
      .maybeSingle();
    if (!profile) throw new Error("Profile missing");
    const { error } = await supabase
      .from("comments")
      .insert({ post_id: data.post_id, user_id: profile.id, chip_id: data.chip_id });
    if (error) throw new Error(error.message);

    const { emitTelemetryEvent } = await import("@/features/admin/lib/emit");
    void emitTelemetryEvent({
      mode: "live",
      event_type: "content.created",
      actor_user_id: profile.id,
      entity_type: "comment",
      entity_id: data.post_id,
      metadata: { chip_id: data.chip_id },
    });
    void emitTelemetryEvent({
      mode: "live",
      event_type: "link.interacted",
      actor_user_id: profile.id,
      entity_type: "post",
      entity_id: data.post_id,
      metadata: { interaction: "comment" },
    });

    return { ok: true };
  });

// Demo account is a single shared auth user seeded via migration
// (email: demo@kinetic.local). The auth page signs in client-side with
// supabase.auth.signInWithPassword — no server function needed.
