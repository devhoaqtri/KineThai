import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { sitePageHead } from "@/features/vocabulary/lib/target-language";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => sitePageHead(undefined, "Sign in", "Sign in to your Chay Lá account."),
  component: lazyRouteComponent(() => import("@/features/session/components/AuthPage"), "AuthPage"),
});
