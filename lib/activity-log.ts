import sql, { uid } from "@/lib/db";

export type ActivityEntityType = "job" | "spec" | "approval" | "event" | "change_order" | "punch" | "warranty" | "media" | "field_measure";
export type ActivityEventType = "status_change" | "created" | "deleted" | "note_added" | "file_uploaded" | "signed" | "completed" | "voided" | "assigned" | "scheduled" | "rescheduled" | string;

export interface LogActivityInput {
  entityType: ActivityEntityType; entityId: string;
  jobId?: string | null; eventType: ActivityEventType;
  fromState?: string | null; toState?: string | null;
  actor: string; actorRole?: string | null; payload?: unknown;
}

export async function logActivity(input: LogActivityInput): Promise<string> {
  const id = uid();
  const now = new Date().toISOString();
  await sql`
    INSERT INTO activity_log
      (id, entity_type, entity_id, job_id, event_type, from_state, to_state, actor, actor_role, payload, occurred_at)
    VALUES (
      ${id}, ${input.entityType}, ${input.entityId}, ${input.jobId ?? null},
      ${input.eventType}, ${input.fromState ?? null}, ${input.toState ?? null},
      ${input.actor}, ${input.actorRole ?? null},
      ${input.payload != null ? JSON.stringify(input.payload) : null},
      ${now}
    )
  `;
  return id;
}

export interface ActivityRow {
  id: string; entity_type: string; entity_id: string; job_id: string | null;
  event_type: string; from_state: string | null; to_state: string | null;
  actor: string; actor_role: string | null; payload: string | null; occurred_at: string;
}

export async function listActivityForEntity(entityType: ActivityEntityType, entityId: string, limit = 200): Promise<ActivityRow[]> {
  return await sql<ActivityRow[]>`SELECT * FROM activity_log WHERE entity_type = ${entityType} AND entity_id = ${entityId} ORDER BY occurred_at DESC LIMIT ${limit}`;
}

export async function listActivityForJob(jobId: string, limit = 200): Promise<ActivityRow[]> {
  return await sql<ActivityRow[]>`SELECT * FROM activity_log WHERE job_id = ${jobId} ORDER BY occurred_at DESC LIMIT ${limit}`;
}

export async function listActivityByActor(actor: string, limit = 200): Promise<ActivityRow[]> {
  return await sql<ActivityRow[]>`SELECT * FROM activity_log WHERE actor = ${actor} ORDER BY occurred_at DESC LIMIT ${limit}`;
}

export async function listRecentActivity(limit = 100): Promise<ActivityRow[]> {
  return await sql<ActivityRow[]>`SELECT * FROM activity_log ORDER BY occurred_at DESC LIMIT ${limit}`;
}
