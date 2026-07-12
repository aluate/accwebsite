export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { requireRole } from "@/lib/auth";
import { sql } from "@/lib/db";

// Force dynamic so Next.js/webpack doesn't statically analyze child_process args

// /api/admin/libraries/[name]
// GET   → returns rows as JSON (DB-backed) or CSV text (file-backed).
//         ?format=csv forces CSV download for file-backed catalogs.
//         ?blast=<rowId> returns { count, breakdown } for FK usage.
// PUT   → replaces catalog rows in DB (DB-backed) or CSV (file-backed, local only).
//         Accepts JSON array for DB-backed catalogs.
//
// Security: admin-only via requireRole. Path traversal blocked: name must
// match /^[a-z0-9_]+$/i.

const CATALOGS = path.join(process.cwd(), "data", "catalogs");

// Map library name → DB table (DB-backed catalogs).
const DB_TABLE_MAP: Record<string, string> = {
  colors_paint:    "catalog_paint_colors",
  colors_stain:    "catalog_stain_colors",
  colors_melamine: "catalog_melamine_colors",
  colors_carcass:  "catalog_carcass_materials",
  drawer_box:      "catalog_drawer_boxes",
  edgeband:        "catalog_edgebands",
  species:         "catalog_species",
  accessories_reva:"catalog_accessories",
  builder_profiles:"catalog_builder_profiles",
  door_styles:     "catalog_door_styles",
  hardware_pulls:  "catalog_pulls",
  appliances:      "catalog_appliances",
};

function isDbBacked(name: string): boolean {
  return name in DB_TABLE_MAP;
}

function resolveFilePath(name: string): string | null {
  if (!/^[a-z0-9_]+$/i.test(name)) return null;
  // Allow CSV or JSON
  for (const ext of [".csv", ".json"]) {
    const file = path.join(CATALOGS, `${name}${ext}`);
    if (!path.resolve(file).startsWith(path.resolve(CATALOGS) + path.sep)) return null;
    if (fs.existsSync(file)) return file;
  }
  return null;
}

