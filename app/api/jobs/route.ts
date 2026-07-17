export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sql, nextJobId } from "@/lib/db";
import { logActivity } from "@/lib/activity-log";
import { syncJobToInnergy } from "@/lib/innergy-sync";
import { requireBuilderApi } from "@/lib/auth";

export async function GET() {
  const session = await requireBuilderApi();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const jobs = await sql`SELECT * FROM jobs ORDER BY seq DESC`;
  return NextResponse.json({ jobs });
}

export async function POST(req: NextRequest) {
  const session = await requireBuilderApi();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const { id } = await nextJobId();
  const now = new Date().toISOString();
  const jobNumber = (body.job_number as string | undefined)?.trim() || null;

  await sql`
    INSERT INTO jobs (
      id, seq, created_at, status, job_type,
      client_name, client_email, client_phone, site_address, city,
      pm, builder_name, builder_email, builder_phone, builder_company,
      delivery_date, notes,
      mod_residential, mod_commercial, mod_trim, mod_doors,
      job_number
    ) VALUES (
      ${id},
      (SELECT val FROM seq WHERE id = 1),
      ${now}, 'intake', ${body.job_type ?? "residential"},
      ${body.client_name ?? ""}, ${body.client_email ?? ""}, ${body.client_phone ?? ""},
      ${body.site_address ?? ""}, ${body.city ?? ""},
      ${body.pm ?? ""}, ${body.builder_name ?? ""}, ${body.builder_email ?? ""},
      ${body.builder_phone ?? ""}, ${body.builder_company ?? ""},
      ${body.delivery_date ?? ""}, ${body.notes ?? ""},
      ${body.mod_residential ? 1 : 0}, ${body.mod_commercial ? 1 : 0},
      ${body.mod_trim ? 1 : 0}, ${body.mod_doors ? 1 : 0},
      ${jobNumber}
    )
  `;

  await logActivity({
    entityType: "job", entityId: id, jobId: id,
    eventType: "created", toState: "intake",
    actor: body.pm || "pm", actorRole: "pm",
    payload: { job_number: jobNumber, client_name: body.client_name, site_address: body.site_address },
  }).catch(() => {});

  // Push to Innergy (fire-and-forget; failure doesn't block job creation)
  syncJobToInnergy({
    id,
    job_number: jobNumber,
    client_name: body.client_name ?? "",
    site_address: body.site_address ?? null,
    city: body.city ?? null,
    state: body.state ?? null,
    zip_code: body.zip_code ?? null,
    job_type: body.job_type ?? "residential",
    pm: body.pm ?? null,
    builder_name: body.builder_name ?? null,
    builder_company: body.builder_company ?? null,
    delivery_date: body.delivery_date ?? null,
    estimated_value: body.estimated_value ? Number(body.estimated_value) : null,
    status: "intake",
    innergy_opportunity_id: null,
  }).then((result) => {
    if (result?.created) {
      // Persist the Innergy IDs back to the DB (best-effort)
      sql`UPDATE jobs SET
        innergy_opportunity_id = ${result.opportunityId},
        innergy_bid_id = ${result.bidId},
        innergy_synced_at = NOW()
      WHERE id = ${id}`.catch(() => {});
    }
  }).catch(() => {});

  return NextResponse.json({ id, job_number: jobNumber }, { status: 201 });
}
