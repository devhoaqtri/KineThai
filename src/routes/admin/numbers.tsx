import { createFileRoute } from "@tanstack/react-router";
import { NumberReviewPage } from "@/features/admin";

export const Route = createFileRoute("/admin/numbers")({
  component: NumberReviewPage,
});
