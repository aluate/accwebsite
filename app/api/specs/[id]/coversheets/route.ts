export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { sql, uid } from "@/lib/db";
import { requireBuilder } from "@/lib/auth";
import { loadSpecPDFData } from "@/lib/spec-data";
import { renderCoversheetBuffer } from "@/lib/pdf-coversheet";
import type { WorkOrderRow } from "@/lib/pdf-coversheet";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "job-files";

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// POST /api/specs/[id]/coversheets
// Generates one cover sheet PDF per finish group for a spec.
// Uploads each to: jobs/{jobId}/00_Drawings/{job#} STN - {fgLabel} Coversheet.pdf
// Returns: { ok: true, files: [{ fg_label, filename, storage_path }] }
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireBuilder();
  if (!["karl", "admin", "pm", "engineer"].includes(session.role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: specId } = await params;

  // 1. Load spec + job
  type SpecJobRow = {
    job_id: string;
    job_number: string | null;
    site_address: string;
  };
  const [specJob] = await sql<SpecJobRow[]>`
    SELECT rs.job_id, j.job_number, j.site_address
    FROM residential_specs rs
    JOIN jobs j ON j.id = rs.job_id
    WHERE rs.id = ${specId}
  `;
  if (!specJob) {
    return NextResponse.json({ error: "Spec not found" }, { status: 404 });
  }

  const { job_id: jobId, job_number, site_address } = specJob;
  const paddedJobNum = job_number ? String(job_number).padStart(5, "0") : "00000";

  // 2. Load spec data (finish groups, rooms, etc.)
  let specData;
  try {
    specData = await loadSpecPDFData(specId);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = (e as { status?: number }).status ?? 500;
    return NextResponse.json({ error: msg }, { status });
  }

  // 3. Load work orders for this job (include finish_group_id)
  type WORow = WorkOrderRow & { finish_group_id: string | null };
  const workOrders = await sql<WORow[]>`
    SELECT id, wo_number, category_code, finish_group_id, description, status, notes
    FROM work_orders
    WHERE job_id = ${jobId}
    ORDER BY category_code, sort_order, created_at
  `;

  // Build rooms array in the shape CoversheetPage expects
  const rooms = specData.rooms.map(r => ({
    id: r.id,
    name: r.name,
    notes: r.notes,
    finishes: r.finishes.map(f => ({
      finish_group_id: f.finish_group_id,
      finish_label: f.finish_label,
      zone: f.zone,
    })),
  }));

  // 4. Generate + upload one PDF per finish group
  const results: Array<{ fg_label: string; filename: string; storage_path: string }> = [];

  for (let i = 0; i < specData.finish_groups.length; i++) {
    const fg = specData.finish_groups[i];
    const fgIndex = i + 1;

    // Filter WOs for this FG (null finish_group_id = not linked to any FG, skip)
    const fgWOs: WorkOrderRow[] = workOrders.filter(
      w => w.finish_group_id === fg.id
    );

    // Render PDF
    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await renderCoversheetBuffer(
        { job_number, site_address },
        fg,
        fgWOs,
        fgIndex,
        rooms
      );
    } catch (e) {
      return NextResponse.json(
        { error: `PDF render failed for FG ${fg.label}: ${e instanceof Error ? e.message : String(e)}` },
        { status: 500 }
      );
    }

    // Build filename / storage path
    const fgSlug = fg.label.replace(/[^a-zA-Z0-9_\-]/g, "_");
    const filename = `${paddedJobNum} STN - ${fg.label} Coversheet.pdf`;
    const storagePath = `jobs/${jobId}/00_Drawings/${paddedJobNum} STN - ${fgSlug} Coversheet.pdf`;

    // Upload to Supabase Storage (upsert: true — re-generating replaces old)
    const { error: uploadError } = await supabaseAdmin()
      .storage
      .from(BUCKET)
      .upload(storagePath, pdfBuffer, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      return NextResponse.json(
        { error: `Storage upload failed for FG ${fg.label}: ${uploadError.message}` },
        { status: 500 }
      );
    }

    // Insert job_files row
    const fileId = uid();
    await sql`
      INSERT INTO job_files (id, job_id, kind, filename, storage_path, size, uploaded_at)
      VALUES (
        ${fileId}, ${jobId}, ${"00_drawings"}, ${filename},
        ${storagePath}, ${pdfBuffer.length}, ${new Date().toISOString()}
      )
      ON CONFLICT DO NOTHING
    `;

    results.push({ fg_label: fg.label, filename, storage_path: storagePath });
  }

  return NextResponse.json({ ok: true, files: results });
}
