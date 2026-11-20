import { createFileRoute, lazyRouteComponent, notFound } from "@tanstack/react-router";
import { z } from "zod";
import { resolveRouteLocale } from "@/features/vocabulary/api/site-locale.functions";
import { CAROUSEL_FORMATS } from "@/features/vocabulary/lib/carousel-formats";
import { STYLE_IDS } from "@/features/vocabulary/lib/schema";

/**
 * One slide of a word's Instagram carousel: the page's final scene and nothing else.
 *
 * Development only, like /export/$code. Carousels are made on the admin's own machine, so a
 * production build answers 404 here and carries neither the page nor its search schema.
 * noindex stays for the dev server's sake.
 */
const searchSchema = () => {
  const formatIds = CAROUSEL_FORMATS.map((format) => format.id);
  return z.object({
    /** Which slide, from 0. */
    slide: z.number().int().nonnegative().optional(),
    /** The image's shape; defaults to the first format. */
    format: z.enum(formatIds as [string, ...string[]]).optional(),
    /** Pin the palette and the narration style. Left out, the word's own pick is stable. */
    theme: z.string().max(400).optional(),
    style: z.enum([...STYLE_IDS, "mix"] as [string, ...string[]]).optional(),
    /** The palette pool `theme` is read against; "douyin" is the Chinese host's own. */
    dialect: z.enum(["default", "douyin"]).optional(),
    /** The brand tag at the head of the slide. On by default. */
    brand: z.boolean().optional(),
    /** The account the closing slide names, with or without its @. */
    handle: z
      .string()
      .regex(/^@?[\w.]{1,30}$/)
      .optional(),
    /** The address the closing slide shows; defaults to the deck's own. */
    url: z
      .string()
      .regex(/^[a-z]+\.chayla\.app$/)
      .optional(),
  });
};

export const Route = createFileRoute("/carousel/$code")({
  validateSearch: (import.meta.env.DEV ? searchSchema() : z.object({})) as ReturnType<
    typeof searchSchema
  >,
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  loader: async () => ({ locale: await resolveRouteLocale() }),
  head: () => ({
    meta: [{ name: "robots", content: "noindex, nofollow" }, { title: "Carousel slide" }],
  }),
  component: import.meta.env.DEV
    ? lazyRouteComponent(
        () => import("@/features/vocabulary/components/CarouselFramePage"),
        "CarouselFramePage",
      )
    : () => null,
});
