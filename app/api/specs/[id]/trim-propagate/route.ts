export const dynamic = "force-dynamic";

/**
 * POST /api/specs/[id]/trim-propagate
 *
 * Pushes a finish group's trim defaults onto the rooms that use it, and re-derives a
 * room's trim after its finish group changes.
 *
 * Until now `finish_group_trim_defaults` was a table nobody read: a PM filled in
 * "Filler / MEL-3 / 2.5x2.5" once per finish group and then typed it again in every
 * room, because nothing copied it across.
 *
 * Modes:
 *
 *   { finish_group_id }                    fill blanks on every room using that group
 *   { finish_group_id, overwrite: true }   "apply to all rooms" — replaces size and
 *                                          material even where someone typed one
 *   { room_id, finish_group_id }           the room just moved to this group;
 *                                          re-derive its trim
 *
 * LF is never written by any of them. Linear feet is a measurement of a specific
 * room; a defaulted LF looks measured and is not, and it flows straight into a cut
 * list. Everything else here is a starting point someone will correct.
 */

import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/auth";
import { propagateTrimDefaults, retrimRoomForFinishGroup } from "@/lib/trim-propagate";

type Body = { finish_group_id: string; room_id?: string; overwrite?: boolean };

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardApi(["admin", "pm"]);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const { id: specId } = await params;
  const { finish_group_id, room_id, overwrite = false } = ((await req.json()) ?? {}) as Body;

  if (!finish_group_id) {
    return NextResponse.json({ error: "finish_group_id required" }, { status: 400 });
  }

  try {
    const result = room_id
      ? await retrimRoomForFinishGroup(specId, room_id, finish_group_id)
      : await propagateTrimDefaults(specId, finish_group_id, overwrite);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
