export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import {
  CATALOG_NAMES,
  OBJECT_CATALOGS,
  SUPERSEDED_CATALOGS,
  invalidateCatalogCache,
  keyFieldFor,
} from "@/lib/catalogs";
import fs from "fs";
import path from "path";

type Params = { params: Promise<{ name: string }> };

const DIR = path.join(process.cwd(), "data/catalogs");

function fileRows(name: string): unknown[] | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(DIR, `${name}.json`), "utf-8"));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** RFC4180: quote anything containing a comma, a quote or a newline; double inner quotes. */
function csvCell(v: unknown): string {
  if (v == null) return "";
  const s = Array.isArray(v) ? v.join(";") : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: Record<string, unknown>[]): string {
  const cols: string[] = [];
  for (const r of rows) for (const k of Object.keys(r)) if (!cols.includes(k)) cols.push(k);
  const lines = [cols.join(",")];
  for (const r of rows) lines.push(cols.map((c) => csvCell(r[c])).join(","));
  return lines.join("\r\n") + "\r\n";
}

/**
 * GET /api/admin/catalog-libraries/[name]
 *
 * Returns the rows the application is actually serving, and says where they came
 * from. This used to return `{ rows: [] }` for any catalog with no database row,
 * which meant every catalog looked empty in the admin table until someone saved
 * it — and saving an empty table wrote an empty catalog. That is the bug the
 * `source` field and the PUT guards below exist to close.
 *
 *   ?format=csv   download what is live, for committing back to data/catalogs/
 */
export async function GET(req: NextRequest, { params }: Params) {
  await requireRole("admin");
  const { name } = await params;
  if (!/^[a-z0-9_]+$/.test(name)) return NextResponse.json({ error: "Invalid name" }, { status: 400 });

  const [row] = await sql<{ data: unknown; updated_at: string | null }[]>`
    SELECT data, updated_at FROM catalog_libraries WHERE name = ${name}
  `;

  const dbRows = Array.isArray(row?.data) && row.data.length > 0 ? (row.data as unknown[]) : null;
  const file = fileRows(name);
  const rows = dbRows ?? file ?? [];
  const source: "db" | "file" | "none" = dbRows ? "db" : file ? "file" : "none";

  if (req.nextUrl.searchParams.get("format") === "csv") {
    return new NextResponse(toCsv(rows as Record<string, unknown>[]), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${name}.csv"`,
      },
    });
  }

  return NextResponse.json({
    rows,
    source,
    updated_at: row?.updated_at ?? null,
    file_row_count: file?.length ?? null,
    is_object_catalog: OBJECT_CATALOGS.includes(name),
    known_catalog: CATALOG_NAMES.includes(name),
    superseded_by: SUPERSEDED_CATALOGS[name] ?? null,
  });
}

/**
 * PUT /api/admin/catalog-libraries/[name] — replace the whole catalog.
 *
 * Refuses three things, all of which were previously possible in one click:
 *
 *  1. An empty array. The loader falls back to the file rather than serving an
 *     empty catalog, so writing one produces a database row that does nothing
 *     while looking authoritative. Use ?allow_empty=1 if that is really meant.
 *  2. Rows without an `id`. Every consumer resolves catalogs by id; a row with
 *     no id cannot be referenced by a spec and will silently never appear.
 *  3. Duplicate ids. First-wins lookups mean the second row is dead weight, and
 *     which one wins depends on row order.
 *
 * A shrink of more than half is allowed but reported, so a truncated paste shows
 * up in the response instead of only in a work order three weeks later.
 */
