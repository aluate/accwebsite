export const dynamic = "force-dynamic";

import { sql } from "@/lib/db";
import { requireBuilder } from "@/lib/auth";
import { redirect } from "next/navigation";
import { PmDashboardClient } from "@/components/PmDashboardClient";

export type PmJob = {
  id: string;
  job_number: string | null;
  client_name: string;
  site_address: string;
  city: string | null;
  pm: string | null;
  builder_name: string | null;
  delivery_date: string | null;
  install_type: string | null;
  install_start_date: string | null;
  status: string;
};

export default async function PmDashboardPage() {
  const session = await requireBuilder();
  if (!["admin", "pm"].includes(session.role)) {
    redirect("/jobs");
  }

  const jobs = await sql<PmJob[]>`
    SELECT
      id,
      job_number,
      client_name,
      site_address,
      city,
      pm,
      builder_name,
      delivery_date,
      install_type,
      install_start_date,
      status
    FROM jobs
    WHERE status NOT IN ('complete')
    ORDER BY
      CASE WHEN delivery_date IS NULL THEN 1 ELSE 0 END,
      delivery_date ASC,
      client_name ASC
  `;

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
      <div className="mb-8">
        <h1 className="font-heading text-3xl uppercase tracking-wide text-white">PM Dashboard</h1>
        <p className="text-white/40 text-xs font-condensed uppercase tracking-widest mt-1">
          Delivery &amp; install schedule view
        </p>
      </div>
      <PmDashboardClient jobs={jobs} currentPm={session.name} />
    </section>
  );
}
