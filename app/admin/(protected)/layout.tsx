import { requireRole } from "@/lib/auth";

// Admin pages require role 'admin' from the unified builder_accounts table.
// The legacy admin password gate is retired in favor of role-based auth.
//
// 2026-08-06: was requireKarl(), which deliberately refused role 'admin'. But the
// real staff accounts (residential@, joshl@) ARE role 'admin', so every
// configuration surface in the app -- users, builders, catalogs, templates,
// estimating, schedule admin -- was reachable by exactly one person.
// requireRole(["admin"]) still admits karl via the bypass in lib/auth.ts.
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole(["admin"]);
  return <>{children}</>;
}
