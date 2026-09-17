import { redirect } from "next/navigation";
import { requireBuilder } from "@/lib/auth";
import { canEnterAdmin } from "@/lib/permissions";

/*
  The floor, not the gate.

  This was requireRole(["admin"]) over all twenty-two pages below it — one
  decision covering user management, wipe-jobs, the pipeline, leads and the
  catalogs alike. Karl, 2026-09-17, on why nobody holds the pm role: "the PM
  permissions were incomplete and I had to bump everyone up to make it work."
  This layout is what made them incomplete. There was no way to hand a PM the
  pipeline without also handing them everything else.

  Each page now declares the capability that opens it — see ADMIN_PAGE_CAPS in
  lib/permissions.ts — and calls requireCap() itself. What is left here is a
  floor: anyone holding NONE of those capabilities never gets as far as a page,
  so a page that forgets to declare one is not silently wide open.

  A forgotten declaration is still a bug, and it is caught in CI rather than in
  production: scripts/test-permission-map.mjs fails if any page under this
  directory is missing from ADMIN_PAGE_CAPS or does not call requireCap().

  2026-08-06 history, kept because it explains the shape: this was once
  requireKarl(), which deliberately refused role 'admin'. The real staff accounts
  ARE role 'admin', so every configuration surface in the app was reachable by
  exactly one person. Widening it to requireRole(["admin"]) fixed that and
  created this problem instead.
*/
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireBuilder();
  if (!canEnterAdmin(session.role)) redirect("/jobs");
  return <>{children}</>;
}