export async function PUT(req: NextRequest, { params }: Params) {
  await requireRole("admin");
  const { name } = await params;
  if (!/^[a-z0-9_]+$/.test(name)) return NextResponse.json({ error: "Invalid name" }, { status: 400 });
  if (OBJECT_CATALOGS.includes(name)) {
    return NextResponse.json({
      error: `"${name}" is stored as an object, not a row list, and is not editable here. Edit data/catalogs/${name}.json and deploy.`,
    }, { status: 400 });
  }
  const superseded = SUPERSEDED_CATALOGS[name];
  if (superseded) {
    return NextResponse.json({
      error: `"${name}" is not read from here. The app reads ${superseded.table}. Edit it at ${superseded.editAt} — a save on this page would look like it worked and change nothing.`,
      edit_at: superseded.editAt,
    }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const rows = (body as { rows?: unknown } | null)?.rows;
  if (!Array.isArray(rows)) return NextResponse.json({ error: "rows must be an array" }, { status: 400 });

  const allowEmpty = req.nextUrl.searchParams.get("allow_empty") === "1";
  if (rows.length === 0 && !allowEmpty) {
    return NextResponse.json({
      error: "Refusing to save an empty catalog. An empty row falls back to the file, so this would not do what it looks like. Add ?allow_empty=1 to override.",
    }, { status: 400 });
  }

  // Not every catalog is keyed on `id` — the SW paint list is keyed on `code`,
  // the cabinet catalogs on `sku_prefix` / `catalog_id`. Checking the wrong field
  // would reject 12 perfectly good catalogs.
  const key = keyFieldFor(name);
  const ids: string[] = [];
  const missingId: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    const id = (rows[i] as Record<string, unknown> | null)?.[key];
    if (id == null || String(id).trim() === "") missingId.push(i + 1);
    else ids.push(String(id));
  }
  if (missingId.length) {
    return NextResponse.json({
      error: `${missingId.length} row(s) have no ${key} and could never be selected on a spec.`,
      key_field: key,
      rows_without_key: missingId.slice(0, 20),
    }, { status: 400 });
  }
  const dupes = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
  if (dupes.length) {
    return NextResponse.json({
      error: `Duplicate ${key}: ${dupes.slice(0, 10).join(", ")}${dupes.length > 10 ? "…" : ""}. Lookups take the first match, so the rest would never be used.`,
      key_field: key,
    }, { status: 400 });
  }

  const before = fileRows(name)?.length ?? null;
  const [existing] = await sql<{ n: number }[]>`
    SELECT COALESCE(jsonb_array_length(data), 0)::int AS n FROM catalog_libraries WHERE name = ${name}
  `;
  const previous = existing?.n ?? before ?? 0;

  // sql.json(), NOT `${JSON.stringify(rows)}::jsonb`. postgres.js infers the json
  // type from the cast and then encodes the value again, so the string form stores
  // a jsonb *string* containing the array rather than the array — jsonb_typeof
  // returns 'string'. That is what this route did before, which means every save
  // from this page wrote a row the app could not read: the old loader handed the
  // string straight to .find(), and the spec builder page threw. Verified against
  // postgres.js 3.4.5; scripts/seed-catalog-libraries.mjs --repair fixes old rows.
  await sql`
    INSERT INTO catalog_libraries (name, data, updated_at)
    VALUES (${name}, ${sql.json(rows)}, NOW())
    ON CONFLICT (name) DO UPDATE SET
      data = EXCLUDED.data,
      updated_at = NOW()
  `;

  // This instance serves the new rows immediately; others pick them up within
  // the loader's TTL.
  invalidateCatalogCache();

  const shrank = previous > 0 && rows.length < previous / 2;
  return NextResponse.json({
    ok: true,
    count: rows.length,
    previous_count: previous,
    ...(shrank
      ? { warning: `Row count fell from ${previous} to ${rows.length}. If that was not intended, the file copy in data/catalogs/${name}.json is unchanged — re-seed from it with scripts/seed-catalog-libraries.mjs.` }
      : {}),
    ...(CATALOG_NAMES.includes(name)
      ? {}
      : { warning_unknown: `"${name}" is not a catalog the loader reads. It was saved, but nothing consumes it.` }),
  });
}

/**
 * DELETE /api/admin/catalog-libraries/[name] — drop the database override so the
 * catalog reverts to the file shipped with the deploy. This is the undo for a
 * bad save, and it is why the file copy is kept rather than migrated away.
 */
export async function DELETE(_req: NextRequest, { params }: Params) {
  await requireRole("admin");
  const { name } = await params;
  if (!/^[a-z0-9_]+$/.test(name)) return NextResponse.json({ error: "Invalid name" }, { status: 400 });

  const file = fileRows(name);
  if (!file) {
    return NextResponse.json({
      error: `No data/catalogs/${name}.json to fall back to — deleting the database row would leave this catalog with no source at all.`,
    }, { status: 400 });
  }

  const deleted = await sql`DELETE FROM catalog_libraries WHERE name = ${name} RETURNING name`;
  invalidateCatalogCache();
  return NextResponse.json({
    ok: true,
    reverted: deleted.length > 0,
    now_serving: "file",
    row_count: file.length,
  });
}
