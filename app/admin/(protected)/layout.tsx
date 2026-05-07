import { requireRole } from "@/lib/auth";

// Phase 1B+ (2026-05): admin pages (e.g. /admin/builders) require role='admin'
// from the unified builder_accounts table. The legacy admin password gate is
// retired in favor of role-based auth.
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole("admin");
  return <>{children}</>;
}
