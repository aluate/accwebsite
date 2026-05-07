/**
 * lib/archive.ts — spec CSV snapshots.
 * Archive data stored as JSON in spec_archives.snapshot (no filesystem).
 */
import sql, { uid } from "@/lib/db";

export async function archiveSpec(specId: string, label?: string): Promise<string> {
  const specs = await sql`SELECT * FROM residential_specs WHERE id = ${specId}`;
  const spec = specs[0] as { job_id: string } | undefined;
  if (!spec) throw new Error(`Spec ${specId} not found`);

  const finish_groups = await sql`SELECT * FROM finish_groups WHERE spec_id = ${specId} ORDER BY sort_order`;
  const rooms = await sql`SELECT * FROM rooms WHERE spec_id = ${specId} ORDER BY sort_order`;
  const roomIds = (rooms as { id: string }[]).map((r) => r.id);
  const accessories = roomIds.length
    ? await sql`SELECT * FROM room_accessories WHERE room_id IN ${sql(roomIds)}`
    : [];
  const cabinets = await sql`SELECT * FROM cabinet_line_items WHERE spec_id = ${specId} ORDER BY sort_order`;

  const snapshot = JSON.stringify({ finish_groups, rooms, accessories, cabinets });
  const archiveId = uid();
  await sql`INSERT INTO spec_archives (id, spec_id, snapshot, label, created_at) VALUES (${archiveId}, ${specId}, ${snapshot}, ${label ?? ""}, ${new Date().toISOString()})`;
  return archiveId;
}

export async function listArchivesForSpec(specId: string) {
  return await sql`SELECT id, spec_id, label, created_at FROM spec_archives WHERE spec_id = ${specId} ORDER BY created_at DESC`;
}

export async function restoreArchive(archiveId: string): Promise<void> {
  const rows = await sql`SELECT * FROM spec_archives WHERE id = ${archiveId}`;
  const archive = rows[0] as { spec_id: string; snapshot: string } | undefined;
  if (!archive) throw new Error(`Archive ${archiveId} not found`);

  const { spec_id: specId, snapshot } = archive;
  const { finish_groups, rooms, accessories, cabinets } = JSON.parse(snapshot) as {
    finish_groups: Record<string, unknown>[];
    rooms: Record<string, unknown>[];
    accessories: Record<string, unknown>[];
    cabinets: Record<string, unknown>[];
  };

  // Delete current data in reverse dependency order.
  await sql`DELETE FROM cabinet_line_items WHERE spec_id = ${specId}`;
  const currentRooms = await sql`SELECT id FROM rooms WHERE spec_id = ${specId}` as { id: string }[];
  if (currentRooms.length) {
    await sql`DELETE FROM room_accessories WHERE room_id IN ${sql(currentRooms.map((r) => r.id))}`;
  }
  await sql`DELETE FROM rooms WHERE spec_id = ${specId}`;
  await sql`DELETE FROM finish_groups WHERE spec_id = ${specId}`;

  // Re-insert from snapshot.
  if (finish_groups.length) await sql`INSERT INTO finish_groups ${sql(finish_groups)}`;
  if (rooms.length) await sql`INSERT INTO rooms ${sql(rooms)}`;
  if (accessories.length) await sql`INSERT INTO room_accessories ${sql(accessories)}`;
  if (cabinets.length) await sql`INSERT INTO cabinet_line_items ${sql(cabinets)}`;
}

export async function restoreArchive(archiveId: string): Promise<void> {
  const rows = await sql`SELECT * FROM spec_archives WHERE id = ${archiveId}`;
  const archive = rows[0] as { spec_id: string; snapshot: string } | undefined;
  if (!archive) throw new Error(`Archive ${archiveId} not found`);

  const { spec_id: specId, snapshot } = archive;
  const { finish_groups, rooms, accessories, cabinets } = JSON.parse(snapshot) as {
    finish_groups: Record<string, unknown>[];
    rooms: Record<string, unknown>[];
    accessories: Record<string, unknown>[];
    cabinets: Record<string, unknown>[];
  };

  // Delete current data in reverse dependency order.
  await sql`DELETE FROM cabinet_line_items WHERE spec_id = ${specId}`;
  const currentRooms = await sql`SELECT id FROM rooms WHERE spec_id = ${specId}` as { id: string }[];
  if (currentRooms.length) {
    await sql`DELETE FROM room_accessories WHERE room_id IN ${sql(currentRooms.map((r) => r.id))}`;
  }
  await sql`DELETE FROM rooms WHERE spec_id = ${specId}`;
  await sql`DELETE FROM finish_groups WHERE spec_id = ${specId}`;

  // Re-insert from snapshot.
  if (finish_groups.length) await sql`INSERT INTO finish_groups ${sql(finish_groups)}`;
  if (rooms.length) await sql`INSERT INTO rooms ${sql(rooms)}`;
  if (accessories.length) await sql`INSERT INTO room_accessories ${sql(accessories)}`;
  if (cabinets.length) await sql`INSERT INTO cabinet_line_items ${sql(cabinets)}`;
}
