import { createFileRoute } from "@tanstack/react-router";

// Development only: Export Studio posts here and this machine's Chrome renders the slides into
// exports/carousel. A production build answers 404 and carries none of it.
export const Route = createFileRoute("/api/dev/carousel")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!import.meta.env.DEV) return new Response("Not found", { status: 404 });
        const { carouselRenderResponse } =
          await import("@/features/vocabulary/api/carousel-render.server");
        return carouselRenderResponse(request);
      },
    },
  },
});
