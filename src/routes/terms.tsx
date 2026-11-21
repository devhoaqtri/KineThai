import { createFileRoute } from "@tanstack/react-router";
import { TermsPage } from "@/features/vocabulary/components/TermsPage";
import { getSiteLocale } from "@/features/vocabulary/api/site-locale.functions";
import { sitePageHead } from "@/features/vocabulary/lib/target-language";

// The terms of use, rendered in full on the server like the privacy policy, so they read as
// plain HTML to anyone who opens the link. Static copy; the brand follows the address.
export const Route = createFileRoute("/terms")({
  loader: async () => ({ locale: await getSiteLocale() }),
  head: ({ loaderData }) =>
    sitePageHead(
      loaderData?.locale,
      "Điều khoản sử dụng",
      "Cách dùng trang, quyền với nội dung, bộ từ bạn tự nhập và giới hạn trách nhiệm.",
    ),
  component: function TermsRoute() {
    const { locale } = Route.useLoaderData();
    return <TermsPage locale={locale} />;
  },
});
