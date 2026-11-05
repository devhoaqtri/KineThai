import { createFileRoute, lazyRouteComponent, notFound } from "@tanstack/react-router";

/**
 * Every reveal-burst design side by side, to pick which ones the reader keeps.
 *
 * Development only: a production build answers 404 here and carries none of the page.
 */
export const Route = createFileRoute("/burst-lab")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  head: () => ({
    meta: [{ name: "robots", content: "noindex, nofollow" }, { title: "Reveal burst lab" }],
  }),
  component: import.meta.env.DEV
    ? lazyRouteComponent(
        () => import("@/features/vocabulary/components/BurstLabPage"),
        "BurstLabPage",
      )
    : () => null,
});
