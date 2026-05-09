import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [job] = await sql`SELECT * FROM jobs WHERE id = ${id}`;
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ job });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  const allowed = [
    "status", "job_type", "client_name", "client_email", "client_phone",
    "site_address", "city", "pm", "builder_name", "builder_email",
    "builder_phone", "builder_company", "delivery_date", "notes",
    "notes_install", "notes_finishing", "notes_shop", "notes_client",
    "mod_residential", "mod_commercial", "mod_trim", "mod_doors",
  ];

  const fields = Object.keys(body).filter((k) => allowed.includes(k));
  if (fields.length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const MOD_FIELDS = new Set(["mod_residential", "mod_commercial", "mod_trim", "mod_doors"]);
  const updates: Record<string, unknown> = {};
  for (const f of fields) updates[f] = MOD_FIELDS.has(f) ? (body[f] ? 1 : 0) : body[f];

  await sql`UPDATE jobs SET ${sql(updates)} WHERE id = ${id}`;

  return NextResponse.json({ ok: true });
}
