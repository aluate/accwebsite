export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

const API_KEY = process.env.INTERNAL_API_KEY;

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");

  if (!API_KEY || key !== API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await sql`
    SELECT id, page_url, user_name, user_role, what_trying, what_happened,
           severity, status, source, serial_no, created_at
    FROM bug_reports
    WHERE status = 'open'
    ORDER BY
      CASE severity WHEN 'blocker' THEN 1 WHEN 'annoying' THEN 2 WHEN 'minor' THEN 3 ELSE 4 END,
      created_at ASC
  `;

  return NextResponse.json(rows);
}
