import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/builders?q=premier
// Returns builders matching the search query (company or contact_name)
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const like = `%${q}%`;

  const rows = await sql`
    SELECT id, company, contact_name, phone, email, typical_pm, notes
    FROM builders
    WHERE active = 1
      AND (company ILIKE ${like} OR contact_name ILIKE ${like})
    ORDER BY company
    LIMIT 20
  `;

  return NextResponse.json(rows);
}

// POST /api/builders — create or update a builder (admin only)
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { id, company, contact_name, phone, email, typical_pm, notes } = body;
  if (!id || !company) return NextResponse.json({ error: "id and company required" }, { status: 400 });

  await sql`
    INSERT INTO builders (id, company, contact_name, phone, email, typical_pm, notes, active, created_at, updated_at)
    VALUES (${id}, ${company}, ${contact_name ?? null}, ${phone ?? null}, ${email ?? null},
            ${typical_pm ?? null}, ${notes ?? null}, 1, NOW()::text, NOW()::text)
    ON CONFLICT (id) DO UPDATE SET
      company      = EXCLUDED.company,
      contact_name = EXCLUDED.contact_name,
      phone        = EXCLUDED.phone,
      email        = EXCLUDED.email,
      typical_pm   = EXCLUDED.typical_pm,
      notes        = EXCLUDED.notes,
      updated_at   = NOW()::text
  `;

  return NextResponse.json({ ok: true });
}
