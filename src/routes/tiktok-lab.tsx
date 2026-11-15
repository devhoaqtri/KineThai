import { createFileRoute, lazyRouteComponent, notFound } from "@tanstack/react-router";
import { z } from "zod";
import { BADGE_ROTATION } from "@/features/vocabulary/lib/badge-variants";

/**
 * The TikTok upload layout, worked out live before it is recorded: a 9:16 phone frame with
 * black bands top and bottom (where TikTok draws its own buttons and caption) and the clip
 * on a 4:5 canvas between them, fading in from the bands.
 *
 * Development only, like /showcase which it frames: a production build answers 404 here
 * and carries none of the page.
 */
const searchSchema = () =>
  z.object({
    /** A word by share code; otherwise /showcase picks one from `seed`. */
    code: z.string().max(16).optional(),
    seed: z.number().int().nonnegative().optional(),
    /**
     * Each band's fade, as a share of the band's height from the screen's edge (%): the black
     * starts lifting at `fadeFrom` and is gone at `fadeTo`. Past 100 the fade reaches into
     * the canvas.
     */
    fadeFrom: z.number().min(0).max(100).optional(),
    fadeTo: z.number().min(0).max(160).optional(),
    /** The opening question's look, one of the feed badge's (badge-variants). */
    look: z.enum(BADGE_ROTATION as unknown as [string, ...string[]]).optional(),
    /** Show the band and canvas edges as guide lines. */
    guides: z.boolean().optional(),
  });

export const Route = createFileRoute("/tiktok-lab")({
  validateSearch: (import.meta.env.DEV ? searchSchema() : z.object({})) as ReturnType<
    typeof searchSchema
  >,
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  head: () => ({
    meta: [{ name: "robots", content: "noindex, nofollow" }, { title: "TikTok lab" }],
  }),
  component: import.meta.env.DEV
    ? lazyRouteComponent(
        () => import("@/features/vocabulary/components/TikTokLabPage"),
        "TikTokLabPage",
      )
    : () => null,
});
