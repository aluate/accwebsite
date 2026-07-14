import sql, { uid } from "@/lib/db";
import {
  EVENT_TYPES, EVENT_TYPE_LABELS, EVENT_STATUSES, CREW_KINDS,
  isEventType, isEventStatus, isCrewKind,
  isoDateOffset, isoWeekStart,
  type EventType, type EventStatus, type CrewKind,
  type Crew, type JobEvent, type JobEventWithJoins, type JobEventAuditRow,
} from "@/lib/schedule-types";

export { EVENT_TYPES, EVENT_TYPE_LABELS, EVENT_STATUSES, CREW_KINDS, isEventType, isEventStatus, isCrewKind, isoDateOffset, isoWeekStart };
export type { EventType, EventStatus, CrewKind, Crew, JobEvent, JobEventWithJoins, JobEventAuditRow };

// NOTE: EVENT_SELECT is kept as a plain string for documentation purposes only.
// It is NEVER passed to sql.unsafe() with args (that sets simple:false → extended
// protocol → PgBouncer transaction mode hang). It is also NOT stored as a module-
// level sql.unsafe() fragment (postgres.js may execute queries eagerly on next tick,
// consuming a pool connection before the route queries run).
//
// Each query function below inlines the SQL directly inside a tagged template literal.
// Tagged templates with prepare:false use simple query protocol — safe with PgBouncer.

export async function listCrews(opts: { activeOnly?: boolean } = {}): Promise<Crew[]> {
  if (opts.activeOnly) return await sql<Crew[]>`SELECT * FROM crews WHERE active = 1 ORDER BY active DESC, name`;
  return await sql<Crew[]>`SELECT * FROM crews ORDER BY active DESC, name`;
}

export async function getCrew(id: string): Promise<Crew | null> {
  const rows = await sql<Crew[]>`SELECT * FROM crews WHERE id = ${id}`;
  return rows[0] ?? null;
}

export async function createCrew(input: { name: string; kind: CrewKind; contact_phone?: string | null; contact_email?: string | null; notes?: string | null; actor: string }): Promise<{ ok: true; crew: Crew } | { ok: false; error: string }> {
  if (!input.name?.trim()) return { ok: false, error: "Name is required" };
  if (!isCrewKind(input.kind)) return { ok: false, error: `Invalid kind: ${input.kind}` };
  const id = uid(); const now = new Date().toISOString();
  await sql`INSERT INTO crews (id, name, kind, contact_phone, contact_email, active, notes, created_at, created_by) VALUES (${id}, ${input.name.trim()}, ${input.kind}, ${input.contact_phone??null}, ${input.contact_email??null}, 1, ${input.notes??null}, ${now}, ${input.actor})`;
  return { ok: true, crew: (await getCrew(id))! };
}

export async function updateCrew(id: string, patch: Partial<Pick<Crew, "name"|"kind"|"contact_phone"|"contact_email"|"active"|"notes">>, _actor: string): Promise<{ ok: true; crew: Crew } | { ok: false; error: string }> {
  const cur = await getCrew(id);
  if (!cur) return { ok: false, error: "Crew not found" };
  const next = { name: patch.name??cur.name, kind: patch.kind??cur.kind, contact_phone: patch.contact_phone===undefined?cur.contact_phone:patch.contact_phone, contact_email: patch.contact_email===undefined?cur.contact_email:patch.contact_email, active: patch.active??cur.active, notes: patch.notes===undefined?cur.notes:patch.notes };
  if (!isCrewKind(next.kind)) return { ok: false, error: `Invalid kind: ${next.kind}` };
  await sql`UPDATE crews SET name=${next.name}, kind=${next.kind}, contact_phone=${next.contact_phone}, contact_email=${next.contact_email}, active=${next.active?1:0}, notes=${next.notes} WHERE id=${id}`;
  return { ok: true, crew: (await getCrew(id))! };
}

