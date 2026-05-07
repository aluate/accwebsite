import sql, { uid } from "@/lib/db";
import { logActivity } from "@/lib/activity-log";

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
