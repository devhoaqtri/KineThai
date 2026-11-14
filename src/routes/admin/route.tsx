/**
 * Admin layout route — publicly reachable on any host, gated by the admin PIN.
 */

import { createFileRoute, useRouter } from "@tanstack/react-router";
import { AdminPinGate, AdminShell } from "@/features/admin";
import { getAdminPinStatus } from "@/features/admin/api/pin.functions";
import { adminSearchSchema } from "@/features/admin/lib/search-schema";

export const Route = createFileRoute("/admin")({
  ssr: false,
  validateSearch: (search) => adminSearchSchema.parse(search),
  staleTime: 0,
  loader: async () => getAdminPinStatus(),
  pendingComponent: AdminPendingView,
  component: AdminRouteLayout,
});

function AdminPendingView() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
      Checking admin access…
    </div>
  );
}

function AdminRouteLayout() {
  const router = useRouter();
  const { unlocked } = Route.useLoaderData();

  if (!unlocked) {
    return <AdminPinGate onUnlocked={() => router.invalidate()} />;
  }

  return <AdminShell />;
}
