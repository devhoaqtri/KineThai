import { createFileRoute, lazyRouteComponent, notFound } from "@tanstack/react-router";
import { z } from "zod";
import { resolveRouteLocale } from "@/features/vocabulary/api/site-locale.functions";
import { EXPORT_PRESETS } from "@/features/vocabulary/lib/export-presets";
import { STYLE_IDS } from "@/features/vocabulary/lib/schema";

/**
 * The automatable half of Export Studio: one word, one preset, nothing else on screen.
 *
 * Addressed by share code, which every word already carries and which /w/$code already
 * resolves — so "post a random word" is "pick a random code".
 *
 * Development only. Clips are recorded on the admin's own machine, so a production build
 * answers 404 here and carries neither the page nor its search schema. noindex stays for
 * the dev server's sake: a crawler finding this would offer searchers a dead end that
 * happens to spoil the answer.
 */
const searchSchema = () => {
  const presetIds = EXPORT_PRESETS.map((preset) => preset.id);
  return z.object({
    /** Frame size and safe area; defaults to the first preset. */
    preset: z.enum(presetIds as [string, ...string[]]).optional(),
    /** Pin the palette and the narration style so a scheduled clip is reproducible.
     *  Validated against the real style ids, so a typo is a 400 rather than a clip
     *  silently recorded in whatever "mix" happened to pick. */
    theme: z.string().max(400).optional(),
    style: z.enum([...STYLE_IDS, "mix"] as [string, ...string[]]).optional(),
    /** The palette pool `theme` is read against; "douyin" is the Chinese host's own. */
    dialect: z.enum(["default", "douyin"]).optional(),
    /** Chrome inside the frame. Brand on by default, progress off, as Export Studio opens. */
    brand: z.boolean().optional(),
    progress: z.boolean().optional(),
    /** Start playing on load instead of waiting for the start event. For eyeballing it. */
    autostart: z.boolean().optional(),
  });
};

export const Route = createFileRoute("/export/$code")({
  validateSearch: (import.meta.env.DEV ? searchSchema() : z.object({})) as ReturnType<
    typeof searchSchema
  >,
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  loader: async () => ({ locale: await resolveRouteLocale() }),
  head: () => ({
    meta: [{ name: "robots", content: "noindex, nofollow" }, { title: "Export frame" }],
  }),
  component: import.meta.env.DEV
    ? lazyRouteComponent(
        () => import("@/features/vocabulary/components/ExportFramePage"),
        "ExportFramePage",
      )
    : () => null,
});
