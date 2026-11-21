import { createFileRoute, redirect } from "@tanstack/react-router";
import { isDemoSession } from "@/features/session/demo-session";
import { sitePageHead } from "@/features/vocabulary/lib/target-language";

// /me — resolves the signed-in user's username and redirects to /u/$username
export const Route = createFileRoute("/_authenticated/me")({
  ssr: false,
  head: () => sitePageHead(undefined, "Your profile", "Your Chay Lá profile and posts."),
  beforeLoad: async () => {
    if (isDemoSession()) {
      const { MOCK_ME_USERNAME } = await import("@/features/demo");
      throw redirect({ to: "/u/$username", params: { username: MOCK_ME_USERNAME } });
    }

    const { supabase } = await import("@/integrations/supabase/client");
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw redirect({ to: "/auth" });
    const { data: p } = await supabase
      .from("profiles")
      .select("username")
      .eq("auth_user_id", u.user.id)
      .maybeSingle();
    if (p?.username) throw redirect({ to: "/u/$username", params: { username: p.username } });
    throw redirect({ to: "/feed" });
  },
  component: () => null,
});
