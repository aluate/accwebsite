export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireRole } from "@/lib/auth";

const ALLOWED_TABLES = new Set([
  "catalog_paint_colors", "catalog_stain_colors", "catalog_melamine_colors",
  "catalog_species", "catalog_accessories",
]);

export async function GET() {
  await requireRole("admin");
  const results: Record<string, unknown[]> = {};
  for (const table of ALLOWED_TABLES) {
    try {
      const rows = await sql.unsafe(`SELECT id, name, brand, notes, verified FROM ${table} WHERE verified = 0`);
      if (rows.length > 0) results[table] = rows;
    } catch {
      // Column may not exist yet
    }
  }
  return NextResponse.json({ unverified: results });
}

export async function PATCH(req: NextRequest) {
  await requireRole("admin");
  const body = await req.json() as { table: string; id: string; action: "verify" | "delete" };
  const { table, id, action } = body;
  if (!ALLOWED_TABLES.has(table)) return NextResponse.json({ error: "invalid table" }, { status: 400 });
  if (!id?.trim()) return NextResponse.json({ error: "id required" }, { status: 400 });

  if (action === "verify") {
    await sql.unsafe(`UPDATE ${table} SET verified = 1 WHERE id = $1`, [id]);
    return NextResponse.json({ ok: true, action: "verified" });
  }
  if (action === "delete") {
    await sql.unsafe(`DELETE FROM ${table} WHERE id = $1`, [id]);
    return NextResponse.json({ ok: true, action: "deleted" });
  }
  return NextResponse.json({ error: "action must be verify or delete" }, { status: 400 });
}

// Also handle POST for simple form submissions from the admin UI
export async function POST(req: NextRequest) {
  await requireRole("admin");
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.redirect(new URL("/admin/catalog-review", req.url));
  const table = form.get("table") as string;
  const id = form.get("id") as string;
  const action = form.get("action") as string;
  if (!ALLOWED_TABLES.has(table) || !id) return NextResponse.redirect(new URL("/admin/catalog-review", req.url));
  if (action === "verify") {
    await sql.unsafe(`UPDATE ${table} SET verified = 1 WHERE id = $1`, [id]);
  } else if (action === "delete") {
    await sql.unsafe(`DELETE FROM ${table} WHERE id = $1`, [id]);
  }
  return NextResponse.redirect(new URL("/admin/catalog-review", req.url));
}
