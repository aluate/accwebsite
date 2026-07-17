export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

// GET /api/jobs/pms — returns active accounts with role in ('pm','admin'), ordered by name.
// Used by IntakeForm to populate the PM dropdown from the DB instead of site.ts.
export async function GET() {
  const rows = await sql<{ name: string; email: string | null }[]>`
    SELECT name, email
    FROM builder_accounts
    WHERE role IN ('pm', 'admin', 'karl') AND active = 1
    ORDER BY name ASC
  `;
  return NextResponse.json(rows);
}
