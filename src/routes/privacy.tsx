import { createFileRoute } from "@tanstack/react-router";
import { PrivacyPage } from "@/features/vocabulary/components/PrivacyPage";
import { getSiteLocale } from "@/features/vocabulary/api/site-locale.functions";
import { sitePageHead } from "@/features/vocabulary/lib/target-language";

// The privacy policy, rendered in full on the server: Google's reviewers and crawlers read it
// as plain HTML (the YouTube publishing app links to it, docs/youtube-publishing.md). Static
// copy; the brand follows the visited address, so the loader's locale rides along.
export const Route = createFileRoute("/privacy")({
  loader: async () => ({ locale: await getSiteLocale() }),
  head: ({ loaderData }) =>
    sitePageHead(
      loaderData?.locale,
      "Chính sách quyền riêng tư",
      "Dữ liệu nào nằm trên máy bạn, dữ liệu ẩn danh nào được gửi đi, và cách kênh dùng API của YouTube.",
    ),
  component: function PrivacyRoute() {
    const { locale } = Route.useLoaderData();
    return <PrivacyPage locale={locale} />;
  },
});
