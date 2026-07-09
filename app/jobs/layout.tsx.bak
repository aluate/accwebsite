import { requireBuilder } from "@/lib/auth";

// Phase 1B+ (2026-05): /jobs/** is the PM-facing tool. Any logged-in user
// (admin or user role) can use it. Admin role is only required for
// /admin/builders (creating new logins).
export default async function JobsLayout({ children }: { children: React.ReactNode }) {
  await requireBuilder();
  return <>{children}</>;
}
