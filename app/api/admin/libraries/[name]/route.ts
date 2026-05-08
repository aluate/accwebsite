export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { requireRole } from "@/lib/auth";
import { sql } from "@/lib/db";

// /api/admin/libraries/[name]
// GET   → returns the CSV text (admin-only).
//          ?download=1 sets Content-Disposition: attachment.
// PUT   → replaces the CSV with the request body (text/csv).
//          Validates: header row matches the existing header row exactly.
//          Returns { ok, rows }. NOTE: sync-catalogs does NOT run here on
//          Vercel (filesystem is read-only). Edit CSVs locally and redeploy.
//
// Security: admin-only via requireRole. Path traversal blocked: name must
// match /^[a-z0-9_]+$/i and resolve under data/catalogs/.
//
// TODO: CSV files are read from local disk (data/catalogs/). This will not
// work on Vercel (read-only filesystem). Migrate catalog storage to Supabase
// Storage or DB table when deploying to production.

const CATALOGS = path.join(process.cwd(), "data", "catalogs");

function resolveCatalogPath(name: string): string | null {
  if (!/^[a-z0-9_]+$/i.test(name)) return null;
  const file = path.join(CATALOGS, `${name}.csv`);
  if (!path.resolve(file).startsWith(path.resolve(CATALOGS) + path.sep)) return null;
  if (!fs.existsSync(file)) return null;
  return file;
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
  const file = resolveCatalogPath(name);
  if (!file) return NextResponse.json({ error: "Library not found" }, { status: 404 });

  const blastId = req.nextUrl.searchParams.get("blast");
  if (blastId) {
    const radius = await getBlastRadius(name, blastId);
    return NextResponse.json(radius);
  }

  const text = fs.readFileSync(file, "utf-8");
  const download = req.nextUrl.searchParams.get("download");
  return new NextResponse(text, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      ...(download
        ? { "Content-Disposition": `attachment; filename="${name}.csv"` }
        : {}),
    },
  });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  await requireRole("admin");
  const { name } = await params;

  // Vercel: filesystem is read-only in production.
  if (process.env.VERCEL) {
    return NextResponse.json({
      error: "Catalog editing is not available on Vercel. Edit the CSV locally, run npm run sync-catalogs, and commit/deploy.",
    }, { status: 501 });
  }

  const file = resolveCatalogPath(name);
  if (!file) return NextResponse.json({ error: "Library not found" }, { status: 404 });

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
  // NOTE: sync-catalogs.mjs is not run here to avoid webpack bundling issues.
  // After editing CSVs locally, run `npm run sync-catalogs` manually.

  const rows = Math.max(0, newText.replace(/\r\n/g, "\n").split("\n").filter((l) => l.trim()).length - 1);
  return NextResponse.json({ ok: true, rows });
}
