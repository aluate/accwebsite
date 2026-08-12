export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/auth";
import { sql, uid } from "@/lib/db";
import { seedAccStandards } from "@/lib/acc-standards-seed";
import { propagateTrimDefaults } from "@/lib/trim-propagate";
import { isDoorFrontRole, ROLE_BASE } from "@/lib/door-front-roles";

// -- Payload types

type FinishGroupPayload = {
  id: string;
  label: string;
  finish_type: "paint" | "stain" | "melamine";
  color_id: string;
  color_name: string;
  door_style_id: string;
  pull_id: string;
  box_material: string;
  carcass_id: string;
  drawer_box_id: string;
  edgeband_id: string;
  applied_panels: "slab" | "match_door" | null;
  species: string | null;
  rollout_box_id: string | null;
  notes: string;
  sort_order: number;
  box_count: number | null;
  wo_count: number | null;
  wo_number: string | null;
  ct_material: string | null;
  ct_style: string | null;
  ct_edge: string | null;
  ct_splash: string | null;
  grain_orientation: string | null;
};

type AccessoryPayload = { acc_id: string; qty: number; custom_note?: string; custom_type?: string; size?: string; handed?: string };

type CabinetPayload = {
  id: string;
  family_code: string;
  width_in: number | null;
  height_in: number | null;
  depth_in: number | null;
  qty: number;
  hinge_side: string;
  rollout_trays_qty: number;
  trash_kit: string;
  applied_panels: boolean;
  special_instructions: string;
  sort_order: number;
};

type RoomFinishLink = {
  finish_group_id: string;
  zone: string | null;
  sort_order: number;
};

type RoomPayload = {
  id: string;
  name: string;
  finish_group_id: string;
  finishes: RoomFinishLink[];
  notes: string;
  sort_order: number;
  accessories: AccessoryPayload[];
  cabinets: CabinetPayload[];
};

type MoldingPayload = {
  id: string;
  finish_group_id: string;
  molding_type: string;
  molding_profile_id: string | null;
  qty_lf: number | null;
  size_in: number | null;
  material_id: string | null;
  material_other: string | null;
  notes: string;
  where_used_room_ids: string[];
  sort_order: number;
};

type MaterialPayload = {
  id: string;
  finish_group_id: string;
  role: string;
  material_id: string;
  where_used: string;
  notes: string;
};

/**
 * One door / drawer-front / applied-end callout row. The UI owns exactly these three
 * fields; every other column on finish_group_door_fronts is left untouched, which is
 * why these are upserted by id rather than the table being rebuilt.
 */
type DoorFrontPayload = {
  id: string;
  finish_group_id: string;
  role: string;
  slot_label: string | null;
  style_id: string | null;
  /** Cab Door Custom options for THIS row — edge detail, inside profile, panel. */
  oe_id: string | null;
  ie_id: string | null;
  panel_id: string | null;
};

type SavePayload = {
  finish_groups: FinishGroupPayload[];
  rooms: RoomPayload[];
  moldings?: MoldingPayload[];
  materials?: MaterialPayload[];
  /** Callout rows beyond the base door. Omit the key entirely to leave existing
   *  rows alone — same contract as `moldings`. */
  door_fronts?: DoorFrontPayload[];
  /** Ids the user removed. Explicit, because "absent from the payload" would wipe
   *  every row on any request that happened to send a short list. */
  door_fronts_deleted?: string[];
  /** Save an incomplete spec on purpose. Completeness warnings are returned
   *  in the response instead of rejecting the write. Integrity errors still
   *  block. PDF generation remains gated -- see lib/spec-completeness.ts. */
  draft?: boolean;
};

// -- Validation

type Violation = { path: string; message: string; severity: "error" | "warning" };

// "error"   -> would break referential integrity or violate a NOT NULL/UNIQUE
//              constraint. Always blocks the save.
// "warning" -> the spec is incomplete. Blocks a normal save, but a draft save
//              (draft: true) is allowed through so work is never lost. These
//              same fields block PDF generation server-side -- see
//              lib/spec-completeness.ts. That is where the $70k guard lives now.

