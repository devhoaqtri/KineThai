import { createFileRoute } from "@tanstack/react-router";
import { VocabLibraryPage } from "@/features/vocabulary/components/VocabLibraryPage";
import { resolveRouteLocale } from "@/features/vocabulary/api/site-locale.functions";
import { sitePageHead } from "@/features/vocabulary/lib/target-language";

// The library is where a reader uploads their own pack (its mock pack shelves are
// hidden for now), and it never needs SSR — render it client-side like /feed/saved.
export const Route = createFileRoute("/feed/library")({
  ssr: "data-only",
  loader: async () => ({ locale: await resolveRouteLocale() }),
  head: ({ loaderData }) => sitePageHead(loaderData?.locale, "Thư viện từ vựng", "Tải lên bộ từ vựng của riêng bạn."),
  component: VocabLibraryPage,
});
