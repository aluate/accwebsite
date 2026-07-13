import { requireRole } from "@/lib/auth";
import { sql } from "@/lib/db";
import { EstimatingListClient } from "@/components/EstimatingListClient";

export default async function EstimatingListPage() {
  await requireRole("admin");

  const estimates = await sql`
    SELECT e.id, e.title, e.status, e.scope, e.is_budget_estimate,
           e.target_margin_pct, e.created_at, e.updated_at,
           j.client_name, j.site_address
    FROM estimates e
    LEFT JOIN jobs j ON j.id = e.job_id
    ORDER BY e.updated_at DESC
  `;

  const jobs = await sql`
    SELECT id, client_name, site_address, job_number
    FROM jobs
    ORDER BY seq DESC
    LIMIT 200
  `;

  return (
    <EstimatingListClient
      estimates={estimates as Parameters<typeof EstimatingListClient>[0]["estimates"]}
      jobs={jobs as Parameters<typeof EstimatingListClient>[0]["jobs"]}
    />
  );
}
