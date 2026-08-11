import sql, { uid } from "@/lib/db";
import { logActivity } from "@/lib/activity-log";
import { hasDoorMaterial, describeMissingDoorMaterial } from "@/lib/door-material";
import { normalizeDoorFrontRole, ROLE_BASE } from "@/lib/door-front-roles";

export const LIFECYCLE_STATES = ["DRAFT", "CLIENT_APPROVED", "RELEASED_TO_ENG", "ENGINEERED", "RELEASED_TO_SHOP"] as const;
export type LifecycleState = (typeof LIFECYCLE_STATES)[number];

const FORWARD_EDGES: Record<LifecycleState, LifecycleState | null> = {
  DRAFT: "CLIENT_APPROVED", CLIENT_APPROVED: "RELEASED_TO_ENG",
  RELEASED_TO_ENG: "ENGINEERED", ENGINEERED: "RELEASED_TO_SHOP", RELEASED_TO_SHOP: null,
};

export function isLifecycleState(s: string): s is LifecycleState {
  return (LIFECYCLE_STATES as readonly string[]).includes(s);
}
export function nextForwardState(current: LifecycleState): LifecycleState | null {
  return FORWARD_EDGES[current];
}

export type TransitionResult = { ok: true; from: LifecycleState; to: LifecycleState } | { ok: false; error: string };
export type TransitionInput = { specId: string; to: LifecycleState; actor: string; reason?: string; notes?: string };

// ── Pre-release validation ───────────────────────────────────────────────────
//
// Before a spec can be RELEASED_TO_ENG every finish group must have the five
// fields that engineering actually needs:
//   1. Base door style  (finish_group_door_fronts, role='base', style_id)
//   2. Base door material (finish_group_door_fronts, role='base', material_id)
//   3. Drawer box       (finish_group_drawers, drawer_box_id)
//   4. Drawer slides    (finish_group_drawers, slides_id)
//   5. Hinges           (finish_group_hardware, role='hinges', hardware_id)
//
// These are the exact five items on the Engineering Checklist static list —
// if any are blank the engineer cannot do their job.

async function validateForRelease(specId: string): Promise<string | null> {
  // finish_type / species / color_name come along because base door material is
  // DERIVED from them rather than entered separately -- see lib/door-material.ts.
  const groups = await sql`
    SELECT id, label, finish_type, species, color_name
    FROM finish_groups WHERE spec_id = ${specId} ORDER BY sort_order
  ` as { id: string; label: string; finish_type: string | null; species: string | null; color_name: string | null }[];

  if (groups.length === 0) {
    return "No finish groups defined — add at least one before releasing to engineering.";
  }

  const fgIds = groups.map((g) => g.id);
  const labelOf = Object.fromEntries(groups.map((g) => [g.id, g.label || g.id]));
  const fgOf = Object.fromEntries(groups.map((g) => [g.id, g]));

  const [doorFronts, drawers, hardware] = await Promise.all([
    sql`SELECT finish_group_id, role, style_id, material_id
        FROM finish_group_door_fronts WHERE finish_group_id IN ${sql(fgIds)}` as Promise<
      { finish_group_id: string; role: string; style_id: string | null; material_id: string | null }[]
    >,
    sql`SELECT finish_group_id, role, drawer_box_id, slides_id
        FROM finish_group_drawers WHERE finish_group_id IN ${sql(fgIds)}` as Promise<
      { finish_group_id: string; role: string; drawer_box_id: string | null; slides_id: string | null }[]
    >,
    sql`SELECT finish_group_id, role, hardware_id
        FROM finish_group_hardware WHERE finish_group_id IN ${sql(fgIds)}` as Promise<
      { finish_group_id: string; role: string; hardware_id: string | null }[]
    >,
  ]);

  const missing: string[] = [];

  for (const fgId of fgIds) {
    const tag = labelOf[fgId];
    const baseDoor = (doorFronts as { finish_group_id: string; role: string; style_id: string | null; material_id: string | null }[])
      // Normalized: this reads raw rows straight from the table rather than the view,
      // so a legacy spelling has to be resolved here too or the gate looks past it.
      .find((d) => d.finish_group_id === fgId && normalizeDoorFrontRole(d.role) === ROLE_BASE);
    /*
      role === "drawer_box" matters. This picked the first finish_group_drawers row
      for the group with no role filter, and a group can also carry a `rollout` row.
      Ordering is not guaranteed, so on a group whose rollout row came back first,
      the rollout's box and slides satisfied the "drawer box" and "drawer slides"
      checks and the actual drawers were never verified at all — a spec reaching
      engineering with no drawer box specified, which is the one thing this gate
      exists to prevent.
    */
    const drawer = (drawers as { finish_group_id: string; role: string; drawer_box_id: string | null; slides_id: string | null }[])
      .find((d) => d.finish_group_id === fgId && d.role === "drawer_box");
    const hingeRow = (hardware as { finish_group_id: string; role: string; hardware_id: string | null }[])
      .find((h) => h.finish_group_id === fgId && h.role === "hinges");

    const fg = fgOf[fgId];
    if (!baseDoor?.style_id) missing.push(`"${tag}": base door style`);
    // Accepts a DERIVED material. The old check demanded material_id, a column
    // written only by the Schedules tab -- which is imported nowhere -- so this
    // line alone blocked every spec in the system from reaching engineering.
    if (!hasDoorMaterial(baseDoor?.material_id, fg)) {
      missing.push(`"${tag}": ${describeMissingDoorMaterial(fg)}`);
    }
    if (!drawer?.drawer_box_id) missing.push(`"${tag}": drawer box`);
    if (!drawer?.slides_id)     missing.push(`"${tag}": drawer slides`);
    if (!hingeRow?.hardware_id) missing.push(`"${tag}": hinges`);
  }

  if (missing.length === 0) return null;

  const shown = missing.slice(0, 4);
  const extra = missing.length - shown.length;
  const list  = shown.join("; ") + (extra > 0 ? `; (+${extra} more)` : "");
  return `Cannot release to engineering — required fields missing: ${list}. Complete them on the Finishes tab.`;
}

