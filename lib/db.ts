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

// Lazy-init: don't throw at module load (breaks Next.js build-time evaluation).
// The error surfaces on first query instead.
function createSql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL env var is not set");
  return postgres(url, {
    ssl: "require",
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    // Required for PgBouncer transaction-mode pooling (Supabase Shared Pooler).
    // Prepared statements are stateful and incompatible with transaction poolers.
    prepare: false,
  });
}

let _sql: ReturnType<typeof postgres> | null = null;
function getSql() {
  if (!_sql) _sql = createSql();
  return _sql;
}

// Proxy so existing `sql\`...\`` call sites work unchanged.
const sql = new Proxy(getSql as unknown as ReturnType<typeof postgres>, {
  get(_t, prop) {
    const s = getSql();
    const val = (s as unknown as Record<string|symbol, unknown>)[prop];
    return typeof val === "function" ? val.bind(s) : val;
  },
  apply(_t, _thisArg, args) {
    return (getSql() as unknown as (...a: unknown[]) => unknown)(...args);
  },
}) as ReturnType<typeof postgres>;

export default sql;
export { sql };

export function uid(): string {
  return randomBytes(8).toString("hex");
}

export async function nextJobId(): Promise<{ id: string; seq: number }> {
  const [row] = await sql`
    UPDATE seq SET val = val + 1 WHERE id = 1 RETURNING val
  `;
  const seq = row.val as