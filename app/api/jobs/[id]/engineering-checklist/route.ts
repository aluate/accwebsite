import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getBuilder } from "@/lib/auth";

export const runtime = "nodejs";

type FGRow = {
  carcass_id: string | null;
  drawer_box_id: string | null;
  finish_type: string;
  color_id: string | null;
  edgeband_id: string | null;
  pull_id: string | null;
};
type HWRow = { role: string };
type JobRow = { delivery_date: string | null };

async function computeAutoChecked(jobId: string): Promise<Record<string, boolean>> {
  const auto: Record<string, boolean> = {};

  // Find the job's primary residential spec
  const specRows = await sql<{ id: string }[]>`
    SELECT id FROM residential_specs WHERE job_id = ${jobId} ORDER BY created_at ASC LIMIT 1
  `;
  const specId = specRows[0]?.id;

  // Job-level data (ship date)
  const jobRows = await sql<JobRow[]>`SELECT delivery_date FROM jobs WHERE id = ${jobId}`;
  const job = jobRows[0];
  auto.ship_date_known = !!(job?.delivery_date);

  if (!specId) return auto;

  const [fgs, rooms, hwRows] = await Promise.all([
    sql<FGRow[]>`
      SELECT carcass_id, drawer_box_id, finish_type, color_id, edgeband_id, pull_id
      FROM finish_groups WHERE spec_id = ${specId}
    `,
    sql<{ id: string }[]>`SELECT id FROM rooms WHERE spec_id = ${specId}`,
    sql<HWRow[]>`
      SELECT fh.role FROM finish_group_hardware fh
      JOIN finish_groups g ON g.id = fh.finish_group_id
      WHERE g.spec_id = ${specId} AND fh.hardware_id IS NOT NULL
    `,
  ]);

  // ── Scope ──────────────────────────────────────────────────────────────
  auto.rooms_listed = rooms.length > 0;

  // ── Materials ──────────────────────────────────────────────────────────
  // carcass_id drives both interior and exterior material
  const allHaveCarcass = fgs.length > 0 && fgs.every((g) => !!g.carcass_id);
  auto.interior_material = allHaveCarcass;
  auto.exterior_material = allHaveCarcass;

  // ── Drawer box ─────────────────────────────────────────────────────────
  auto.drawer_style_material = fgs.length > 0 && fgs.every((g) => !!g.drawer_box_id);

  // ── Finish ─────────────────────────────────────────────────────────────
  // Paint/stain FGs must have a color selected; melamine FGs pass automatically
  const paintStainFGs = fgs.filter((g) => g.finish_type === "paint" || g.finish_type === "stain");
  auto.stain_paint = paintStainFGs.length === 0 || paintStainFGs.every((g) => !!g.color_id);

  // ── Edgebanding ────────────────────────────────────────────────────────
  const hasEdgebands = fgs.some((g) => !!g.edgeband_id);
  auto.interior_banding = hasEdgebands;
  auto.exterior_banding = hasEdgebands;
  // Drawer banding: if drawer box is specified, banding for it is expected
  auto.drawer_banding = fgs.length > 0 && fgs.every((g) => !!g.drawer_box_id);

  // ── Pulls ──────────────────────────────────────────────────────────────
  const hasPulls = fgs.some((g) => !!g.pull_id);
  auto.pulls_brand  = hasPulls;
  auto.pulls_size   = hasPulls;
  auto.pulls_finish = hasPulls;

  // ── WO Hardware ────────────────────────────────────────────────────────
  const roles = new Set(hwRows.map((h) => h.role));
  auto.hinges        = roles.has("hinges");
  auto.drawer_guides = roles.has("drawer_slides");
  auto.aventos       = roles.has("aventos");

  return auto;
}

// GET — load saved checklist + auto-checked items derived from spec data
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [[row], autoChecked] = await Promise.all([
    sql<{ checklist: Record<string, boolean> }[]>`
      SELECT checklist FROM engineering_release_checklists WHERE job_id = ${id}
    `,
    computeAutoChecked(id),
  ]);

  return NextResponse.json({
    checklist:   row?.checklist ?? {},
    autoChecked,
  });
}

// POST — save (upsert) checklist state
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getBuilder();
  if (!session || !["admin", "pm", "engineer"].includes(session.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json() as { checklist: Record<string, boolean> };
  if (!body?.checklist || typeof body.checklist !== "object") {
    return NextResponse.json({ error: "Missing checklist" }, { status: 400 });
  }

  const now = new Date().toISOString();
  await sql`
    INSERT INTO engineering_release_checklists (job_id, checklist, updated_at)
    VALUES (${id}, ${JSON.stringify(body.checklist)}::jsonb, ${now})
    ON CONFLICT (job_id) DO UPDATE
      SET checklist  = EXCLUDED.checklist,
          updated_at = EXCLUDED.updated_at
  `;

  return NextResponse.json({ ok: true });
}
