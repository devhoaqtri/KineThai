import { createFileRoute } from "@tanstack/react-router";
import { StorePage } from "@/features/ecosystem/components/StorePage";
import { resolveRouteLocale } from "@/features/vocabulary/api/site-locale.functions";
import { sitePageHead } from "@/features/vocabulary/lib/target-language";

export const Route = createFileRoute("/store")({
  loader: async () => ({ locale: await resolveRouteLocale() }),
  head: ({ loaderData }) => sitePageHead(loaderData?.locale, "Cửa hàng Chay Lá", "Mọi app trong hệ sinh thái Chay Lá, kèm ảnh màn hình và mô tả."),
  component: StorePage,
});
