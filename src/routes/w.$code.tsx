import { createFileRoute } from "@tanstack/react-router";
import { VocabularyFeedPage } from "@/features/vocabulary/components/VocabularyFeedPage";
import { getSiteLocale } from "@/features/vocabulary/api/site-locale.functions";
import { sitePageHead } from "@/features/vocabulary/lib/target-language";

// A shared word: the feed itself, opening on that word and playing it like any other, then
// the reader's own stream. Not a separate page. The link preview is the site's own, with
// nothing about the word in it, since the feed still opens on the word's clues.
export const Route = createFileRoute("/w/$code")({
  ssr: "data-only",
  loader: async () => ({ locale: await getSiteLocale() }),
  head: ({ loaderData }) => sitePageHead(loaderData?.locale),
  component: function SharedWordRoute() {
    const { locale } = Route.useLoaderData();
    const { code } = Route.useParams();
    return <VocabularyFeedPage locale={locale} sharedCode={code} />;
  },
});
