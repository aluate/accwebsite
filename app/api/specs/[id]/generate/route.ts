export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { renderToBuffer } from "@react-pdf/renderer";
import { renderSpecPDF } from "@/lib/pdf-spec";
import { loadSpecPDFData, SpecDataError } from "@/lib/spec-data";

export const runtime = 'nodejs';

// POST /api/specs/[id]/generate
//
// Generates the spec PDF and returns it inline as application/pdf.
//
// TODO: Previously saved to disk (data/jobs/{job_id}/specs/{spec_id}/) and
// returned a download URL. On Vercel there is no persistent disk. The buffer
// is now returned directly. Wire Supabase Storage here if you need to persist
// the generated PDF for later retrieval or approval envelope building.

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: specId } = await params;
  let data;
  try {
    data = await loadSpecPDFData(specId);
  } catch (e) {
    if (e instanceof SpecDataError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const element = renderSpecPDF(data);
  const buffer = await renderToBuffer(element);
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `spec-${ts}.pdf`;

  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "X-Generated-At": data.generated_at,
    },
  });
}

// GET /api/specs/[id]/generate — not supported in serverless (no disk).
// Previously served the latest saved PDF from disk; now returns 410 Gone.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: specId } = await params;
  const [spec] = await sql<{ id: string }[]>`SELECT id FROM residential_specs WHERE id = ${specId}`;
  if (!spec) return NextResponse.json({ error: "Spec not found" }, { status: 404 });
  return NextResponse.json(
    { error: "Saved PDF files are not availabl