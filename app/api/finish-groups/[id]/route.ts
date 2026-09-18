export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { guardCap } from "@/lib/permissions";

/**
 * PATCH /api/finish-groups/[id]
 * Updates planning-only fields (box_count, wo_count) on a finish group.
 * Auth: specs.edit.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  /*
    THE OWNERSHIP RULE THAT COULD NEVER PASS.

    This used to require, for a pm, that the parent job's `pm` column equal the
    caller's session EMAIL:

        WHERE fg.id = ${id} AND j.pm = ${session.email}

    `jobs.pm` does not hold emails. /api/jobs/pms returns { name, email } and
    IntakeForm binds the option to `pm.name` — so the column holds a DISPLAY
    NAME ("Karl Vaage"), and the comparison was name-against-email. It could
    never match for anybody. Every PM, on every job, including their own, was
    refused box_count / wo_count / pm_complexity / wo_number: the four planning
    fields that decide how many work orders the shop cuts.

    It read as a broken save rather than a refusal, which is why it survived.

    Karl, 2026-09-18, asked whether to fix the comparison or drop the rule, and
    chose to drop it: any PM can edit any job, the way every other PM capability
    in the map already works, because covering a colleague's job is normal here.
    So this is now the same one-line capability check as its neighbours, and the
    rule that lived only in this file and nowhere in the map is gone.
  */
  const guard = await guardCap("specs.edit");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const { id } = await params;
  const body = await req.json() as { box_count?: number | null; wo_count?: number | null; pm_complexity?: number | null; wo_number?: string | null };

  const allowedNumeric = ["box_count", "wo_count", "pm_complexity"];
  const allowedText = ["wo_number"];
  const updates: Record<string, number | string | null> = {};
  for (const k of allowedNumeric) {
    if (k in body) updates[k] = (body as Record<string, number | null>)[k] ?? null;
  }
  for (const k of allowedText) {
    if (k in body) updates[k] = (body as Record<string, string | null>)[k] ?? null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const [row] = await sql`SELECT id FROM finish_groups WHERE id = ${id}`;
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await sql`UPDATE finish_groups SET ${sql(updates)} WHERE id = ${id}`;

  return NextResponse.json({ ok: true });
}
