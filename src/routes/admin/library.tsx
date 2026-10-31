import { createFileRoute } from "@tanstack/react-router";
import { WordLibraryPage } from "@/features/admin";

export const Route = createFileRoute("/admin/library")({
  component: WordLibraryPage,
});
