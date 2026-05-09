export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireBuilder } from "@/lib/auth";
import { loadSpecPDFData, SpecDataError } from "@/lib/spec-data";

export const runtime = 'nodejs';

// POST /api/specs/[id]/excel
//
// Renders the Artifex spec template populated with this spec's data and
// returns the .xlsx buffer directly as a download response.
//
// TODO: Previously saved to local disk (data/jobs/{job_id}/specs/{spec_id}/).
// On Vercel there is no persistent disk. The file is now returned inline.
// If saving to Supabase Storage is needed, wire that here.
//
// Karl ran `npm install exceljs` 2026-05; if missing, returns 503 with
// a clear install hint.

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireBuilder();
  const { id: specId } = await params;
  let data;
  try {
    data = await loadSpecPDFData(specId);
  } catch (e) {
    if (e instanceof SpecDataError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  let buffer: Buffer;
  try {
    const xlsxMod = await import("@/lib/xlsx-spec");
    buffer = await xlsxMod.renderSpecXLSX(data);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Cannot find module") || msg.includes("exceljs")) {
      return NextResponse.json({
        error: "exceljs not installed. Run `npm install exceljs` from repo root and restart the server.",
      }, { status: 503 });
    }
    return NextResponse.json({ error: `XLSX render failed: ${msg}` }, { status: 500 });
  }

  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `spec-${ts}.xlsx`;

  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "X-Bytes": String(buffer.length),
    },
  });
}

// GET /api/specs/[id]/excel — not supported in serverless (no disk).
// Previously served saved .xlsx files; now returns 410 Gone.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireBuilder();
  const { id: specId } = await params;
  const [spec] = await sql<{ job_id: string }[]>`SELECT job_id FROM residential_specs WHERE id = ${specId}`;
  if (!spec) return NextResponse.json({ error: "Spec not found" }, { status: 404 });
  return NextResponse.json(
    { error: "Saved XLSX files are not available in this deployment. Use POST to generate a fresh download." },
    { status: 410 },
  );
}