export async function getEvent(id: string): Promise<JobEventWithJoins | null> {
  const rows = await sql<JobEventWithJoins[]>`
    SELECT sub.*,
      COALESCE(agg.crew_ids, '{}') AS crew_ids,
      COALESCE(agg.crew_names, '{}') AS crew_names,
      agg.crew_name, agg.crew_kind,
      j.client_name AS job_client_name, j.site_address AS job_site_address,
      j.job_number AS job_job_number
    FROM job_events sub
    LEFT JOIN (
      SELECT ec.event_id,
        array_agg(c.id ORDER BY c.name) FILTER (WHERE c.id IS NOT NULL) AS crew_ids,
        array_agg(c.name ORDER BY c.name) FILTER (WHERE c.id IS NOT NULL) AS crew_names,
        (array_agg(c.name ORDER BY c.name) FILTER (WHERE c.id IS NOT NULL))[1] AS crew_name,
        (array_agg(c.kind ORDER BY c.name) FILTER (WHERE c.id IS NOT NULL))[1] AS crew_kind
      FROM event_crew ec
      JOIN crews c ON c.id = ec.crew_member_id
      GROUP BY ec.event_id
    ) agg ON agg.event_id = sub.id
    LEFT JOIN jobs j ON j.id = sub.job_id
    WHERE sub.id = ${id}
  `;
  return rows[0] ?? null;
}

export async function forwardEvents(opts: { todayIso?: string; windowDaysBack?: number; windowDaysForward?: number; crewId?: string; eventType?: EventType } = {}): Promise<JobEventWithJoins[]> {
  const today = opts.todayIso ?? new Date().toISOString().slice(0, 10);
  const lo = isoDateOffset(today, -(opts.windowDaysBack ?? 7));
  const hi = isoDateOffset(today, +(opts.windowDaysForward ?? 90));
  return await sql<JobEventWithJoins[]>`
    SELECT sub.*,
      COALESCE(agg.crew_ids, '{}') AS crew_ids,
      COALESCE(agg.crew_names, '{}') AS crew_names,
      agg.crew_name, agg.crew_kind,
      j.client_name AS job_client_name, j.site_address AS job_site_address,
      j.job_number AS job_job_number
    FROM job_events sub
    LEFT JOIN (
      SELECT ec.event_id,
        array_agg(c.id ORDER BY c.name) FILTER (WHERE c.id IS NOT NULL) AS crew_ids,
        array_agg(c.name ORDER BY c.name) FILTER (WHERE c.id IS NOT NULL) AS crew_names,
        (array_agg(c.name ORDER BY c.name) FILTER (WHERE c.id IS NOT NULL))[1] AS crew_name,
        (array_agg(c.kind ORDER BY c.name) FILTER (WHERE c.id IS NOT NULL))[1] AS crew_kind
      FROM event_crew ec
      JOIN crews c ON c.id = ec.crew_member_id
      GROUP BY ec.event_id
    ) agg ON agg.event_id = sub.id
    LEFT JOIN jobs j ON j.id = sub.job_id
    WHERE sub.date_start IS NOT NULL
      AND sub.date_start >= ${lo}
      AND sub.date_start <= ${hi}
      ${opts.crewId ? sql`AND EXISTS (SELECT 1 FROM event_crew ec2 WHERE ec2.event_id = sub.id AND ec2.crew_member_id = ${opts.crewId})` : sql``}
      ${opts.eventType ? sql`AND sub.event_type = ${opts.eventType}` : sql``}
    ORDER BY sub.date_start, sub.sort_order, sub.created_at
  `;
}

export async function onDeckEvents(opts: { jobId?: string; eventType?: EventType } = {}): Promise<JobEventWithJoins[]> {
  return await sql<JobEventWithJoins[]>`
    SELECT sub.*,
      COALESCE(agg.crew_ids, '{}') AS crew_ids,
      COALESCE(agg.crew_names, '{}') AS crew_names,
      agg.crew_name, agg.crew_kind,
      j.client_name AS job_client_name, j.site_address AS job_site_address,
      j.job_number AS job_job_number
    FROM job_events sub
    LEFT JOIN (
      SELECT ec.event_id,
        array_agg(c.id ORDER BY c.name) FILTER (WHERE c.id IS NOT NULL) AS crew_ids,
        array_agg(c.name ORDER BY c.name) FILTER (WHERE c.id IS NOT NULL) AS crew_names,
        (array_agg(c.name ORDER BY c.name) FILTER (WHERE c.id IS NOT NULL))[1] AS crew_name,
        (array_agg(c.kind ORDER BY c.name) FILTER (WHERE c.id IS NOT NULL))[1] AS crew_kind
      FROM event_crew ec
      JOIN crews c ON c.id = ec.crew_member_id
      GROUP BY ec.event_id
    ) agg ON agg.event_id = sub.id
    LEFT JOIN jobs j ON j.id = sub.job_id
    WHERE sub.date_start IS NULL
      ${opts.jobId ? sql`AND sub.job_id = ${opts.jobId}` : sql``}
      ${opts.eventType ? sql`AND sub.event_type = ${opts.eventType}` : sql``}
    ORDER BY sub.created_at DESC
  `;
}

