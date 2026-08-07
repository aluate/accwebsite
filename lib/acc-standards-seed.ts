/**
 * ACC shop standards — the seeding half. Server only.
 *
 * Split from lib/acc-standards.ts because that file is imported by
 * components/ResidentialSpecClient.tsx, which is a "use client" component.
 * Anything reachable from there gets bundled for the browser, and `postgres`
 * cannot be. So: constants live in acc-standards.ts, database writes live here.
 */
import { sql, uid } from "@/lib/db";
import {
  ACC_HARDWARE_STANDARDS,
  ACC_STANDARD_DRAWER_SLIDE,
  ACC_STANDARD_ROLLOUT_SLIDE,
} from "@/lib/acc-standards";

// ── Seeding ──────────────────────────────────────────────────────────────────
//
// Every function below fills BLANKS ONLY.
//
// The guards are per-role, which is the whole point. The version this replaced
// counted rows across the entire table for a finish group, so once door_pulls and
// drawer_pulls had been seeded from pull_id the count was no longer zero and
// hinges could never be seeded afterwards. Since role='hinges' is one of the five
// fields validateForRelease() demands, that single off-by-scope bug meant no spec
// in the system could reach RELEASED_TO_ENG.
//
// "A row exists for this role" counts as a decision already made, even when the
// value in it is null. That is how someone deliberately choosing "None" survives
// the next save.

export async function seedHardwareRole(
  fgId: string,
  role: string,
  hardwareId: string,
  sortOrder: number,
): Promise<boolean> {
  const cnt = await sql`
    SELECT COUNT(*) AS c FROM finish_group_hardware
    WHERE finish_group_id = ${fgId} AND role = ${role}
  `;
  if (Number((cnt[0] as { c: string | number }).c) > 0) return false;
  await sql`
    INSERT INTO finish_group_hardware (id, finish_group_id, role, hardware_id, sort_order)
    VALUES (${uid()}, ${fgId}, ${role}, ${hardwareId}, ${sortOrder})
  `;
  return true;
}

/**
 * finish_group_drawers carries two independent fields on one row — drawer_box_id
 * and slides_id — so each is backfilled separately rather than skipping the whole
 * row because the other one happens to be set.
 *
 * slides_id is the reason this exists. Nothing in the mounted app ever wrote it
 * (only the Schedules tab, which is imported nowhere), and the release gate
 * requires it, so every spec failed on "drawer slides" regardless of what the PM
 * filled in.
 */
export async function seedDrawerRow(
  fgId: string,
  role: string,
  boxId: string | null,
  slidesId: string,
  sortOrder: number,
): Promise<void> {
  const rows = await sql`
    SELECT id, drawer_box_id, slides_id FROM finish_group_drawers
    WHERE finish_group_id = ${fgId} AND role = ${role}
    ORDER BY sort_order, id
  ` as unknown as { id: string; drawer_box_id: string | null; slides_id: string | null }[];
  const row = rows[0];

  if (!row) {
    await sql`
      INSERT INTO finish_group_drawers
        (id, finish_group_id, role, drawer_box_id, slides_id, sort_order)
      VALUES (${uid()}, ${fgId}, ${role}, ${boxId}, ${slidesId}, ${sortOrder})
    `;
    return;
  }
  if (!row.drawer_box_id && boxId) {
    await sql`UPDATE finish_group_drawers SET drawer_box_id = ${boxId} WHERE id = ${row.id}`;
  }
  if (!row.slides_id) {
    await sql`UPDATE finish_group_drawers SET slides_id = ${slidesId} WHERE id = ${row.id}`;
  }
}

export type SeedFgInput = {
  /** finish_groups.drawer_box_id — the PM's choice, not a standard. */
  drawerBoxId?: string | null;
  /** finish_groups.rollout_box_id. Absent means this group has no rollouts. */
  rolloutBoxId?: string | null;
  /** finish_groups.pull_id — a real per-job choice, so it is never defaulted. */
  pullId?: string | null;
};

/**
 * Brings one finish group up to the ACC baseline. Safe to call on every save:
 * idempotent, and it only ever writes into a blank.
 *
 * Each write is individually guarded so a single failure (a bad catalog id, a
 * constraint added later) degrades to "that one field stays blank" rather than
 * failing the caller's save.
 */
export async function seedAccStandards(fgId: string, input: SeedFgInput): Promise<void> {
  const { drawerBoxId = null, rolloutBoxId = null, pullId = null } = input;

  for (const std of ACC_HARDWARE_STANDARDS) {
    // Non-always standards are feature-conditional. Today that is rollouts only.
    if (!std.always && !rolloutBoxId) continue;
    try {
      await seedHardwareRole(fgId, std.role, std.hardware_id, std.sort_order);
    } catch { /* leave the field blank rather than fail the save */ }
  }

  // Pulls ARE a per-job choice, so they come from the finish group, not a standard.
  // Now that the guard is per-role these no longer block the standards above.
  if (pullId) {
    try { await seedHardwareRole(fgId, "door_pulls", pullId, 3); } catch { /* skip */ }
    try { await seedHardwareRole(fgId, "drawer_pulls", pullId, 4); } catch { /* skip */ }
  }

  try {
    await seedDrawerRow(fgId, "drawer_box", drawerBoxId, ACC_STANDARD_DRAWER_SLIDE, 0);
  } catch { /* skip */ }

  // A rollout row on a job with no rollouts becomes a phantom line on the work
  // order, so this one waits until the group says it has them.
  if (rolloutBoxId) {
    try {
      await seedDrawerRow(fgId, "rollout", rolloutBoxId, ACC_STANDARD_ROLLOUT_SLIDE, 1);
    } catch { /* skip */ }
  }
}
