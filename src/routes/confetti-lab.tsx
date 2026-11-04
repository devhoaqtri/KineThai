import { createFileRoute, lazyRouteComponent, notFound } from "@tanstack/react-router";

/**
 * Every reveal confetti candidate side by side, to pick which ones the reader keeps.
 *
 * Development only: a production build answers 404 here and carries none of the page.
 */
export const Route = createFileRoute("/confetti-lab")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  head: () => ({
    meta: [{ name: "robots", content: "noindex, nofollow" }, { title: "Confetti lab" }],
  }),
  component: import.meta.env.DEV
    ? lazyRouteComponent(
        () => import("@/features/vocabulary/components/ConfettiLabPage"),
        "ConfettiLabPage",
      )
    : () => null,
});
