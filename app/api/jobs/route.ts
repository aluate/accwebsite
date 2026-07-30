export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sql, nextJobId } from "@/lib/db";
import { logActivity } from "@/lib/activity-log";
import { syncJobToInnergy } from "@/lib/innergy-sync";
import { requireBuilderApi } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await requireBuilderApi();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const builderId = searchParams.get("builder_id");
  const isPlaceholder = searchParams.get("is_placeholder");
  const statusFilter = searchParams.get("status");

  // Build a filtered query when query params are provided
  if (builderId || isPlaceholder !== null) {
    const phBool = isPlaceholder === "true";
    const statusList = statusFilter === "active"
      ? ["intake","bid","design","field_dims","engineering","procurement","production","delivery","install","punch"]
      : null;

    let jobs;
    if (builderId && statusList) {
      jobs = await sql`
        SELECT id, client_name, builder_id, builder_company, placeholder_unit_count,
               placeholder_per_unit_value, placeholder_per_unit_boxes,
               placeholder_per_unit_shop_hrs, placeholder_per_unit_install_hrs,
               is_placeholder, placeholder_id, status, delivery_date
        FROM jobs
        WHERE builder_id = ${builderId}
          AND is_placeholder = ${phBool}
          AND status = ANY(${statusList})
        ORDER BY seq DESC
      `;
    } else if (builderId) {
      jobs = await sql`
        SELECT id, client_name, builder_id, builder_company, placeholder_unit_count,
               placeholder_per_unit_value, placeholder_per_unit_boxes,
               placeholder_per_unit_shop_hrs, placeholder_per_unit_install_hrs,
               is_placeholder, placeholder_id, status, delivery_date
        FROM jobs
        WHERE builder_id = ${builderId}
          AND is_placeholder = ${phBool}
        ORDER BY seq DESC
      `;
    } else {
      jobs = await sql`
        SELECT id, client_name, builder_id, builder_company, placeholder_unit_count,
               placeholder_per_unit_value, placeholder_per_unit_boxes,
               placeholder_per_unit_shop_hrs, placeholder_per_unit_install_hrs,
               is_placeholder, placeholder_id, status, delivery_date
        FROM jobs
        WHERE is_placeholder = ${phBool}
        ORDER BY seq DESC
      `;
    }
    return NextResponse.json({ jobs });
  }

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

  const isPlaceholder = body.is_placeholder ? true : false;
  const placeholderUnitCount = body.placeholder_unit_count != null ? Number(body.placeholder_unit_count) : 1;
  const placeholderPerUnitValue = body.placeholder_per_unit_value != null ? Number(body.placeholder_per_unit_value) : 0;
  const placeholderPerUnitBoxes = body.placeholder_per_unit_boxes != null ? Number(body.placeholder_per_unit_boxes) : 0;
  const placeholderPerUnitShopHrs = body.placeholder_per_unit_shop_hrs != null ? Number(body.placeholder_per_unit_shop_hrs) : 0;
  const placeholderPerUnitInstallHrs = body.placeholder_per_unit_install_hrs != null ? Number(body.placeholder_per_unit_install_hrs) : 0;
  const placeholderId = body.placeholder_id ?? null;

  await sql`
    INSERT INTO jobs (
      id, seq, created_at, status, job_type,
      client_name, client_email, client_phone, site_address, city,
      pm, builder_id, builder_name, builder_email, builder_phone, builder_company,
      delivery_date, notes,
      mod_residential, mod_commercial, mod_trim, mod_doors,
      job_number,
      estimated_value, pm_complexity,
      notes_install, notes_finishing, notes_shop, notes_client,
      is_placeholder, placeholder_unit_count, placeholder_per_unit_value,
      placeholder_per_unit_boxes, placeholder_per_unit_shop_hrs, placeholder_per_unit_install_hrs,
      placeholder_id
    ) VALUES (
      ${id},
      (SELECT val FROM seq WHERE id = 1),
      ${now}, ${body.status ?? "intake"}, ${body.job_type ?? "residential"},
      ${body.client_name ?? ""}, ${body.client_email ?? ""}, ${body.client_phone ?? ""},
      ${body.site_address ?? ""}, ${body.city ?? ""},
      ${body.pm ?? ""}, ${body.builder_id ?? null}, ${body.builder_name ?? ""}, ${body.builder_email ?? ""},
      ${body.builder_phone ?? ""}, ${body.builder_company ?? ""},
      ${body.delivery_date ?? ""}, ${body.notes ?? ""},
      ${body.mod_residential ? 1 : 0}, ${body.mod_commercial ? 1 : 0},
      ${body.mod_trim ? 1 : 0}, ${body.mod_doors ? 1 : 0},
      ${jobNumber},
      ${body.estimated_value ?? null}, ${body.pm_complexity ?? 0},
      ${body.notes_install ?? ""}, ${body.notes_finishing ?? ""}, ${body.notes_shop ?? ""}, ${body.notes_client ?? ""},
      ${isPlaceholder}, ${placeholderUnitCount}, ${placeholderPerUnitValue},
      ${placeholderPerUnitBoxes}, ${placeholderPerUnitShopHrs}, ${placeholderPerUnitInstallHrs},
      ${placeholderId}
    )
  `;

  await logActivity({
    entityType: "job", entityId: id, jobId: id,
    eventType: "created", toState: body.status ?? "intake",
    actor: body.pm || "pm", actorRole: "pm",
    payload: { job_number: jobNumber, client_name: body.client_name, site_address: body.site_address, is_placeholder: isPlaceholder },
  }).catch(() => {});

  // Skip Innergy sync for placeholders
  if (!isPlaceholder) {
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
        sql`UPDATE jobs SET
          innergy_opportunity_id = ${result.opportunityId},
          innergy_bid_id = ${result.bidId},
          innergy_synced_at = NOW()
        WHERE id = ${id}`.catch(() => {});
      }
    }).catch(() => {});
  }

  return NextResponse.json({ id, job_number: jobNumber }, { status: 201 });
}
