export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireRole } from "@/lib/auth";

type Params = { params: Promise<{ name: string }> };

// GET /api/admin/catalog-libraries/[name] — returns full row array
export async function GET(_req: NextRequest, { params }: Params) {
  await requireRole("admin");
  const { name } = await params;
  if (!/^[a-z0-9_]+$/.test(name)) return NextResponse.json({ error: "Invalid name" }, { status: 400 });

  const [row] = await sql<{ data: unknown[] }[]>`
    SELECT data FROM catalog_libraries WHERE name = ${name}
  `;
  return NextResponse.json({ rows: row?.data ?? [] });
}

// PUT /api/admin/catalog-libraries/[name] — replace entire catalog
export async function PUT(req: NextRequest, { params }: Params) {
  await requireRole("admin");
  const { name } = await params;
  if (!/^[a-z0-9_]+$/.test(name)) return NextResponse.json({ error: "Invalid name" }, { status: 400 });

  const { rows } = await req.json();
  if (!Array.isArray(rows)) return NextResponse.json({ error: "rows must be array" }, { status: 400 });

  await sql`
    INSERT INTO catalog_libraries (name, data, updated_at)
    VALUES (${name}, ${JSON.stringify(rows)}::jsonb, NOW())
    ON CONFLICT (name) DO UPDATE SET
      data = EXCLUDED.data,
      updated_at = NOW()
  `;
  return NextResponse.json({ ok: true, count: rows.length });
}
