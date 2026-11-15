import { createFileRoute } from "@tanstack/react-router";

// Development only: the TikTok lab posts here and this machine's Chrome records the clip into
// exports/tiktok. A production build answers 404 and carries none of it.
export const Route = createFileRoute("/api/dev/tiktok-clip")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!import.meta.env.DEV) return new Response("Not found", { status: 404 });
        const { tiktokClipResponse } =
          await import("@/features/vocabulary/api/tiktok-clip-render.server");
        return tiktokClipResponse(request);
      },
      POST: async ({ request }) => {
        if (!import.meta.env.DEV) return new Response("Not found", { status: 404 });
        const { tiktokClipResponse } =
          await import("@/features/vocabulary/api/tiktok-clip-render.server");
        return tiktokClipResponse(request);
      },
    },
  },
});
