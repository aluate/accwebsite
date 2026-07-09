import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

type JobHit  = { id: string; job_number: string | null; client_name: string; site_address: string; city: string | null; pm: string | null; status: string };
type SpecHit = { id: string; job_id: string; name: string; lifecycle_state: string; client_name: string };

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ jobs: [], specs: [] });

  const pattern = `%${q.replace(/[%_]/g, "\\$&")}%`;

  const [jobs, specs] = await Promise.all([
    sql`
      SELECT id, job_number, client_name, site_address, city, pm, status
      FROM jobs
      WHERE
        client_name    ILIKE ${pattern} OR
        site_address   ILIKE ${pattern} OR
        city           ILIKE ${pattern} OR
        pm             ILIKE ${pattern} OR
        job_number     ILIKE ${pattern} OR
        builder_name   ILIKE ${pattern} OR
        builder_company ILIKE ${pattern} OR
        notes          ILIKE ${pattern}
      ORDER BY client_name
      LIMIT 20
    ` as Promise<JobHit[]>,
    sql`
      SELECT rs.id, rs.job_id, rs.name, rs.lifecycle_state, j.client_name
      FROM residential_specs rs
      JOIN jobs j ON j.id = rs.job_id
      WHERE rs.name ILIKE ${pattern} OR rs.notes ILIKE ${pattern}
      ORDER BY j.client_name
      LIMIT 10
    ` as Promise<SpecHit[]>,
  ]);

  return NextResponse.json({ jobs, specs });
}