function validate(payload: SavePayload): Violation[] {
  const v: Violation[] = [];
  const fgIds = new Set(payload.finish_groups.map((g) => g.id));
  const roomIds = new Set(payload.rooms.map((r) => r.id));

  for (const g of payload.finish_groups) {
    const tag = `finish_groups[${g.label || g.id}]`;
    if (!g.label?.trim())  v.push({ path: tag, message: "label is required", severity: "warning" });
    if (!g.finish_type)    v.push({ path: tag, message: "finish_type is required", severity: "warning" });
    if (!g.carcass_id)     v.push({ path: tag, message: "carcass material is required (the $70k field)", severity: "warning" });
    if (!g.drawer_box_id)  v.push({ path: tag, message: "drawer box is required (the $70k field)", severity: "warning" });
    if ((g.finish_type === "paint" || g.finish_type === "stain") && !g.edgeband_id) {
      v.push({ path: tag, message: "edgeband selection is required for paint/stain finishes", severity: "warning" });
    }
  }

  for (const r of payload.rooms) {
    const tag = `rooms[${r.name || r.id}]`;
    if (!r.name?.trim()) v.push({ path: tag, message: "room name is required", severity: "warning" });

    const hasMulti = (r.finishes ?? []).some((f) => f.finish_group_id);
    const hasLegacy = !!r.finish_group_id;
    if (!hasMulti && !hasLegacy) {
      v.push({ path: tag, message: "at least one finish must be assigned to this room", severity: "warning" });
    }

    for (const f of r.finishes ?? []) {
      if (f.finish_group_id && !fgIds.has(f.finish_group_id)) {
        v.push({ path: tag, message: `finish reference ${f.finish_group_id} not found in finish_groups`, severity: "error" });
      }
    }
    if (r.finish_group_id && !fgIds.has(r.finish_group_id)) {
      v.push({ path: tag, message: `legacy finish_group_id ${r.finish_group_id} not found in finish_groups`, severity: "error" });
    }

    for (const c of r.cabinets ?? []) {
      if (!c.family_code) v.push({ path: `${tag}.cabinet`, message: "cabinet family is required for every cabinet line item", severity: "warning" });
    }
  }

  for (const m of payload.moldings ?? []) {
    const tag = `moldings[${m.id}]`;
    if (!m.molding_type)    v.push({ path: tag, message: "molding_type is required", severity: "warning" });
    if (!m.finish_group_id) v.push({ path: tag, message: "finish_group_id is required", severity: "error" });
    if (m.finish_group_id && !fgIds.has(m.finish_group_id))
      v.push({ path: tag, message: `finish_group_id ${m.finish_group_id} not in finish_groups`, severity: "error" });
    for (const rid of m.where_used_room_ids ?? []) {
      if (!roomIds.has(rid)) v.push({ path: tag, message: `where_used room ${rid} not in rooms`, severity: "error" });
    }
  }

  // cab_ext removed: carcass material dropdown is the cab_ext selection.
  const VALID_MATERIAL_ROLES = new Set(["cab_int", "cab_ext2", "cab_int2"]);
  for (const m of payload.materials ?? []) {
    const tag = `materials[${m.id || `${m.finish_group_id}/${m.role}`}]`;
    if (!m.finish_group_id) v.push({ path: tag, message: "finish_group_id is required", severity: "error" });
    if (m.finish_group_id && !fgIds.has(m.finish_group_id))
      v.push({ path: tag, message: `finish_group_id ${m.finish_group_id} not in finish_groups`, severity: "error" });
    if (!m.role) v.push({ path: tag, message: "role is required", severity: "error" });
    if (m.role && !VALID_MATERIAL_ROLES.has(m.role))
      v.push({ path: tag, message: `role '${m.role}' not in {cab_int, cab_ext2, cab_int2}`, severity: "error" });
  }

  return v;
}

