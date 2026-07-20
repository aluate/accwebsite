export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireBuilderApi } from "@/lib/auth";

/**
 * GET /api/jobs/[id]/constraints
 *
 * Returns constraint planning fields for a single job + its finish groups.
 * Auth: any builder. PM role is limited to their own job.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireBuilderApi();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const [job] = await sql<{
    id: string; job_number: string | null; client_name: string; pm: string; status: string;
    estimated_value: number | null; pm_complexity: number | null;
    box_count: number | null; wo_count: number | null;
  }[]>`
    SELECT id, job_number, client_name, pm, status,
           estimated_value, pm_complexity,
           box_count, wo_count
    FROM jobs
    WHERE id = ${id} OR job_number = ${id}
  `;

  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // PM role: only own jobs
  const isPrivileged = session.role === "karl" || session.role === "admin";
  if (!isPrivileged && session.role === "pm" && job.pm !== session.email) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const finishGroups = await sql<{
    id: string; label: string; finish_type: string;
    box_count: number | null; wo_count: number | null; fg_complexity: number | null;
  }[]>`
    SELECT fg.id, fg.label, fg.finish_type,
           fg.box_count, fg.wo_count, fg.pm_complexity AS fg_complexity
    FROM finish_groups fg
    JOIN residential_specs rs ON rs.id = fg.spec_id
    WHERE rs.job_id = ${job.id}
    ORDER BY fg.sort_order
  `;

  return NextResponse.json({ job, finish_groups: finishGroups });
}
