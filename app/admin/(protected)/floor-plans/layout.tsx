import { requireCap } from "@/lib/permissions";

/*
  floor-plans/page.tsx is a client component, so it cannot call a server-side gate
  itself. This layout runs first, on the server, and is where the capability for
  this page is enforced. Keep it in step with ADMIN_PAGE_CAPS in
  lib/permissions.ts — scripts/test-permission-map.mjs fails the build if they
  disagree.
*/
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireCap("documents.view");
  return <>{children}</>;
}
