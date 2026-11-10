import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/word")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { wordResponse } = await import("@/features/vocabulary/api/word-endpoint.server");
        return wordResponse(request);
      },
    },
  },
});
