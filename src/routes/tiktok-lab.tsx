import { createFileRoute, lazyRouteComponent, notFound } from "@tanstack/react-router";
import { z } from "zod";

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
    /** How far the black fades into the canvas, as a share of the canvas's height (%). */
    fade: z.number().min(0).max(40).optional(),
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
