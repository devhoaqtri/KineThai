import { createMiddleware } from "@tanstack/react-start";

// Project-owned replacement: leave the generated attacher untouched so regeneration
// cannot put the account SDK back into the main script. Always consult getSession:
// preview sessions may live in the editor broker, not this origin's localStorage.
export const attachLazyAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
  },
);