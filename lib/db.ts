/**
 * lib/db.ts — Postgres client (replaces better-sqlite3).
 *
 * Uses the `postgres` npm package (tagged template literals).
 * Connection string comes from DATABASE_URL env var.
 *
 * Exports:
 *   sql        — tagged template function for all queries
 *   uid()      — random hex ID generator
 *   nextJobId() — async, atomically increments seq table, returns ACC-YYYY-NNNN
 */
import postgres from "postgres";
import { randomBytes } from "crypto";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL env var is not set");

const sql = postgres(DATABASE_URL, {
  ssl: "require",
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  // Supabase prepended-project-ref format: postgres.PROJECT_REF
  // Direct format:  postgresql://postgres:PW@db.REF.supabase.co:5432/postgres
});

export default sql;
export { sql };

export function uid(): string {
  return randomBytes(8).toString("hex");
}

export async function nextJobId(): Promise<{ id: string; seq: number }> {
  const [row] = await sql`
    UPDATE seq SET val = val + 1 WHERE id = 1 RETURNING val
  `;
  const seq = row.val as number;
  const year = new Date().getFullYear();
  return {
    id: `ACC-${year}-${String(seq).padStart(4, "0")}`,
    seq,
  };
}