export async function jobEvents(jobId: string): Promise<JobEventWithJoins[]> {
  return await sql<JobEventWithJoins[]>`
    SELECT sub.*,
      COALESCE(agg.crew_ids, '{}') AS crew_ids,
      COALESCE(agg.crew_names, '{}') AS crew_names,
      agg.crew_name, agg.crew_kind,
      j.client_name AS job_client_name, j.site_address AS job_site_address,
      j.job_number AS job_job_number
    FROM job_events sub
    LEFT JOIN (
      SELECT ec.event_id,
        array_agg(c.id ORDER BY c.name) FILTER (WHERE c.id IS NOT NULL) AS crew_ids,
        array_agg(c.name ORDER BY c.name) FILTER (WHERE c.id IS NOT NULL) AS crew_names,
        (array_agg(c.name ORDER BY c.name) FILTER (WHERE c.id IS NOT NULL))[1] AS crew_name,
        (array_agg(c.kind ORDER BY c.name) FILTER (WHERE c.id IS NOT NULL))[1] AS crew_kind
      FROM event_crew ec
      JOIN crews c ON c.id = ec.crew_member_id
      GROUP BY ec.event_id
    ) agg ON agg.event_id = sub.id
    LEFT JOIN jobs j ON j.id = sub.job_id
    WHERE sub.job_id = ${jobId}
    ORDER BY sub.date_start IS NULL, sub.date_start, sub.sort_order, sub.created_at
  `;
}

export async function findCrewConflicts(input: { crewId: string; dateStart: string; dateEnd?: string | null; excludeEventId?: string }): Promise<JobEventWithJoins[]> {
  const end = input.dateEnd ?? input.dateStart;
  return await sql<JobEventWithJoins[]>`
    SELECT sub.*,
      COALESCE(agg.crew_ids, '{}') AS crew_ids,
      COALESCE(agg.crew_names, '{}') AS crew_names,
      agg.crew_name, agg.crew_kind,
      j.client_name AS job_client_name, j.site_address AS job_site_address,
      j.job_number AS job_job_number
    FROM job_events sub
    LEFT JOIN (
      SELECT ec.event_id,
        array_agg(c.id ORDER BY c.name) FILTER (WHERE c.id IS NOT NULL) AS crew_ids,
        array_agg(c.name ORDER BY c.name) FILTER (WHERE c.id IS NOT NULL) AS crew_names,
        (array_agg(c.name ORDER BY c.name) FILTER (WHERE c.id IS NOT NULL))[1] AS crew_name,
        (array_agg(c.kind ORDER BY c.name) FILTER (WHERE c.id IS NOT NULL))[1] AS crew_kind
      FROM event_crew ec
      JOIN crews c ON c.id = ec.crew_member_id
      GROUP BY ec.event_id
    ) agg ON agg.event_id = sub.id
    LEFT JOIN jobs j ON j.id = sub.job_id
    WHERE EXISTS (SELECT 1 FROM event_crew ec2 WHERE ec2.event_id = sub.id AND ec2.crew_member_id = ${input.crewId})
      AND sub.date_start IS NOT NULL
      AND sub.date_start <= ${end}
      AND COALESCE(sub.date_end, sub.date_start) >= ${input.dateStart}
      ${input.excludeEventId ? sql`AND sub.id <> ${input.excludeEventId}` : sql``}
    ORDER BY sub.date_start
  `;
}

export async function findDeliveryConflicts(dateStart: string, excludeEventId?: string): Promise<JobEventWithJoins[]> {
  return await sql<JobEventWithJoins[]>`
    SELECT sub.*,
      COALESCE(agg.crew_ids, '{}') AS crew_ids,
      COALESCE(agg.crew_names, '{}') AS crew_names,
      agg.crew_name, agg.crew_kind,
      j.client_name AS job_client_name, j.site_address AS job_site_address,
      j.job_number AS job_job_number
    FROM job_events sub
    LEFT JOIN (
      SELECT ec.event_id,
        array_agg(c.id ORDER BY c.name) FILTER (WHERE c.id IS NOT NULL) AS crew_ids,
        array_agg(c.name ORDER BY c.name) FILTER (WHERE c.id IS NOT NULL) AS crew_names,
        (array_agg(c.name ORDER BY c.name) FILTER (WHERE c.id IS NOT NULL))[1] AS crew_name,
        (array_agg(c.kind ORDER BY c.name) FILTER (WHERE c.id IS NOT NULL))[1] AS crew_kind
      FROM event_crew ec
      JOIN crews c ON c.id = ec.crew_member_id
      GROUP BY ec.event_id
    ) agg ON agg.event_id = sub.id
    LEFT JOIN jobs j ON j.id = sub.job_id
    WHERE sub.event_type IN ('cab_delivery', 'top_delivery')
      AND sub.date_start = ${dateStart}
      ${excludeEventId ? sql`AND sub.id <> ${excludeEventId}` : sql``}
    ORDER BY sub.created_at
  `;
}

