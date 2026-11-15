import { createFileRoute, lazyRouteComponent, notFound } from "@tanstack/react-router";

/**
 * The post calendar, managed: every post's clip, caption and state on TikTok, Facebook and
 * Instagram, with publish, skip and retry. Development only, like Export Studio: a
 * production build answers 404 here and carries none of the page.
 */
export const Route = createFileRoute("/posting")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  head: () => ({
    meta: [{ name: "robots", content: "noindex, nofollow" }, { title: "Posting" }],
  }),
  component: import.meta.env.DEV
    ? lazyRouteComponent(() => import("@/features/vocabulary/components/PostingPage"), "PostingPage")
    : () => null,
});
