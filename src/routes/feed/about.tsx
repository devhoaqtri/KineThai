import { createFileRoute } from "@tanstack/react-router";
import { AppInfoPage } from "@/features/vocabulary/components/AppInfoPage";
import { getSiteLocale } from "@/features/vocabulary/api/site-locale.functions";
import { sitePageHead } from "@/features/vocabulary/lib/target-language";

// Reached from the top row of the feed's Settings sheet. Static copy, but the brand and the
// highlighted language follow the visited address, so the loader's locale rides along.
export const Route = createFileRoute("/feed/about")({
  ssr: "data-only",
  loader: async () => ({ locale: await getSiteLocale() }),
  head: ({ loaderData }) =>
    sitePageHead(
      loaderData?.locale,
      "Thông tin ứng dụng",
      "Bản thử nghiệm, nội dung do AI tạo, lộ trình và lời mời hợp tác.",
    ),
  component: function AppInfoRoute() {
    const { locale } = Route.useLoaderData();
    return <AppInfoPage locale={locale} />;
  },
});
