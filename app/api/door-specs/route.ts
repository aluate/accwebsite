export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sql, uid } from "@/lib/db";

// POST /api/door-specs  { job_id, name }
export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.job_id) return NextResponse.json({ error: "job_id required" }, { status: 400 });
  const now = new Date().toISOString();
  const id = uid();
  await sql`
    INSERT INTO door_specs (id, job_id, name, status, created_at, updated_at)
    VALUES (${id}, ${body.job_id}, ${body.name ?? "Door Spec"}, 'draft', ${now}, ${now})
  `;
  return NextResponse.json({ id }, { status: 201 });
}
