import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/error-report")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { errorReportPostResponse } =
          await import("@/features/shell/api/error-report.server");
        return errorReportPostResponse(request);
      },
    },
  },
});