export async function findSiblingEvent(input: { jobId: string; eventType: EventType; excludeEventId?: string }): Promise<JobEvent | null> {
  const rows = await sql<JobEvent[]>`
    SELECT * FROM job_events
    WHERE job_id = ${input.jobId}
      AND event_type = ${input.eventType}
      ${input.excludeEventId ? sql`AND id <> ${input.excludeEventId}` : sql``}
    ORDER BY created_at DESC LIMIT 1
  `;
  return rows[0] ?? null;
}

export type CreateEventInput = {
  job_id: string;
  event_type: EventType;
  description?: string|null;
  date_start?: string|null;
  date_end?: string|null;
  crew_id?: string|null;
  crew_ids?: string[];
  status?: EventStatus;
  note?: string|null;
  blocked_on?: string|null;
  parent_event_id?: string|null;
  sort_order?: number;
  duration_days?: number|null;
  actor: string;
};
export type CreateEventResult = { ok: true; event: JobEventWithJoins; auto_linked_parent?: string } | { ok: false; error: string };

export async function createEvent(input: CreateEventInput): Promise<CreateEventResult> {
  if (!isEventType(input.event_type)) return { ok: false, error: `Invalid event_type: ${input.event_type}` };
  const status = input.status ?? "scheduled";
  if (!isEventStatus(status)) return { ok: false, error: `Invalid status: ${status}` };
  if (input.date_start && input.date_end && input.date_end < input.date_start) return { ok: false, error: `date_end before date_start` };
  const jobRows = await sql`SELECT id FROM jobs WHERE id = ${input.job_id}`;
  if (!jobRows[0]) return { ok: false, error: `Job not found: ${input.job_id}` };
  let parent_event_id: string | null = null; let autoLinked: string | undefined;
  if (input.parent_event_id === undefined) {
    const sibling = await findSiblingEvent({ jobId: input.job_id, eventType: input.event_type });
    if (sibling) { parent_event_id = sibling.id; autoLinked = sibling.id; }
  } else { parent_event_id = input.parent_event_id; }
  const id = uid(); const now = new Date().toISOString();
  const crewIds: string[] = input.crew_ids ?? (input.crew_id ? [input.crew_id] : []);
  const legacyCrId = crewIds[0] ?? null;
  await sql.begin(async (tx) => {
    await tx`INSERT INTO job_events (id, job_id, event_type, description, date_start, date_end, crew_id, status, note, blocked_on, parent_event_id, sort_order, duration_days, created_at, created_by, updated_at, updated_by) VALUES (${id}, ${input.job_id}, ${input.event_type}, ${input.description??null}, ${input.date_start??null}, ${input.date_end??null}, ${legacyCrId}, ${status}, ${input.note??null}, ${input.blocked_on??null}, ${parent_event_id}, ${input.sort_order??0}, ${input.duration_days??1}, ${now}, ${input.actor}, ${now}, ${input.actor})`;
    for (const cid of crewIds) {
      await tx`INSERT INTO event_crew (id, event_id, crew_member_id) VALUES (${uid()}, ${id}, ${cid}) ON CONFLICT DO NOTHING`;
    }
    const [after] = await tx<JobEvent[]>`SELECT * FROM job_events WHERE id = ${id}`;
    await tx`INSERT INTO job_event_audit (id, event_id, job_id, action, before_json, after_json, changed_at, changed_by) VALUES (${uid()}, ${id}, ${input.job_id}, 'create', null, ${JSON.stringify(after)}, ${now}, ${input.actor})`;
  });
  return { ok: true, event: (await getEvent(id))!, auto_linked_parent: autoLinked };
}

export type UpdateEventPatch = Partial<Omit<JobEvent, "id"|"job_id"|"created_at"|"created_by"|"updated_at"|"updated_by">> & {
  crew_ids?: string[];
};
export type UpdateEventResult = { ok: true; event: JobEventWithJoins; conflicts?: JobEventWithJoins[] } | { ok: false; error: string };

