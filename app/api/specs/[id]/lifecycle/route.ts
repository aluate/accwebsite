export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireBuilder } from "@/lib/auth";
import {
  transitionLifecycle,
  listTransitions,
  isLifecycleState,
  nextForwardState,
  LIFECYCLE_STATES,
  type LifecycleState,
} from "@/lib/lifecycle";

// DAC #4: role-based transition guards
// Role type matches auth.ts Role: "admin" | "pm" | "engineer" | "shop" | "installer"
function transitionAllowed(role: string, from: LifecycleState, to: LifecycleState): boolean {
  if (role === "admin") return true;
  const fi = LIFECYCLE_STATES.indexOf(from), ti = LIFECYCLE_STATES.indexOf(to);
  const isForward  = ti > fi;
  const isBackward = ti < fi;
  if (role === "pm") {
    // PMs can advance DRAFT -> CLIENT_APPROVED only
    return isForward && from === "DRAFT" && to === "CLIENT_APPROVED";
  }
  if (role === "engineer") {
    // Engineers can move forward or backward (re-spin with reason)
    return isForward || isBackward;
  }
  // shop / installer: read-only
  return false;
}

// GET /api/specs/[id]/lifecycle
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireBuilder();
  const { id } = await params;
  const [spec] = await sql`
    SELECT id, lifecycle_state FROM residential_specs WHERE id = ${id}
  ` as Array<{ id: string; lifecycle_state: string }>;
  if (!spec) return NextResponse.json({ error: "Spec not found" }, { status: 404 });

  const current = isLifecycleState(spec.lifecycle_state) ? spec.lifecycle_state : ("DRAFT" as LifecycleState);
  return NextResponse.json({
    state: current,
    nextForward: nextForwardState(current),
    transitions: await listTransitions(id),
  });
}

// POST /api/specs/[id]/lifecycle  { to: LifecycleState, reason?, notes? }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireBuilder();
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const to     = String(body.to ?? "");
  const reason = body.reason ? String(body.reason) : undefined;
  const notes  = body.notes  ? String(body.notes)  : undefined;

  if (!isLifecycleState(to)) return NextResponse.json({ error: "Invalid target state" }, { status: 400 });

  const [cur] = await sql`
    SELECT lifecycle_state FROM residential_specs WHERE id = ${id}
  ` as Array<{ lifecycle_state: string }>;
  if (!cur) return NextResponse.json({ error: "Spec not found" }, { status: 404 });

  const from = cur.lifecycle_state as LifecycleState;
  if (!transitionAllowed(session.role, from, to)) {
    return NextResponse.json({
      error: `Role '${session.role}' cannot transition ${from} -> ${to}. Need engineer or admin role.`,
    }, { status: 403 });
  }

  const r = await transitionLifecycle({
    specId: id,
    to,
    actor: session.username,
    reason,
    notes,
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json(r);
}