// ── Main transition ──────────────────────────────────────────────────────────

export async function transitionLifecycle(input: TransitionInput): Promise<TransitionResult> {
  const { specId, to, actor, reason, notes } = input;
  if (!isLifecycleState(to)) return { ok: false, error: `Invalid target state: ${to}` };

  const rows = await sql`SELECT lifecycle_state, job_id FROM residential_specs WHERE id = ${specId}`;
  const row = rows[0] as { lifecycle_state: string; job_id: string } | undefined;
  if (!row) return { ok: false, error: "Spec not found" };

  const current = row.lifecycle_state;
  if (!isLifecycleState(current)) return { ok: false, error: `Spec is in unknown state: ${current}` };
  if (current === to) return { ok: false, error: `Already in state ${to}` };

  const fromIdx = LIFECYCLE_STATES.indexOf(current);
  const toIdx = LIFECYCLE_STATES.indexOf(to);
  const isForward = toIdx === fromIdx + 1;
  const isBackward = toIdx < fromIdx;

  if (!isForward && !isBackward) return { ok: false, error: `Cannot skip from ${current} to ${to}. Forward path: ${LIFECYCLE_STATES.join(" → ")}` };
  if (isBackward && (!reason || !reason.trim())) return { ok: false, error: `Backwards transition (${current} → ${to}) requires a reason.` };

  // Hard gate: verify sub-section completeness before releasing to engineering.
  if (to === "RELEASED_TO_ENG") {
    const validationError = await validateForRelease(specId);
    if (validationError) return { ok: false, error: validationError };
  }

  const now = new Date().toISOString();
  await sql.begin(async (tx) => {
    await tx`UPDATE residential_specs SET lifecycle_state = ${to}, updated_at = ${now} WHERE id = ${specId}`;
    await tx`INSERT INTO spec_lifecycle_transitions (id, spec_id, from_state, to_state, transitioned_at, transitioned_by, reason, notes) VALUES (${uid()}, ${specId}, ${current}, ${to}, ${now}, ${actor}, ${reason ?? null}, ${notes ?? null})`;
  });

  // Mirror to activity log (outside transaction — acceptable for initial deploy)
  await logActivity({
    entityType: "spec", entityId: specId, jobId: row.job_id,
    eventType: "status_change", fromState: current, toState: to, actor,
  }).catch(() => {});

  return { ok: true, from: current as LifecycleState, to };
}

export async function listTransitions(specId: string) {
  return await sql`
    SELECT id, spec_id, from_state, to_state, transitioned_at, transitioned_by, reason, notes
    FROM spec_lifecycle_transitions
    WHERE spec_id = ${specId}
    ORDER BY transitioned_at DESC
  `;
}
