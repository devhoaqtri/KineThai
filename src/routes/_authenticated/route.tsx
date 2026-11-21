import { createFileRoute, lazyRouteComponent, redirect } from "@tanstack/react-router";
import { getDemoRouteUser, isDemoSession } from "@/features/session/demo-session";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    if (isDemoSession()) return { user: getDemoRouteUser() };

    const { supabase } = await import("@/integrations/supabase/client");
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: lazyRouteComponent(
    () => import("@/features/session/components/AuthedShell"),
    "AuthedShell",
  ),
});
