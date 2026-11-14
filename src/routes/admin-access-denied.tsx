/**
 * Standalone 403 page for non-admin users (outside /admin layout).
 */

import { Link, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/admin-access-denied")({
  ssr: false,
  component: AdminAccessDeniedPage,
});

function AdminAccessDeniedPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      <h1 className="text-2xl font-semibold">403 — Admin access required</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        This surface is gated by <code>profiles.is_admin</code>, <code>ADMIN_USER_IDS</code>, or{" "}
        <code>VITE_DEMO_ADMIN=1</code> for a demo session under <code>npm run dev</code>.
      </p>
      <Link to="/feed" className="text-sm underline">
        Back to feed
      </Link>
    </div>
  );
}
