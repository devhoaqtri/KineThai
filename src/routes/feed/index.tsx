import { createFileRoute } from "@tanstack/react-router";
import { VocabularyFeedPage } from "@/features/vocabulary/components/VocabularyFeedPage";
import { resolveRouteLocale } from "@/features/vocabulary/api/site-locale.functions";
import { sitePageHead } from "@/features/vocabulary/lib/target-language";

export const Route = createFileRoute("/feed/")({
  ssr: "data-only",
  loader: async () => ({ locale: await resolveRouteLocale() }),
  head: ({ loaderData }) => sitePageHead(loaderData?.locale),
  // The visited host picks both the deck and the on-screen title, so the loader's
  // locale rides along into the page instead of the brand defaulting to "anh".
  component: function VocabularyFeedRoute() {
    const { locale } = Route.useLoaderData();
    return <VocabularyFeedPage locale={locale} />;
  },
});
