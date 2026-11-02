import { createFileRoute } from "@tanstack/react-router";
import { ChallengePage } from "@/features/vocabulary/components/ChallengePage";
import { getSiteLocale } from "@/features/vocabulary/api/site-locale.functions";
import { languageName, sitePageHead } from "@/features/vocabulary/lib/target-language";

export const Route = createFileRoute("/w/$code")({
  // The word itself is fetched by the page after the reader arrives (/api/public/word);
  // the loader only resolves the locale, for the title.
  loader: async () => ({ locale: await getSiteLocale() }),
  // DELIBERATELY generic. These tags are what a chat app renders as a link
  // preview, so putting the word (or anything derived from it) here would spoil
  // the guess before the receiver even taps.
  head: ({ loaderData }) =>
    sitePageHead(
      loaderData?.locale,
      "Đoán từ này đi!",
      `Một người bạn thách bạn đoán từ tiếng ${languageName(loaderData?.locale ?? "en")} này.`,
    ),
  component: ChallengePage,
});
