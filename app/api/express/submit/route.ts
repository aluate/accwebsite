import { NextRequest, NextResponse } from "next/server";
import { sql, nextJobId, uid } from "@/lib/db";
import { getBuilder } from "@/lib/auth";
import { renderOrderPDF } from "@/lib/pdf-order";
import { sendOrderEmail } from "@/lib/mailer";
import { catalogs } from "@/lib/catalogs";
import type { OrderData } from "@/lib/pdf-order";

export const runtime = 'nodejs';

// POST /api/express/submit
export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const builder = await getBuilder();
  if (!builder) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  const body = await req.json();
  const {
    client_name,
    site_address,
    city,
    delivery_date,
    project_notes,
    include_cabinets,
    include_trim,
    include_doors,
    finish_groups,
    rooms,
    trim,
    door_items,
  } = body;

  if (!client_name || !site_address) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { id: job_id } = await nextJobId();

  // ── Create job ────────────────────────────────────────────────────────────
  await sql`
    INSERT INTO jobs (
      id, seq, created_at, status, job_type,
      client_name, site_address, city, delivery_date, notes,
      builder_id, builder_name, builder_company, builder_email,
      mod_residential, mod_trim, mod_doors
    ) VALUES (
      ${job_id}, (SELECT val FROM seq WHERE id = 1),
      ${now}, 'intake', 'residential',
      ${client_name}, ${site_address ?? ""}, ${city ?? ""},
      ${delivery_date ?? ""}, ${project_notes ?? ""},
      ${builder.id}, ${builder.name}, ${builder.company ?? null}, ${null},
      ${include_cabinets ?? false},
      ${include_trim ?? false},
      ${include_doors ?? false}
    )
  `;

  // ── Cabinets ───────────────────────────────────────────────────────────────
  if (include_cabinets && rooms?.length) {
    const spec_id = uid();
    await sql`
      INSERT INTO residential_specs (id, job_id, name, status, created_at, updated_at)
      VALUES (${spec_id}, ${job_id}, 'Express Order', 'draft', ${now}, ${now})
    `;

    const fgIdMap: Record<string, string> = {};
    for (const fg of (finish_groups ?? [])) {
      const db_fg_id = uid();
      fgIdMap[fg.id] = db_fg_id;
      await sql`
        INSERT INTO finish_groups (
          id, spec_id, label, finish_type, color_id, color_name,
          door_style_id, box_material, sort_order
        ) VALUES (
          ${db_fg_id}, ${spec_id},
          ${fg.label ?? "Group"},
          ${fg.finish_type ?? "paint"},
          ${fg.color_id ?? null},
          ${fg.color_name ?? null},
          ${fg.door_style_id ?? null},
          ${fg.box_material ?? "melamine"},
          ${0}
        )
      `;
    }

    for (let ri = 0; ri < rooms.length; ri++) {
      const room = rooms[ri];
      const room_id = uid();
      const mapped_fg = fgIdMap[room.finish_group_id] ?? null;
      await sql`
        INSERT INTO rooms (id, spec_id, name, finish_group_id, sort_order)
        VALUES (${room_id}, ${spec_id}, ${room.name ?? "Room"}, ${mapped_fg}, ${ri})
      `;

      for (let ci = 0; ci < (room.cabinets ?? []).length; ci++) {
        const cab = room.cabinets[ci];
        await sql`
          INSERT INTO cabinet_line_items (
            id, room_id, spec_id, family_code,
            width_in, height_in, depth_in, qty,
            hinge_side, rollout_trays_qty, trash_kit,
            applied_panels, special_instructions, sort_order
          ) VALUES (
            ${uid()}, ${room_id}, ${spec_id},
            ${cab.family_code ?? ""},
            ${cab.width_in ?? null},
            ${cab.height_in ?? null},
            ${cab.depth_in ?? null},
            ${cab.qty ?? 1},
            ${cab.hinge_side ?? null},
            ${cab.rollout_trays_qty ?? 0},
            ${cab.trash_kit ?? "None"},
            ${cab.applied_panels ?? false},
            ${cab.special_instructions ?? null},
            ${ci}
          )
        `;
      }
    }
  }

  // ── Trim spec ─────────────────────────────────────────────────────────────
  if (include_trim && trim) {
    const trim_id = uid();
    await sql`
      INSERT INTO trim_specs (
        id, job_id, name, status,
        door_height, trim_style, spec_level,
        drywall_int_jambs, full_drywall_wrap,
        base_lf, crown_lf, shoe_lf, chair_rail_lf,
        stair_nosing_lf, wainscoting_cap_lf,
        case_openings, window_openings, pocket_doors,
        barn_or_wrapped, sliders,
        created_at, updated_at
      ) VALUES (
        ${trim_id}, ${job_id}, 'Express Order', 'draft',
        ${trim.door_height ?? "7/0"},
        ${trim.trim_style ?? "craftsman"},
        ${trim.spec_level ?? "standard"},
        ${trim.drywall_int_jambs ?? false},
        ${trim.full_drywall_wrap ?? false},
        ${trim.base_lf ?? 0},
        ${trim.crown_lf ?? 0},
        ${trim.shoe_lf ?? 0},
        ${trim.chair_rail_lf ?? 0},
        ${trim.stair_nosing_lf ?? 0},
        ${trim.wainscoting_cap_lf ?? 0},
        ${trim.case_openings ?? 0},
        ${trim.window_openings ?? 0},
        ${trim.pocket_doors ?? 0},
        ${trim.barn_or_wrapped ?? 0},
        ${trim.sliders ?? 0},
        ${now}, ${now}
      )
    `;
  }

  // ── Door spec + line items ─────────────────────────────────────────────────
  if (include_doors && door_items?.length) {
    const door_spec_id = uid();
    await sql`
      INSERT INTO door_specs (id, job_id, name, status, created_at, updated_at)
      VALUES (${door_spec_id}, ${job_id}, 'Express Order', 'draft', ${now}, ${now})
    `;

    for (let i = 0; i < door_items.length; i++) {
      const it = door_items[i];
      await sql`
        INSERT INTO door_line_items (
          id, spec_id, door_type, size_nom, core, species,
          swing, hardware, bore, hinge_prep,
          qty, unit_price, price_override, sort_order
        ) VALUES (
          ${uid()}, ${door_spec_id},
          ${it.door_type ?? "interior_slab"},
          ${it.size_nom ?? "2/6x6/8"},
          ${it.core ?? "hollow"},
          ${it.species ?? "paint_grade"},
          ${it.swing ?? "none"},
          ${it.hardware ?? "none"},
          ${Number(it.bore ?? 1)},
          ${Number(it.hinge_prep ?? 1)},
          ${it.qty ?? 1},
          ${it.unit_price ?? 0},
          ${it.price_override ?? false},
          ${i}
        )
      `;
    }
  }

  // ── Build family_code → display_name lookup ───────────────────────────────
  const familyMap = Object.fromEntries(
    catalogs.cabinetFamilies().map((f) => [f.family_code, f.display_name])
  );

  // ── PDF ───────────────────────────────────────────────────────────────────
  const orderData: OrderData = {
    job_id,
    submitted_at: now,
    builder_name: builder.name,
    builder_company: builder.company ?? null,
    builder_email: null,
    client_name,
    site_address: site_address ?? "",
    city: city ?? "",
    delivery_date: delivery_date ?? "",
    project_notes: project_notes ?? "",
    include_cabinets: !!include_cabinets,
    include_trim: !!include_trim,
    include_doors: !!include_doors,
    finish_groups: (finish_groups ?? []).map((fg: {
      id: string; label: string; finish_type: string;
      color_name: string; door_style_id: string; box_material: string;
    }) => ({
      id: fg.id,
      label: fg.label,
      finish_type: fg.finish_type,
      color_name: fg.color_name,
      door_style_id: fg.door_style_id,
      box_material: fg.box_material,
    })),
    rooms: (rooms ?? []).map((rm: {
      name: string; finish_group_id: string;
      cabinets: Array<{
        family_code: string; width_in: number | null; height_in: number | null;
        depth_in: number | null; qty: number; hinge_side: string;
        rollout_trays_qty: number; trash_kit: string; applied_panels: boolean;
        special_instructions: string;
      }>;
    }) => ({
      name: rm.name,
      finish_group_id: rm.finish_group_id,
      cabinets: (rm.cabinets ?? []).map((c) => ({
        family_code: c.family_code ?? "",
        display_name: familyMap[c.family_code ?? ""] ?? c.family_code ?? "",
        width_in: c.width_in ?? null,
        height_in: c.height_in ?? null,
        depth_in: c.depth_in ?? null,
        qty: c.qty ?? 1,
        hinge_side: c.hinge_side ?? "",
        rollout_trays_qty: c.rollout_trays_qty ?? 0,
        trash_kit: c.trash_kit ?? "None",
        applied_panels: !!c.applied_panels,
        special_instructions: c.special_instructions ?? "",
      })),
    })),
    trim: include_trim && trim ? trim : null,
    door_items: include_doors ? (door_items ?? []) : [],
  };

  // ── Render PDF to buffer (no local disk write) ────────────────────────────
  let pdfBuffer: Buffer | undefined;
  try {
    pdfBuffer = await renderOrderPDF(orderData);
  } catch (err) {
    console.error("[express/submit] PDF generation failed:", err);
  }

  // ── Email with PDF buffer attached ────────────────────────────────────────
  try {
    await sendOrderEmail({
      jobId: job_id,
      builderName: builder.name,
      builderCompany: builder.company ?? null,
      clientName: client_name,
      pdfBuffer,
    });
  } catch (err) {
    console.error("[express/submit] Email failed:", err);
    // Don't fail the whole request — order is already saved in DB
  }

  return NextResponse.json({ job_id });
}
