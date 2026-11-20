import { createFileRoute } from "@tanstack/react-router";
import { AppInfoPage } from "@/features/vocabulary/components/AppInfoPage";
import { resolveRouteLocale } from "@/features/vocabulary/api/site-locale.functions";
import { sitePageHead } from "@/features/vocabulary/lib/target-language";

// The Settings sheet now drops this content down in place (AppInfoContent); the page stays
// so a shared /feed/about link still opens. Static copy, but the brand and the highlighted
// language follow the visited address, so the loader's locale rides along.
export const Route = createFileRoute("/feed/about")({
  ssr: "data-only",
  loader: async () => ({ locale: await resolveRouteLocale() }),
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