export async function updateEvent(id: string, patch: UpdateEventPatch, actor: string): Promise<UpdateEventResult> {
  const rows = await sql<JobEvent[]>`SELECT * FROM job_events WHERE id = ${id}`;
  const before = rows[0];
  if (!before) return { ok: false, error: "Event not found" };
  if (patch.event_type !== undefined && !isEventType(patch.event_type)) return { ok: false, error: `Invalid event_type: ${patch.event_type}` };
  if (patch.status !== undefined && !isEventStatus(patch.status)) return { ok: false, error: `Invalid status: ${patch.status}` };
  const newCrewIds: string[] | undefined = patch.crew_ids;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { crew_ids: _cids, ...restPatch } = patch;
  const next: JobEvent = { ...before, ...restPatch, updated_at: new Date().toISOString(), updated_by: actor };
  if (next.date_start && next.date_end && next.date_end < next.date_start) return { ok: false, error: `date_end before date_start` };
  if (next.parent_event_id && next.parent_event_id !== before.parent_event_id) {
    if (next.parent_event_id === id) return { ok: false, error: "An event cannot be its own parent" };
    const seen = new Set<string>(); let cursor: string | null = next.parent_event_id;
    while (cursor) {
      if (cursor === id) return { ok: false, error: `Would create a cycle` };
      if (seen.has(cursor)) break; seen.add(cursor);
      type PeRow = { parent_event_id: string | null };
      const rp: PeRow[] = await sql<PeRow[]>`SELECT parent_event_id FROM job_events WHERE id = ${cursor}`;
      cursor = rp[0]?.parent_event_id ?? null;
    }
  }
  if (newCrewIds !== undefined) { next.crew_id = newCrewIds[0] ?? null; }
  const now = next.updated_at;
  await sql.begin(async (tx) => {
    await tx`UPDATE job_events SET event_type=${next.event_type}, description=${next.description}, date_start=${next.date_start}, date_end=${next.date_end}, crew_id=${next.crew_id}, status=${next.status}, note=${next.note}, blocked_on=${next.blocked_on}, parent_event_id=${next.parent_event_id}, sort_order=${next.sort_order}, duration_days=${next.duration_days??1}, updated_at=${now}, updated_by=${actor} WHERE id=${id}`;
    if (newCrewIds !== undefined) {
      await tx`DELETE FROM event_crew WHERE event_id = ${id}`;
      for (const cid of newCrewIds) {
        await tx`INSERT INTO event_crew (id, event_id, crew_member_id) VALUES (${uid()}, ${id}, ${cid}) ON CONFLICT DO NOTHING`;
      }
    }
    const [after] = await tx<JobEvent[]>`SELECT * FROM job_events WHERE id = ${id}`;
    await tx`INSERT INTO job_event_audit (id, event_id, job_id, action, before_json, after_json, changed_at, changed_by) VALUES (${uid()}, ${id}, ${before.job_id}, 'update', ${JSON.stringify(before)}, ${JSON.stringify(after)}, ${now}, ${actor})`;
  });
  let conflicts: JobEventWithJoins[] | undefined;
  if (next.date_start) {
    const crewsToCheck = newCrewIds ?? (next.crew_id ? [next.crew_id] : []);
    const conflictSets = await Promise.all(
      crewsToCheck.map((cid) =>
        findCrewConflicts({ crewId: cid, dateStart: next.date_start!, dateEnd: next.date_end, excludeEventId: id })
      )
    );
    const seen2 = new Map<string, JobEventWithJoins>();
    for (const g of conflictSets) for (const c of g) seen2.set(c.id, c);
    conflicts = seen2.size > 0 ? Array.from(seen2.values()) : undefined;
  }
  return { ok: true, event: (await getEvent(id))!, conflicts };
}

export async function deleteEvent(id: string, actor: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const rows = await sql<JobEvent[]>`SELECT * FROM job_events WHERE id = ${id}`;
  const before = rows[0];
  if (!before) return { ok: false, error: "Event not found" };
  const now = new Date().toISOString();
  await sql.begin(async (tx) => {
    await tx`DELETE FROM job_events WHERE id = ${id}`;
    await tx`INSERT INTO job_event_audit (id, event_id, job_id, action, before_json, after_json, changed_at, changed_by) VALUES (${uid()}, ${id}, ${before.job_id}, 'delete', ${JSON.stringify(before)}, null, ${now}, ${actor})`;
  });
  return { ok: true };
}

export async function eventAuditTrail(eventId: string): Promise<JobEventAuditRow[]> {
  return await sql<JobEventAuditRow[]>`SELECT * FROM job_event_audit WHERE event_id = ${eventId} ORDER BY changed_at`;
}
