import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { spawnSync } from "child_process";
import { requireRole } from "@/lib/auth";
import { sql } from "@/lib/db";

// Force dynamic so Next.js/webpack doesn't statically analyze child_process args
export const dynamic = "force-dynamic";

// /api/admin/libraries/[name]
// GET   → returns the CSV text (admin-only).
//          ?download=1 sets Content-Disposition: attachment.
// PUT   → replaces the CSV with the request body (text/csv).
//          Validates: header row matches the existing header row exactly (no
//          renaming/adding/dropping columns from this UI to keep schema
//          changes deliberate). On success, runs sync-catalogs.mjs to refresh
//          the matching JSON file. Returns { ok, rows }.
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
  // Same minimal CSV split as the UI: enough for header validation.
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



// Library → FK reverse map. Lists tables (and column) that reference each
// library by ID. If you delete a row from one of these libraries, this map
// is consulted to count active references and warn the admin.
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

// GET /api/admin/libraries/[name]/blast-radius?id=ROW_ID
// Returns { count, breakdown } showing how many active rows reference this
// library row. Used by the editor UI to warn before delete.
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
      // Table may not exist yet (pre-migration). Skip silently.
    }
  }
  return { count: total, breakdown };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  await requireRole("admin");
  const { name } = await params;
  const file = resolveCatalogPath(name);
  if (!file) return NextResponse.json({ error: "Library not found" }, { status: 404 });

  // Blast-radius mode: ?blast=ROW_ID → returns reference count for that row.
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
  // Catalog edits must be made locally, then committed and deployed.
  if (process.env.VERCEL) {
    return NextResponse.json({
      error: "Catalog editing is not available on Vercel. Edit the CSV locally, run npm run sync-catalogs, and commit/deploy.",
    }, { status: 501 });
  }

  const file = resolveCatalogPath(name);
  if (!file) return NextResponse.json({ error: "Library not found" }, { status: 404 });

  const newText = await req.text();
  if (!newText.trim()) return NextResponse.json({ error: "Empty body" }, { status: 400 });

  // Validate header parity — disallow column add/remove/rename from this UI.
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

  // Re-sync JSON. spawnSync is sync — completes before the response goes out.
  // Note: path is built at runtime to prevent Next.js webpack from treating it
  // as a static module import and failing at build time.
  const syncScript = ["scripts", "sync-catalogs.mjs"].join("/");
  const sync = spawnSync("node", [syncScript], {
    cwd: process.cwd(),
    encoding: "utf-8",
  });
  if (sync.status !== 0) {
    retu