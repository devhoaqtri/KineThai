import { createFileRoute } from "@tanstack/react-router";
import { crawlFileResponse } from "@/features/shell/lib/crawl-files";

export const Route = createFileRoute("/sitemap.xml")({
  server: { handlers: { GET: ({ request }) => crawlFileResponse(request, "sitemap") } },
});
