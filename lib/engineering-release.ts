/**
 * lib/engineering-release.ts
 *
 * Encapsulates engineering-release side effects fired when a job transitions
 * to "engineering" status:
 *
 *   1. Auto-populates work_orders from the spec's finish groups (idempotent:
 *      skipped if WOs already exist for this job).
 *   2. Generates per-finish-group cover sheet PDFs.
 *   3. Generates the full spec PDF.
 *   4. Uploads cover sheets to Supabase Storage and records job_files rows.
 *
 * Returns attachments ready to hand to sendEmail().
 */

import { sql, uid } from "@/lib/db";
import { createClient } from "@supabase/supabase-js";
import { renderCoversheetBuffer, type WorkOrderRow } from "@/lib/pdf-coversheet";
import { renderSpecPDFBuffer } from "@/lib/pdf-spec";
import { loadSpecPDFData } from "@/lib/spec-data";

// ── Supabase ─────────────────────────────────────────────────────────────────

const BUCKET = "job-files";

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

type JobArg = {
  job_number?: string | null;
  site_address?: string | null;
  [key: string]: unknown;
};

export type CoversheetResult = {
  fg_label: string;
  buffer: Buffer;
  filename: string;
};

export type EngineeringReleaseResult = {
  wosCreated: number;
  coversheets: CoversheetResult[];
  specPdfBuffer: Buffer;
};

// ── Main export ───────────────────────────────────────────────────────────────

export async function runEngineeringReleaseSideEffects(
  jobId: string,
  specId: string,
  job: JobArg
): Promise<EngineeringReleaseResult> {
  const now = new Date().toISOString();

  // ── 1. Auto-populate WOs from finish groups ───────────────────────────────
  let wosCreated = 0;

  const [woCntRow] = await sql<{ cnt: string }[]>`
    SELECT COUNT(*) AS cnt FROM work_orders WHERE job_id = ${jobId}
  `;
  const existingWoCount = Number(woCntRow?.cnt ?? 0);

  if (existingWoCount === 0) {
    // Load finish groups for this spec
    const fgs = await sql<{
      id: string;
      label: string;
      finish_type: string;
      species: string | null;
      color_name: string | null;
    }[]>`
      SELECT id, label, finish_type, species, color_name
      FROM finish_groups
      WHERE spec_id = ${specId}
      ORDER BY sort_order
    `;

    const fgIds = fgs.map((g) => g.id);

    // Insert a category-1 (Casework) WO per finish group
    for (let i = 0; i < fgs.length; i++) {
      const fg = fgs[i];
      const descParts = [fg.label, fg.finish_type];
      if (fg.species) descParts.push(fg.species);
      if (fg.color_name) descParts.push(fg.color_name);
      const description = descParts.join(" — ").replace(/ — — /g, " — ");

      const woId = uid();
      await sql`
        INSERT INTO work_orders
          (id, job_id, wo_number, category_code, description, finish_group_id, status, sort_order, created_at)
        VALUES
          (${woId}, ${jobId}, ${null}, ${1}, ${description}, ${fg.id}, ${"pending"}, ${i}, ${now})
        ON CONFLICT (id) DO NOTHING
      `;
      wosCreated++;
    }

    // Check for countertops across all FGs
    if (fgIds.length > 0) {
      const [ctRow] = await sql<{ cnt: string }[]>`
        SELECT COUNT(*) AS cnt
        FROM finish_group_countertops
        WHERE finish_group_id = ANY(${fgIds})
      `;
      if (Number(ctRow?.cnt ?? 0) > 0) {
        const ctId = uid();
        await sql`
          INSERT INTO work_orders
            (id, job_id, wo_number, category_code, description, finish_group_id, status, sort_order, created_at)
          VALUES
            (${ctId}, ${jobId}, ${null}, ${2}, ${"Countertops"}, ${null}, ${"pending"}, ${fgs.length}, ${now})
          ON CONFLICT (id) DO NOTHING
        `;
        wosCreated++;
      }

      // Check for moldings across all FGs
      const [mldRow] = await sql<{ cnt: string }[]>`
        SELECT COUNT(*) AS cnt
        FROM finish_moldings
        WHERE finish_group_id = ANY(${fgIds})
      `;
      if (Number(mldRow?.cnt ?? 0) > 0) {
        const mldId = uid();
        await sql`
          INSERT INTO work_orders
            (id, job_id, wo_number, category_code, description, finish_group_id, status, sort_order, created_at)
          VALUES
            (${mldId}, ${jobId}, ${null}, ${3}, ${"Moldings / Trim"}, ${null}, ${"pending"}, ${fgs.length + 1}, ${now})
          ON CONFLICT (id) DO NOTHING
        `;
        wosCreated++;
      }
    }
  }

  // ── 2. Load spec data (shared by coversheet + spec PDF generation) ─────────
  const specData = await loadSpecPDFData(specId);

  // ── 3. Load WOs now (after possible inserts above) ─────────────────────────
  const allWos = await sql<WorkOrderRow[]>`
    SELECT id, wo_number, category_code, description, status, notes, finish_group_id
    FROM work_orders
    WHERE job_id = ${jobId}
    ORDER BY category_code, sort_order
  `;

  // ── 4. Generate cover sheet PDFs per finish group ─────────────────────────
  const supabase = supabaseAdmin();
  const coversheets: CoversheetResult[] = [];

  for (let i = 0; i < specData.finish_groups.length; i++) {
    const fg = specData.finish_groups[i];

    // Filter WOs that belong to this finish group
    const fgWOs = allWos.filter((wo) => wo.finish_group_id === fg.id);

    // Build rooms array compatible with renderCoversheetBuffer signature
    const rooms = specData.rooms.map((r) => ({
      id: r.id,
      name: r.name,
      notes: r.notes,
      finishes: r.finishes,
    }));

    const coversheetJob = {
      job_number: job.job_number ?? null,
      site_address: (job.site_address as string | null) ?? "",
    };
    const buffer = await renderCoversheetBuffer(coversheetJob, fg, fgWOs, i, rooms);

    const jobNumPadded = String(job.job_number ?? "").padStart(5, "0");
    const filename = `${jobNumPadded} STN - ${fg.label} Coversheet.pdf`;

    // Upload to Supabase Storage
    const storagePath = `jobs/${jobId}/05_drawings/${Date.now()}-${filename.replace(/[^A-Za-z0-9._-]+/g, "_")}`;
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, buffer, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      console.error("[eng-release] Cover sheet upload failed:", fg.label, uploadError);
    } else {
      // Record job_files row
      const fileId = uid();
      await sql`
        INSERT INTO job_files
          (id, job_id, kind, filename, storage_path, size, uploaded_at, uploaded_by)
        VALUES
          (${fileId}, ${jobId}, ${"05_drawings"}, ${filename}, ${storagePath},
           ${buffer.length}, ${now}, ${"system"})
        ON CONFLICT (id) DO NOTHING
      `;
    }

    coversheets.push({ fg_label: fg.label, buffer, filename });
  }

  // ── 5. Generate spec PDF ───────────────────────────────────────────────────
  const specPdfBuffer = await renderSpecPDFBuffer(specData);

  return { wosCreated, coversheets, specPdfBuffer };
}
