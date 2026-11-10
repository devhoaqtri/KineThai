import { createFileRoute, lazyRouteComponent, notFound } from "@tanstack/react-router";

/**
 * Every look of the first-visit "Từ gì mà ..." badge side by side, to pick the one the
 * feed ships with.
 *
 * Development only: a production build answers 404 here and carries none of the page.
 */
export const Route = createFileRoute("/badge-lab")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  head: () => ({
    meta: [{ name: "robots", content: "noindex, nofollow" }, { title: "Badge lab" }],
  }),
  component: import.meta.env.DEV
    ? lazyRouteComponent(
        () => import("@/features/vocabulary/components/BadgeLabPage"),
        "BadgeLabPage",
      )
    : () => null,
});
