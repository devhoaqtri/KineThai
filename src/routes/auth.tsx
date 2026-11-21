import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: lazyRouteComponent(() => import("@/features/session/components/AuthPage"), "AuthPage"),
});
