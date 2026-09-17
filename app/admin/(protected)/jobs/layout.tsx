import { requireCap } from "@/lib/permissions";

/*
  Everything under /admin/jobs is the builder-portal admin for a job
  (/admin/jobs/[id]/portal), so the capability is portal.manage.

  The gate sits on this layout rather than on the page because the page is two
  levels down. A layout at the root of the section gates the whole subtree, so a
  second page added under here later cannot arrive ungated.
*/
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireCap("portal.manage");
  return <>{children}</>;
}