// -- Save handler

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardApi(["admin", "pm"]);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { id } = await params;
  const body = (await req.json()) as SavePayload;
  const clientSentMoldings = 'moldings' in body;
  // Same contract as moldings: an absent key means "this client has no UI for these",
  // so existing rows are preserved rather than silently wiped.
  const clientSentDoorFronts = 'door_fronts' in body;
  const { finish_groups, rooms, moldings = [], materials = [] } = body;

  const violations = validate(body);
  const blocking = violations.filter((x) => x.severity === "error");
  const warnings = violations.filter((x) => x.severity === "warning");
  const isDraft = body.draft === true;

  // Integrity errors always block. Completeness warnings block a normal save but
  // are allowed through on a draft, so a half-entered spec is never lost. The
  // spec still cannot produce a PDF until the warnings clear -- that check runs
  // server-side in app/api/specs/[id]/generate/route.ts.
  if (blocking.length > 0 || (!isDraft && warnings.length > 0)) {
    return NextResponse.json(
      { ok: false, error: "validation failed", violations: isDraft ? blocking : violations },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();

  // NOTE: We intentionally do NOT use sql.begin() here.
  // sql.begin() holds a single PgBouncer connection open for the entire
  // multi-statement sequence. On Vercel+Supabase, if the Lambda is killed
  // mid-transaction the connection is orphaned and blocks subsequent requests
  // for minutes. Using individual autocommit statements avoids that -- each
  // query gets and releases a connection immediately.
  //
  // Trade-off: not atomic. If the Lambda dies between DELETE and INSERT the
  // spec will be empty. The user can re-save from the UI -- acceptable.
  try {
    // Clear child tables in FK-safe order (each statement = its own mini-tx)
    // Only delete/re-insert moldings if the client explicitly sent a moldings array.
    // When the moldings UI tab is absent, the client omits the key so existing DB
    // moldings are preserved (prevents silent wipe of data that has no UI entry point).
    if (clientSentMoldings) {
      await sql`
        DELETE FROM finish_molding_rooms
        WHERE molding_id IN (
          SELECT id FROM finish_moldings
          WHERE finish_group_id IN (
            SELECT id FROM finish_groups WHERE spec_id = ${id}
          )
        )
      `;
      await sql`
        DELETE FROM finish_moldings
        WHERE finish_group_id IN (
          SELECT id FROM finish_groups WHERE spec_id = ${id}
        )
      `;
    }
    await sql`
      DELETE FROM finish_group_materials
      WHERE finish_group_id IN (
        SELECT id FROM finish_groups WHERE spec_id = ${id}
      )
    `;
    await sql`
      DELETE FROM room_finishes
      WHERE room_id IN (SELECT id FROM rooms WHERE spec_id = ${id})
    `;
    await sql`DELETE FROM cabinet_line_items WHERE spec_id = ${id}`;
    await sql`DELETE FROM room_accessories WHERE room_id IN (SELECT id FROM rooms WHERE spec_id = ${id})`;
    // DO NOT delete rooms / finish_groups wholesale.
    //
    // Ten tables cascade off these two, and six of them are never re-inserted by
    // this route, so a plain "DELETE then re-INSERT" silently destroyed real data
    // on EVERY save of ANY spec:
    //
    //   finish_group_countertops    CASCADE  - never re-inserted
    //   finish_group_pulls          CASCADE  - never re-inserted (has its own API)
    //   finish_group_trim_defaults  CASCADE  - never re-inserted (has its own API)
    //   room_trim                   CASCADE  - never re-inserted, not even in RoomPayload
    //   spec_appliances.room_id     SET NULL - appliances lost their room
    //   punch_list_items.room_id    SET NULL - punch items lost their room
    //
    // It also explains why finish_group_hardware was empty: the cascade wiped the
    // hinge rows and only door_pulls / drawer_pulls were ever re-seeded.
    //
    // Instead: remove only the rows the user actually deleted, and UPSERT the rest.
    // Rows that survive keep their id, so nothing cascades.
    const keepFgIds   = finish_groups.map((g) => g.id).filter(Boolean);
    const keepRoomIds = rooms.map((r) => r.id).filter(Boolean);

    if (keepRoomIds.length > 0) {
      await sql`DELETE FROM rooms WHERE spec_id = ${id} AND id NOT IN ${sql(keepRoomIds)}`;
    } else {
      await sql`DELETE FROM rooms WHERE spec_id = ${id}`;
    }
    if (keepFgIds.length > 0) {
      await sql`DELETE FROM finish_groups WHERE spec_id = ${id} AND id NOT IN ${sql(keepFgIds)}`;
    } else {
      await sql`DELETE FROM finish_groups WHERE spec_id = ${id}`;
    }

    // Insert finish groups
    for (const g of finish_groups) {
      await sql`
        INSERT INTO finish_groups
          (id, spec_id, label, finish_type, color_id, color_name,
           door_style_id, drawer_style_id, pull_id, box_material, carcass_id, drawer_box_id, edgeband_id,
           applied_panels, species, rollout_box_id,
           cabdoor_edge_id, cabdoor_profile_id, cabdoor_panel_id,
           notes, sort_order, box_count, wo_count, wo_number,
           ct_material, ct_style, ct_edge, ct_splash, grain_orientation)
        VALUES
          (${g.id}, ${id}, ${g.label}, ${g.finish_type || "paint"},
           ${g.color_id || null}, ${g.color_name || null},
           ${g.door_style_id || null},
           ${(g as Record<string, unknown>).drawer_style_id as string || null},
           ${g.pull_id || null},
           ${g.box_material || "melamine"},
           ${g.carcass_id || null}, ${g.drawer_box_id || null}, ${g.edgeband_id || null},
           ${g.applied_panels || "slab"}, ${g.species || null}, ${g.rollout_box_id || null},
           ${(g as Record<string, unknown>).cabdoor_edge_id as string || null},
           ${(g as Record<string, unknown>).cabdoor_profile_id as string || null},
           ${(g as Record<string, unknown>).cabdoor_panel_id as string || null},
           ${g.notes || null}, ${g.sort_order ?? 0},
           ${g.box_count ?? null}, ${g.wo_count ?? null},
           ${g.wo_number ?? null},
           ${g.ct_material ?? null}, ${g.ct_style ?? null}, ${g.ct_edge ?? null}, ${g.ct_splash ?? null},
           ${(g as Record<string, unknown>).grain_orientation as string ?? null})
        ON CONFLICT (id) DO UPDATE SET
          label              = EXCLUDED.label,
          finish_type        = EXCLUDED.finish_type,
          color_id           = EXCLUDED.color_id,
          color_name         = EXCLUDED.color_name,
          door_style_id      = EXCLUDED.door_style_id,
          drawer_style_id    = EXCLUDED.drawer_style_id,
          pull_id            = EXCLUDED.pull_id,
          box_material       = EXCLUDED.box_material,
          carcass_id         = EXCLUDED.carcass_id,
          drawer_box_id      = EXCLUDED.drawer_box_id,
          edgeband_id        = EXCLUDED.edgeband_id,
          applied_panels     = EXCLUDED.applied_panels,
          species            = EXCLUDED.species,
          rollout_box_id     = EXCLUDED.rollout_box_id,
          cabdoor_edge_id    = EXCLUDED.cabdoor_edge_id,
          cabdoor_profile_id = EXCLUDED.cabdoor_profile_id,
          cabdoor_panel_id   = EXCLUDED.cabdoor_panel_id,
          notes              = EXCLUDED.notes,
          sort_order         = EXCLUDED.sort_order,
          box_count          = EXCLUDED.box_count,
          wo_count           = EXCLUDED.wo_count,
          wo_number          = EXCLUDED.wo_number,
          ct_material        = EXCLUDED.ct_material,
          ct_style           = EXCLUDED.ct_style,
          ct_edge            = EXCLUDED.ct_edge,
          ct_splash          = EXCLUDED.ct_splash,
          grain_orientation  = EXCLUDED.grain_orientation
      `;
    }

    // Insert rooms + accessories + cabinets
    for (const r of rooms) {
      await sql`
        INSERT INTO rooms (id, spec_id, name, finish_group_id, notes, sort_order,
                          flooring, ceiling_height, soffit, backsplash)
        VALUES (${r.id}, ${id}, ${r.name}, ${r.finish_group_id || null},
                ${r.notes || null}, ${r.sort_order ?? 0},
                ${(r as Record<string, unknown>).flooring as string || null},
                ${(r as Record<string, unknown>).ceiling_height as string || null},
                ${(r as Record<string, unknown>).soffit as string || null},
                ${(r as Record<string, unknown>).backsplash as string || null})
        ON CONFLICT (id) DO UPDATE SET
          name            = EXCLUDED.name,
          finish_group_id = EXCLUDED.finish_group_id,
          notes           = EXCLUDED.notes,
          sort_order      = EXCLUDED.sort_order,
          flooring        = EXCLUDED.flooring,
          ceiling_height  = EXCLUDED.ceiling_height,
          soffit          = EXCLUDED.soffit,
          backsplash      = EXCLUDED.backsplash
      `;

      // Multi-finish links
      for (let fi = 0; fi < (r.finishes ?? []).length; fi++) {
        const f = r.finishes[fi];
        await sql`
          INSERT INTO room_finishes (id, room_id, finish_group_id, zone, sort_order)
          VALUES (${uid()}, ${r.id}, ${f.finish_group_id}, ${f.zone ?? null}, ${f.sort_order ?? fi})
        `;
      }

      // Accessories
      for (const acc of r.accessories ?? []) {
        await sql`
          INSERT INTO room_accessories (id, room_id, acc_id, qty, notes, size, handed, custom_type)
          VALUES (${uid()}, ${r.id}, ${acc.acc_id}, ${acc.qty ?? 1}, ${acc.custom_note ?? null}, ${acc.size ?? null}, ${acc.handed ?? null}, ${acc.custom_type ?? null})
        `;
      }

      // Cabinets
      for (const cab of r.cabinets ?? []) {
        await sql`
          INSERT INTO cabinet_line_items
            (id, room_id, spec_id, family_code, width_in, height_in, depth_in, qty,
             hinge_side, rollout_trays_qty, trash_kit, applied_panels, special_instructions, sort_order)
          VALUES
            (${cab.id}, ${r.id}, ${id}, ${cab.family_code},
             ${cab.width_in ?? null}, ${cab.height_in ?? null}, ${cab.depth_in ?? null},
             ${cab.qty ?? 1}, ${cab.hinge_side || null},
             ${cab.rollout_trays_qty ?? 0}, ${cab.trash_kit || null},
             ${cab.applied_panels ?? false},
             ${cab.special_instructions || null}, ${cab.sort_order ?? 0})
        `;
      }
    }

    // Insert moldings + room links (only when client sent moldings array)
    if (clientSentMoldings) for (const m of moldings) {
      await sql`
        INSERT INTO finish_moldings
          (id, finish_group_id, molding_type, molding_profile_id, qty_lf,
           size_in, material_id, material_other, notes, sort_order)
        VALUES
          (${m.id}, ${m.finish_group_id}, ${m.molding_type},
           ${m.molding_profile_id ?? null}, ${m.qty_lf ?? null},
           ${m.size_in ?? null}, ${m.material_id ?? null},
           ${m.material_other ?? null}, ${m.notes || null}, ${m.sort_order ?? 0})
      `;
      for (const rid of m.where_used_room_ids ?? []) {
        await sql`
          INSERT INTO finish_molding_rooms (molding_id, room_id)
          VALUES (${m.id}, ${rid})
        `;
      }
    }

    // Insert materials
    for (const mat of materials) {
      await sql`
        INSERT INTO finish_group_materials
          (id, finish_group_id, role, material_id, where_used, notes)
        VALUES
          (${mat.id || uid()}, ${mat.finish_group_id}, ${mat.role},
           ${mat.material_id || null}, ${mat.where_used || null}, ${mat.notes || null})
      `;
    }

    // Auto-seed detail sub-tables from top-level FG fields, plus the ACC hardware
    // standards.
    //
    // Guards are PER ROLE, not per table. The old version counted rows in the
    // whole table for the finish group, which had a nasty consequence: once
    // door_pulls and drawer_pulls were seeded from pull_id, the count was no
    // longer zero, so hinges could never be seeded afterwards. And hinges
    // (finish_group_hardware, role='hinges') is one of the five fields
    // validateForRelease() demands. Net effect: nothing could reach engineering.
    //
    // Seeding only ever fills a BLANK. It never overwrites a value someone chose,
    // including a deliberate "None" — an existing row for a role, even one with a
    // null hardware_id, is treated as a decision already made.
    //
    // Wrapped in individual try/catch so a seeding failure never breaks the save.
    /*
      Callout rows the user removed.

      Scoped to this spec's finish groups in the statement itself, not just filtered in
      JS: `id IN (...)` alone would let a client delete any door-front row in the
      database by guessing an id, on a route a PM can reach. The subquery makes that
      impossible regardless of what arrives.

      THE PRIMARY door row is never deleted here — the one seeded from the Door Style
      dropdown. Letting it through would break the release gate for a reason nobody
      could see.

      But only THAT row. This excluded every row with role='base', and "+ Door" adds
      another base row, because a second door style IS a base door. So an extra door
      style could not be removed once added. The primary is the base row with the
      lowest sort_order, id as a stable tie-break — the same rule the page loader uses
      to decide which row it will not hand to the form.
    */
    if (clientSentDoorFronts) {
      const toDelete = (body.door_fronts_deleted ?? []).filter((x) => typeof x === "string" && x);
      if (toDelete.length > 0) {
        try {
          await sql`
            DELETE FROM finish_group_door_fronts df
            WHERE df.id IN ${sql(toDelete)}
              AND df.finish_group_id IN (SELECT id FROM finish_groups WHERE spec_id = ${id})
              AND df.id <> (
                SELECT p.id FROM finish_group_door_fronts p
                WHERE p.finish_group_id = df.finish_group_id AND p.role = ${ROLE_BASE}
                ORDER BY p.sort_order ASC, p.id ASC
                LIMIT 1
              )
          `;
        } catch (e) {
          console.error("[save] removing door-front callouts failed:", e);
        }
      }
    }

    for (const g of finish_groups) {
      const fgId = g.id;

      /*
        door_fronts — seed one "base" row from door_style_id.

        THE GUARD IS NOW PER-ROLE. It counted rows for the WHOLE finish group, so once
        the group had any other row — an applied-end callout, a second drawer front —
        the count was non-zero and the base row could never be seeded. Since
        validateForRelease() requires a base door style, that would block the spec from
        reaching engineering permanently, and the more callouts a PM added the more
        certain it became.

        Same off-by-scope bug lib/acc-standards-seed.ts already documents fixing for
        hardware and drawers ("counted rows across the entire table for a finish
        group"). It survived here because until now nothing could add a second row.
      */
      if (g.door_style_id) {
        try {
          const cnt = await sql`
            SELECT COUNT(*) AS c FROM finish_group_door_fronts
            WHERE finish_group_id = ${fgId} AND role = ${ROLE_BASE}
          `;
          if (Number((cnt[0] as { c: string | number }).c) === 0) {
            await sql`
              INSERT INTO finish_group_door_fronts (id, finish_group_id, role, style_id, sort_order)
              VALUES (${uid()}, ${fgId}, ${ROLE_BASE}, ${g.door_style_id}, ${0})
            `;
          }
        } catch (_) { /* seeding failure -- skip */ }
      }

      /*
        Additional door / drawer-front / applied-end callouts, from the builder UI.

        Karl: "right below the first door entry an option to add a 2nd door type, same
        for drawers and applied ends. Then I can call them out however I want."

        UPSERT BY ID, never delete-and-replace. The other child tables in this file are
        rebuilt wholesale, which is safe when the UI owns every column. It does not
        here: finish_group_door_fronts also carries material_id, oe_id, ie_id,
        panel_id, grain, vendor and notes, which this UI does not edit. A wholesale
        rebuild would blank all of them on the first save.

        So each row is matched by id and only the three fields the UI owns are written.
        Removals are explicit — the client sends the ids it deleted — because inferring
        "absent from the payload means delete" would wipe every row on any request that
        happened to send a short list.

        The key is optional and checked with `in`, following the moldings precedent
        above: a client with no UI for this omits it, and existing rows are left alone
        rather than silently wiped.
      */
      if (clientSentDoorFronts) {
        const rows = (body.door_fronts ?? []).filter((r) => r.finish_group_id === fgId);
        for (const [i, r] of rows.entries()) {
          // A role outside the canonical list is refused rather than stored. This
          // table has no enum and no UNIQUE, so a typo would sit there rendering as a
          // raw identifier on a customer-facing sheet.
          if (!isDoorFrontRole(r.role)) continue;
          const styleId  = r.style_id?.trim() || null;
          const slot     = r.slot_label?.trim() || null;
          // Cab door options are only meaningful on a custom door. Clearing them when
          // the style is anything else stops a stale edge profile riding along after
          // someone switches a callout from Cab Door Custom to a catalog style.
          const isCustom = styleId === "DS-CD-CUSTOM";
          const oeId    = isCustom ? (r.oe_id?.trim()    || null) : null;
          const ieId    = isCustom ? (r.ie_id?.trim()    || null) : null;
          const panelId = isCustom ? (r.panel_id?.trim() || null) : null;
          try {
            const existing = await sql`
              SELECT id FROM finish_group_door_fronts WHERE id = ${r.id} AND finish_group_id = ${fgId}
            `;
            if (existing.length > 0) {
              await sql`
                UPDATE finish_group_door_fronts
                SET role = ${r.role}, slot_label = ${slot}, style_id = ${styleId},
                    oe_id = ${oeId}, ie_id = ${ieId}, panel_id = ${panelId},
                    sort_order = ${i + 1}
                WHERE id = ${r.id}
              `;
            } else {
              await sql`
                INSERT INTO finish_group_door_fronts
                  (id, finish_group_id, role, slot_label, style_id, oe_id, ie_id, panel_id, sort_order)
                VALUES (${r.id}, ${fgId}, ${r.role}, ${slot}, ${styleId}, ${oeId}, ${ieId}, ${panelId}, ${i + 1})
              `;
            }
          } catch (_) { /* one bad callout row must not fail the whole save */ }
        }
      }

      // Push this finish group's trim defaults onto the rooms that use it.
      //
      // This is the piece that was missing. propagateTrimDefaults existed, and so did
      // an API route with three modes, and nothing called either from a save — so the
      // only way trim ever reached a room was to fill in the finish group's defaults
      // AFTER the room already existed. Do it in the order anyone actually works in
      // — define the finish group, then add rooms — and every room came up blank.
      //
      // It belongs here rather than on the room's finish-group dropdown because rooms
      // are client-side state until this route runs: at dropdown time the room has an
      // id the database has never seen. Here, every room and room_finishes row is
      // already written, so "which rooms use this group" is answerable.
      //
      // overwrite=false: fills blanks only. Never touches a size or material someone
      // typed, and qty_lf is not named by any statement it runs — a defaulted linear
      // foot reads as measured and goes straight to a cut list.
      //
      // Idempotent, so running it on every save is not a problem: the second pass
      // finds the rows already there and changes nothing.
      try {
        await propagateTrimDefaults(id, fgId, false);
      } catch (e) {
        // The spec itself is saved. Trim defaults are a convenience; losing them is
        // not worth failing the save the PM just made.
        console.error(`[save] trim propagation failed for finish group ${fgId}:`, e);
      }

      // ACC standard hinges and slides, the pulls the PM chose, and the drawer /
      // rollout rows that carry slides_id. See lib/acc-standards-seed.ts -- it is all
      // per-role, idempotent, and only ever fills a blank.
      await seedAccStandards(fgId, {
        drawerBoxId:  g.drawer_box_id || null,
        rolloutBoxId: g.rollout_box_id || null,
        pullId:       g.pull_id || null,
      });

      // edgebands -- seed one row from edgeband_id (skip sentinel values)
      const EDGEBAND_SENTINELS = ["MATCH_PAINT_STAIN", "PVC_SPECIFY", "OTHER_EDGEBAND"];
      if (g.edgeband_id && !EDGEBAND_SENTINELS.includes(g.edgeband_id)) {
        try {
          const cnt = await sql`SELECT COUNT(*) AS c FROM finish_group_edgebands WHERE finish_group_id = ${fgId}`;
          if (Number((cnt[0] as { c: string | number }).c) === 0) {
            await sql`
              INSERT INTO finish_group_edgebands (id, finish_group_id, code, edgeband_id, sort_order)
              VALUES (${uid()}, ${fgId}, ${'EB1'}, ${g.edgeband_id}, ${0})
            `;
          }
        } catch (_) { /* seeding failure -- skip */ }
      }

      // finish fields -- seed paint_id or stain_id from color_id + finish_type
      if (g.color_id && g.finish_type) {
        try {
          // Re-read current finish_groups row to check paint_id / stain_id
          const fgRow = await sql`SELECT paint_id, stain_id FROM finish_groups WHERE id = ${fgId}`;
          const row = fgRow[0] as { paint_id: string | null; stain_id: string | null } | undefined;
          if (row && row.paint_id === null && row.stain_id === null) {
            if (g.finish_type === 'paint') {
              await sql`UPDATE finish_groups SET paint_id = ${g.color_id} WHERE id = ${fgId}`;
            } else if (g.finish_type === 'stain') {
              await sql`UPDATE finish_groups SET stain_id = ${g.color_id} WHERE id = ${fgId}`;
            }
          }
        } catch (_) { /* seeding failure -- skip */ }
      }
    }

    // Update spec updated_at
    await sql`UPDATE residential_specs SET updated_at = ${now} WHERE id = ${id}`;

  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
