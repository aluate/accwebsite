/**
 * lib/job-id.ts — a job has two names, and either one should find it.
 *
 * WHY THIS FILE EXISTS.
 *
 * `jobs.id` is the internal key (ACC-2026-0181) and `jobs.job_number` is the
 * five-digit TradeSoft number a person actually says out loud (26401). Links in
 * the app are built from the job number, so nearly every URL under /jobs/ and
 * /api/jobs/ arrives holding a number, not an id.
 *
 * CLAUDE.md has said for months that every handler must resolve one to the
 * other on the way in. Most do. These did not:
 *
 *   /jobs/[id]/edit      — SELECT * FROM jobs WHERE id = $1   → 404 on every
 *   /jobs/[id]/trim        job reached from the job page, which is every job,
 *   /jobs/[id]/doors       because the link carries the number.
 *   /installer/jobs/[id]
 *   /api/jobs/[id]/gate-checkin
 *   /api/jobs/[id]/engineering-release  — the release to engineering itself.
 *
 * Each of the handlers that got it right wrote its own copy of the same two
 * lines, which is how the ones that got it wrong went unnoticed. One function
 * now, so "which name is this?" is answered in a single place.
 */

import { sql } from "@/lib/db";

/**
 * The internal job id for either name, or null when there is no such job.
 *
 * Takes the raw URL parameter. Safe to call with an id — it matches itself.
 */
export async function resolveJobId(idOrNumber: string): Promise<string | null> {
  if (!idOrNumber) return null;
  const [row] = (await sql`
    SELECT id FROM jobs WHERE id = ${idOrNumber} OR job_number = ${idOrNumber} LIMIT 1
  `) as Array<{ id: string }>;
  return row?.id ?? null;
}

/**
 * The whole job row by either name, or null.
 *
 * For the handlers that go straight on to read the job — one query instead of
 * a resolve followed by a select.
 */
export async function loadJob<T = Record<string, unknown>>(idOrNumber: string): Promise<T | null> {
  if (!idOrNumber) return null;
  const [row] = (await sql`
    SELECT * FROM jobs WHERE id = ${idOrNumber} OR job_number = ${idOrNumber} LIMIT 1
  `) as unknown as T[];
  return row ?? null;
}
