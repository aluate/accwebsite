export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/auth";
import { sql } from "@/lib/db";
import { propagateTrimDefaults } from "@/lib/trim-propagate";

type TrimDefaultPayload = {
  id?: string;
  finish_group_id: string;
  trim_type: string;
  species_material: string | null;
  size_desc: string | null;
  notes: string | null;
  sort_order: number;
};

// GET: all trim defaults for all FGs in this spec
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await guardApi(["admin", "pm"]);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { id } = await params;
  try {
    const rows = await sql<TrimDefaultPayload[]>`
      SELECT td.*
      FROM finish_group_trim_defaults td
      JOIN finish_groups fg ON fg.id = td.finish_group_id
      WHERE fg.spec_id = ${id}
      ORDER BY td.finish_group_id, td.sort_order
    `;
    return NextResponse.json({ trim_defaults: rows });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// POST: body = { finish_group_id, trim_defaults: [...] } — delete + re-insert for that FG
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await guardApi(["admin", "pm"]);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { id } = await params;
  const body = await req.json() as { finish_group_id: string; trim_defaults: TrimDefaultPayload[] };
  const { finish_group_id, trim_defaults } = body;

  if (!finish_group_id) {
    return NextResponse.json({ error: "finish_group_id required" }, { status: 400 });
  }

  try {
    // Verify FG belongs to this spec
    const fg = await sql`SELECT id FROM finish_groups WHERE id = ${finish_group_id} AND spec_id = ${id}`;
    if (!fg.length) {
      return NextResponse.json({ error: "finish_group not found on this spec" }, { status: 404 });
    }

    /*
      THE BUG THAT MADE FINISH-GROUP TRIM UNUSABLE.

      finish_group_trim_defaults.id is a UUID column. This route used the client's id
      verbatim (`t.id || crypto.randomUUID()`), and the spec form generates ids with
      its own uid() helper — an 8-character base-36 string like "k3j2h8s1", which is
      not a UUID. So every INSERT here raised 22P02 "invalid input syntax for type
      uuid" and the whole request 500'd.

      And because the DELETE above had already run, the failure was DESTRUCTIVE: the
      finish group's existing trim defaults were removed and the new ones never
      landed. Nothing propagated to the rooms, because there was nothing left to
      propagate. Karl: "THE TRIM STILL ISN'T PULLING WHEN I'VE ADDED IT TO THE FG."

      Two changes, both needed:

        1. Ids are normalised BEFORE anything is deleted. A client id is honoured only
           when it is actually a UUID; anything else gets a fresh one. Ids on this
           table are server-owned, so a caller has no business dictating the format.
        2. The rows are built and validated first, so the DELETE cannot run and then
           be followed by a failing INSERT. No transaction needed to make the
           dangerous ordering impossible — just do the fallible part first.
    */
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const rows = (trim_defaults ?? []).map((t, i) => ({
      id: typeof t.id === "string" && UUID_RE.test(t.id) ? t.id : crypto.randomUUID(),
      trim_type: t.trim_type || "Custom",
      species_material: t.species_material || null,
      size_desc: t.size_desc || null,
      notes: t.notes || null,
      sort_order: t.sort_order ?? i,
    }));

    await sql`DELETE FROM finish_group_trim_defaults WHERE finish_group_id = ${finish_group_id}`;

    for (const r of rows) {
      await sql`
        INSERT INTO finish_group_trim_defaults
          (id, finish_group_id, trim_type, species_material, size_desc, notes, sort_order)
        VALUES
          (${r.id}, ${finish_group_id}, ${r.trim_type},
           ${r.species_material}, ${r.size_desc},
           ${r.notes}, ${r.sort_order})
      `;
    }

    // Karl: "once we fill out the FG it should populate to the ROOMS with that FG
    // applied automatically." So saving the defaults pushes them out immediately
    // rather than waiting for someone to find a button.
    //
    // Fill-blanks only: this must never overwrite what a PM typed in a room, and it
    // never writes qty_lf. The overwrite case is the explicit "apply to all rooms"
    // action, which is a different call with overwrite: true.
    //
    // Best-effort. Propagation failing must not lose the defaults the PM just saved
    // -- those are the thing they were actually doing.
    let propagated = { rooms: 0, added: 0, updated: 0 };
    try {
      propagated = await propagateTrimDefaults(id, finish_group_id, false);
    } catch (propErr) {
      console.error("[trim-defaults] propagate failed:", propErr);
    }

    return NextResponse.json({ ok: true, propagated });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
