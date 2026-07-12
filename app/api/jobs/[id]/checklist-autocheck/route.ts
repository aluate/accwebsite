export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getBuilder } from "@/lib/auth";

/**
 * GET /api/jobs/[id]/checklist-autocheck
 *
 * Evaluates ~25 engineering release checklist items against live spec data.
 * Returns { autoChecked: Record<string, boolean>, reasons: Record<string, string> }
 *
 * Items are only set TRUE here — never forced FALSE (user manual checks are never overridden).
 * The panel merges: final = { ...autoChecked, ...manualChecklist }
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getBuilder();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Resolve internal job id
  const [job] = await sql<{ id: string; delivery_date: string | null; job_number: string | null }[]>`
    SELECT id, delivery_date, job_number FROM jobs WHERE id = ${id} OR job_number = ${id}
  `;
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const jid = job.id;

  // ── Load spec data ──────────────────────────────────────────────────────
  const [fgs, ebRows, hwRows, roomRows, specRows, drawingFiles] = await Promise.all([
    // Finish groups
    sql`
      SELECT fg.id, fg.finish_type, fg.color_name, fg.color_id, fg.carcass_id,
             fg.drawer_box_id, fg.grain_orientation, fg.species
      FROM finish_groups fg
      JOIN residential_specs rs ON rs.id = fg.spec_id
      WHERE rs.job_id = ${jid}
    `.catch(() => []),

    // Edgeband rows (all finish groups for this job)
    sql`
      SELECT fge.finish_group_id, fge.letter_code, fge.edgeband_id
      FROM finish_group_edgebands fge
      JOIN finish_groups fg ON fg.id = fge.finish_group_id
      JOIN residential_specs rs ON rs.id = fg.spec_id
      WHERE rs.job_id = ${jid}
    `.catch(() => []),

    // Spec hardware
    sql`
      SELECT sh.type, sh.part_no
      FROM spec_hardware sh
      JOIN residential_specs rs ON rs.id = sh.spec_id
      WHERE rs.job_id = ${jid}
    `.catch(() => []),

    // Rooms
    sql`
      SELECT r.id
      FROM rooms r
      JOIN residential_specs rs ON rs.id = r.spec_id
      WHERE rs.job_id = ${jid}
    `.catch(() => []),

    // Specs exist
    sql`SELECT id FROM residential_specs WHERE job_id = ${jid} LIMIT 1`.catch(() => []),

    // Engineering drawings uploaded
    sql`SELECT id FROM job_files WHERE job_id = ${jid} AND kind = '16_eng_drawings' LIMIT 1`.catch(() => []),
  ]);

  const auto: Record<string, boolean> = {};
  const reasons: Record<string, string> = {};

  function set(key: string, value: boolean, reason: string) {
    if (value) { auto[key] = true; reasons[key] = reason; }
  }

  const hasFGs    = fgs.length > 0;
  const hasSpec   = specRows.length > 0;
  const fgList    = fgs as Record<string, unknown>[];
  const ebList    = ebRows as Record<string, unknown>[];
  const hwList    = hwRows as Record<string, unknown>[];

  // ── Spec exists at all ─────────────────────────────────────────────────
  // rooms_listed
  set("rooms_listed", roomRows.length > 0, `${roomRows.length} room(s) on spec`);

  if (hasFGs) {
    // interior_material — all FGs have carcass_id
    const allHaveCarcass = fgList.every(fg => fg.carcass_id);
    set("interior_material", allHaveCarcass, "All finish groups have carcass material selected");

    // exterior_material — all FGs have finish_type + color
    const allHaveColor = fgList.every(fg => fg.finish_type && (fg.color_name || fg.color_id));
    set("exterior_material", allHaveColor, "All finish groups have finish type + color selected");

    // stain_paint / finish_spec — same condition
    set("stain_paint",  allHaveColor, "All finish groups have finish type + color selected");
    set("finish_spec",  allHaveColor, "All finish groups have finish type + color selected");

    // drawer_style_material — all FGs have drawer_box_id
    const allHaveDrawer = fgList.every(fg => fg.drawer_box_id);
    set("drawer_style_material", allHaveDrawer, "All finish groups have drawer box selected");

    // slab_grain — all paint/stain FGs have grain_orientation
    const woodFGs = fgList.filter(fg => fg.finish_type === "paint" || fg.finish_type === "stain");
    const allHaveGrain = woodFGs.length === 0 || woodFGs.every(fg => fg.grain_orientation);
    set("slab_grain", allHaveGrain, woodFGs.length === 0
      ? "No paint/stain finish groups"
      : "All paint/stain finish groups have grain orientation"
    );

    // Edgeband checks
    if (ebList.length > 0) {
      const fgIds = new Set(fgList.map(fg => fg.id as string));
      function ebFilled(codes: string[]): boolean {
        // Every FG must have at least one filled edgeband row for these letter codes
        return [...fgIds].every(fgId => {
          const fgEbs = ebList.filter(e => e.finish_group_id === fgId && codes.includes(e.letter_code as string));
          return fgEbs.some(e => e.edgeband_id);
        });
      }
      set("interior_banding", ebFilled(["I", "U"]),    "Interior edgebands (I/U) set on all finish groups");
      set("exterior_banding", ebFilled(["D", "E"]),    "Exterior edgebands (D/E) set on all finish groups");
      set("drawer_banding",   ebFilled(["B", "C"]),    "Drawer box edgebands (B/C) set on all finish groups");
      set("cabinet_edge_details", ebFilled(["D", "E"]), "Exterior edgebands set on all finish groups");
    }
  }

  // ── Hardware ───────────────────────────────────────────────────────────
  const hwTypes = new Map<string, string>();
  for (const h of hwList) {
    hwTypes.set((h.type as string).toLowerCase(), (h.part_no as string) ?? "");
  }

  const hasHinges  = hwTypes.has("hinges");
  const hasSlides  = hwTypes.has("drawer slides");
  const hasRollout = hwTypes.has("rollout slides");
  const hasCloset  = hwTypes.has("closet rod");

  set("hinges",        hasHinges,           `Hinges: ${hwTypes.get("hinges") || "specified"}`);
  set("drawer_guides", hasSlides || hasRollout,
      [hasSlides && "Drawer Slides", hasRollout && "Rollout Slides"].filter(Boolean).join(", ") + " specified"
  );
  set("closet_rods",   hasCloset,           "Closet rod row present in hardware");

  // ── Job-level checks ───────────────────────────────────────────────────
  set("ship_date_known",  !!job.delivery_date,   `Delivery date: ${job.delivery_date}`);
  set("drawings_attached", drawingFiles.length > 0, "Engineering drawings uploaded");

  // ── Project setup ──────────────────────────────────────────────────────
  set("snappak_setup", false, ""); // can never be auto-verified
  // field_video: check if a site_photos/field_video file exists
  const videoFiles = await sql`
    SELECT id FROM job_files WHERE job_id = ${jid} AND kind IN ('01_contract', '09_site_photos') LIMIT 1
  `.catch(() => []);
  // We don't have a dedicated field-video kind yet, so leave this manual

  void videoFiles; void hasSpec;

  // ── Job number ─────────────────────────────────────────────────────────
  set("job_number_confirmed", !!job.job_number, `Job number: ${job.job_number}`);

  return NextResponse.json({ autoChecked: auto, reasons });
}
