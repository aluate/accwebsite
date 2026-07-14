export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { sql } from "@/lib/db";
import { requireRole } from "@/lib/auth";

const CATALOG = "accessories_reva";
const JSON_PATH = path.join(process.cwd(), "data", "catalogs", "accessories_reva.json");

function loadItems(): Record<string, unknown>[] {
  return JSON.parse(fs.readFileSync(JSON_PATH, "utf-8")) as Record<string, unknown>[];
}

// GET /api/admin/accessories
// Returns all catalog items merged with active state from DB.
// No DB row for an item => active: true (default).
export async function GET(_req: NextRequest) {
  await requireRole("admin");

  const rows = loadItems();
  const states = await sql<{ item_id: string; active: boolean }[]>`
    SELECT item_id, active FROM catalog_active_states WHERE catalog = ${CATALOG}
  `;
  const stateMap = new Map(states.map((s) => [s.item_id, s.active]));

  const merged = rows.map((r) => ({
    ...r,
    active: stateMap.has(r.id as string) ? stateMap.get(r.id as string) : true,
  }));

  return NextResponse.json({ items: merged });
}

// PATCH /api/admin/accessories
// Body: { id: string, active: boolean }
// Upserts the active state for one item.
export async function PATCH(req: NextRequest) {
  await requireRole("admin");

  const { id, active } = await req.json() as { id: string; active: boolean };
  if (!id || typeof active !== "boolean") {
    return NextResponse.json({ error: "id and active required" }, { status: 400 });
  }

  await sql`
    INSERT INTO catalog_active_states (catalog, item_id, active, updated_at)
    VALUES (${CATALOG}, ${id}, ${active}, NOW())
    ON CONFLICT (catalog, item_id) DO UPDATE
      SET active = EXCLUDED.active, updated_at = NOW()
  `;

  return NextResponse.json({ ok: true, id, active });
}
