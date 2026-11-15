import { createFileRoute } from "@tanstack/react-router";

// Development only: the /posting page reads and edits the post calendar here, previews
// clips and starts Facebook/Instagram publishing. A production build answers 404 and
// carries none of it.
export const Route = createFileRoute("/api/dev/posting")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!import.meta.env.DEV) return new Response("Not found", { status: 404 });
        const { postingResponse } = await import("@/features/vocabulary/api/posting.server");
        return postingResponse(request);
      },
      POST: async ({ request }) => {
        if (!import.meta.env.DEV) return new Response("Not found", { status: 404 });
        const { postingResponse } = await import("@/features/vocabulary/api/posting.server");
        return postingResponse(request);
      },
    },
  },
});