function parseHeader(text: string): string[] {
  const firstLine = text.replace(/\r\n/g, "\n").split("\n")[0] ?? "";
  const out: string[] = [];
  let cur = "", q = false;
  for (let i = 0; i < firstLine.length; i++) {
    const ch = firstLine[i];
    if (ch === '"') {
      if (q && firstLine[i + 1] === '"') { cur += '"'; i++; continue; }
      q = !q;
      continue;
    }
    if (ch === "," && !q) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

// Library → FK reverse map.
const REVERSE_FK_BY_LIBRARY: Record<string, Array<{ table: string; column: string }>> = {
  colors_carcass:    [{ table: "finish_groups",  column: "carcass_id" }, { table: "builder_profiles", column: "default_carcass_id" }],
  drawer_box:        [{ table: "finish_groups",  column: "drawer_box_id" }, { table: "builder_profiles", column: "default_drawer_box_id" }],
  edgeband:          [{ table: "finish_groups",  column: "edgeband_id" }],
  hardware_pulls:    [{ table: "finish_groups",  column: "pull_id" }, { table: "builder_profiles", column: "default_pull_id" }],
  door_styles:       [{ table: "finish_groups",  column: "door_style_id" }],
  accessories_reva:  [{ table: "room_accessories", column: "acc_id" }],
  rooms:             [],
  molding_types:     [{ table: "finish_moldings", column: "molding_type" }],
  molding_profiles:  [{ table: "finish_moldings", column: "molding_profile_id" }],
};

async function getBlastRadius(libraryName: string, rowId: string) {
  const fks = REVERSE_FK_BY_LIBRARY[libraryName] ?? [];
  const breakdown: Array<{ table: string; column: string; count: number }> = [];
  let total = 0;
  for (const fk of fks) {
    try {
      const [row] = await sql<{ n: number }[]>`SELECT COUNT(*) AS n FROM ${sql(fk.table)} WHERE ${sql(fk.column)} = ${rowId}`;
      const count = Number(row?.n ?? 0);
      breakdown.push({ ...fk, count });
      total += count;
    } catch {
      // Table may not exist yet. Skip silently.
    }
  }
  return { count: total, breakdown };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  await requireRole("admin");
  const { name } = await params;
  if (!/^[a-z0-9_]+$/i.test(name)) return NextResponse.json({ error: "Invalid name" }, { status: 400 });

  const blastId = req.nextUrl.searchParams.get("blast");
  if (blastId) {
    const radius = await getBlastRadius(name, blastId);
    return NextResponse.json(radius);
  }

  // DB-backed catalog
  if (isDbBacked(name)) {
    const table = DB_TABLE_MAP[name];
    try {
      const rows = await sql.unsafe(`SELECT * FROM ${table} ORDER BY id`);
      return NextResponse.json(rows);
    } catch (e) {
      return NextResponse.json({ error: `DB query failed: ${(e as Error).message}` }, { status: 500 });
    }
  }

  // File-backed: return CSV or JSON
  const file = resolveFilePath(name);
  if (!file) return NextResponse.json({ error: "Library not found" }, { status: 404 });

  const text = fs.readFileSync(file, "utf-8");
  const download = req.nextUrl.searchParams.get("download");

  if (file.endsWith(".json")) {
    return NextResponse.json(JSON.parse(text), {
      headers: download ? { "Content-Disposition": `attachment; filename="${name}.json"` } : {},
    });
  }

  return new NextResponse(text, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      ...(download ? { "Content-Disposition": `attachment; filename="${name}.csv"` } : {}),
    },
  });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  await requireRole("admin");
  const { name } = await params;
  if (!/^[a-z0-9_]+$/i.test(name)) return NextResponse.json({ error: "Invalid name" }, { status: 400 });

  // DB-backed: accept JSON array, upsert rows
  if (isDbBacked(name)) {
    const table = DB_TABLE_MAP[name];
    let rows: Record<string, unknown>[];
    try {
      rows = await req.json() as Record<string, unknown>[];
    } catch {
      return NextResponse.json({ error: "Body must be a JSON array" }, { status: 400 });
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "Empty or non-array body" }, { status: 400 });
    }

    // Serialize array values to semicolon-joined strings (matching seed convention)
    function ser(v: unknown): unknown {
      if (v == null) return null;
      if (Array.isArray(v)) return (v as unknown[]).join(";");
      return v;
    }

    const colNames = Object.keys(rows[0]);
    if (!colNames.includes("id")) {
      return NextResponse.json({ error: "Each row must have an 'id' field" }, { status: 400 });
    }

    let count = 0;
    for (const row of rows) {
      const id = row.id as string;
      if (!id) continue;
      const setCols = colNames.filter(c => c !== "id").map(c => `${c} = EXCLUDED.${c}`).join(", ");
      const colList = colNames.join(", ");
      const placeholders = colNames.map((_, i) => `$${i + 1}`).join(", ");
      const values = colNames.map(c => ser(row[c]));
      await sql.unsafe(
        `INSERT INTO ${table} (${colList}) VALUES (${placeholders}) ON CONFLICT (id) DO UPDATE SET ${setCols}`,
        values as never[]
      );
      count++;
    }

    return NextResponse.json({ ok: true, rows: count });
  }

  // File-backed: Vercel read-only guard, then replace CSV
  if (process.env.VERCEL) {
    return NextResponse.json({
      error: "File-backed catalog editing is not available on Vercel. Migrate this catalog to DB or edit locally.",
    }, { status: 501 });
  }

  const file = resolveFilePath(name);
  if (!file || !file.endsWith(".csv")) {
    return NextResponse.json({ error: "Library not found or not a CSV" }, { status: 404 });
  }

  const newText = await req.text();
  if (!newText.trim()) return NextResponse.json({ error: "Empty body" }, { status: 400 });

  const existing = fs.readFileSync(file, "utf-8");
  const oldHeaders = parseHeader(existing);
  const newHeaders = parseHeader(newText);
  if (oldHeaders.join(",") !== newHeaders.join(",")) {
    return NextResponse.json({
      error: "Header row must match exactly. Edit headers in code, not the UI.",
      expected: oldHeaders,
      got: newHeaders,
    }, { status: 400 });
  }

  fs.writeFileSync(file, newText, "utf-8");
  const rows = Math.max(0, newText.replace(/\r\n/g, "\n").split("\n").filter((l) => l.trim()).length - 1);
  return NextResponse.json({ ok: true, rows });
}
