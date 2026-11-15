import { createFileRoute, lazyRouteComponent, notFound } from "@tanstack/react-router";
import { z } from "zod";
import { getSiteLocale } from "@/features/vocabulary/api/site-locale.functions";
import { STYLE_IDS } from "@/features/vocabulary/lib/schema";
import { SHOWCASE_CONTRACT } from "@/features/vocabulary/lib/showcase-contract";

/**
 * A whole promo clip for one word: opening badge, the word in the app's chrome, end card.
 *
 * The sibling of /export/$code. That one renders a word stripped to a preset's clear zone;
 * this one renders what a visitor would see, framed as something postable.
 *
 * It exists so a recorder has a surface built for it rather than the reader's feed driven
 * from outside — which meant clicking a pause button to hold the text, and synthesising
 * taps to replay a page. Both were races, and both lost silently. Here the sequence is
 * component state.
 *
 * Development only. Clips are recorded on the admin's own machine, so a production build
 * answers 404 here and carries neither the page nor its search schema. noindex stays for
 * the dev server's sake: a rendering surface for a recorder, not a page for a reader.
 */
const searchSchema = () =>
  z.object({
    /** A specific word by share code; otherwise one is picked from the deck. */
    code: z.string().max(16).optional(),
    /** Pick the same word again — an index into the deck, so a job is reproducible. */
    seed: z.number().int().nonnegative().optional(),
    /** Pin the palette and narration style, as /export/$code does. */
    theme: z.string().max(400).optional(),
    style: z.enum([...STYLE_IDS, "mix"] as [string, ...string[]]).optional(),
    /** The palette pool `theme` is read against; "douyin" is the Chinese host's own. */
    dialect: z.enum(["default", "douyin"]).optional(),
    /** What the opening badge says. */
    badge: z.string().max(80).optional(),
    /** Pin the opening / end-card variant; otherwise each take picks its own. */
    intro: z.enum(SHOWCASE_CONTRACT.introVariants).optional(),
    outro: z.enum(SHOWCASE_CONTRACT.outroVariants).optional(),
    /** Run without waiting for the start event. For eyeballing it in a browser. */
    autostart: z.boolean().optional(),
    /**
     * The frame's shape. 9x16 (the default) is the whole phone screen a clip is posted as;
     * 4x5 is the canvas the TikTok lab (/tiktok-lab) lays inside black bands, so it fills
     * whatever 4:5 viewport it is given and needs no room for TikTok's own buttons.
     */
    frame: z.enum(["9x16", "4x5"]).optional(),
  });

export const Route = createFileRoute("/showcase")({
  validateSearch: (import.meta.env.DEV ? searchSchema() : z.object({})) as ReturnType<
    typeof searchSchema
  >,
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  loader: async () => ({ locale: await getSiteLocale() }),
  head: () => ({
    meta: [{ name: "robots", content: "noindex, nofollow" }, { title: "Showcase" }],
  }),
  component: import.meta.env.DEV
    ? lazyRouteComponent(
        () => import("@/features/vocabulary/components/ShowcasePage"),
        "ShowcasePage",
      )
    : () => null,
});
