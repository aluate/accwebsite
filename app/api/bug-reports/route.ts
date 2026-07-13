export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireBuilder } from "@/lib/auth";

export async function POST(req: Request) {
  const builder = await requireBuilder();

  const { page_url, what_trying, what_happened, severity } = await req.json();
  if (!what_trying?.trim() || !what_happened?.trim()) {
    return NextResponse.json({ error: "Both fields required" }, { status: 400 });
  }

  const [row] = await sql`
    INSERT INTO bug_reports (page_url, user_name, user_role, what_trying, what_happened, severity)
    VALUES (
      ${page_url ?? "unknown"},
      ${builder.name},
      ${builder.role},
      ${what_trying.trim()},
      ${what_happened.trim()},
      ${severity ?? "annoying"}
    )
    RETURNING *
  `;

  return NextResponse.json(row, { status: 201 });
}

export async function GET() {
  await requireBuilder();
  const rows = await sql`
    SELECT * FROM bug_reports ORDER BY created_at DESC LIMIT 500
  `;
  return NextResponse.json(rows);
}

export async function PATCH(req: Request) {
  const builder = await requireBuilder();
  if (builder.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  const { id, status } = await req.json();
  if (!["open", "fixed", "wont_fix"].includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  const [row] = await sql`
    UPDATE bug_reports SET status = ${status} WHERE id = ${id} RETURNING *
  `;
  return NextResponse.json(row);
}
