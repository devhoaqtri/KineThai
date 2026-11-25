import { createFileRoute } from "@tanstack/react-router";
import { crawlFileResponse } from "@/features/shell/lib/crawl-files";

export const Route = createFileRoute("/robots.txt")({
  server: { handlers: { GET: ({ request }) => crawlFileResponse(request, "robots") } },
});
