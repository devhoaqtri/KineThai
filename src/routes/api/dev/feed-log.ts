import { createFileRoute } from "@tanstack/react-router";

// Development only: the feed's diagnostic log (lib/feed-log) posts here and the server
// appends it to logs/feed-<date>.ndjson. A production build answers 404 and writes nothing.
export const Route = createFileRoute("/api/dev/feed-log")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!import.meta.env.DEV) return new Response("Not found", { status: 404 });
        const { appendFeedLog } = await import("@/features/vocabulary/api/feed-log.server");
        return appendFeedLog(request);
      },
    },
  },
});
