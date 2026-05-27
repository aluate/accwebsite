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
 *   withDbTimeout() — wraps any promise with a JS-level timeout so pages fail
 *                     fast (8 s default) instead of hanging 300 s in PgBouncer's
 *                     internal queue when the connection pool is exhausted.
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
    // max: 1 — Supabase free tier has only ~10 connections total.
    // Each Vercel Lambda is its own process with its own pool.
    // Sequential queries never need more than 1 connection at a time,
    // so max: 1 prevents multiple warm Lambdas from exhausting the pool.
    max: 1,
    // idle_timeout: 2 — release connections to PgBouncer quickly after use,
    // so other Lambda invocations can acquire them.
    idle_timeout: 2,
    // connect_timeout covers only the TCP socket handshake to PgBouncer.
    // It does NOT cover PgBouncer's internal queue wait (when all pool slots
    // are taken, PgBouncer accepts the TCP conn but holds the query in a queue
    // without sending any bytes back). Use withDbTimeout() for end-to-end
    // deadline on individual page/route queries.
    connect_timeout: 10,
    // Required for PgBouncer transaction-mode pooling (Supabase Shared Pooler).
    // Prepared statements are stateful and incompatible with transaction poolers.
    prepare: false,
    // NOTE: Do NOT add `connection: { statement_timeout, lock_timeout }` here.
    // PgBouncer in transaction mode treats connection options as startup parameters
    // and rejects unknown ones, breaking every connection with a 500 error.
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

/**
 * Wrap a DB promise with a JS-level deadline.
 *
 * When Supabase's PgBouncer pool is exhausted it accepts the TCP connection
 * but internally queues the query — no bytes come back to the Lambda, so
 * connect_timeout never fires. This wrapper races the query against a
 * setTimeout so pages throw quickly and Next.js shows the error boundary
 * instead of hanging for Vercel's 300-second Lambda timeout.
 *
 * Default: 9 000 ms (leaves a margin before Vercel's 10 s hobby limit).
 */
export async function withDbTimeout<T>(promise: Promise<T>, ms = 9000): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Database timed out after ${ms / 1000}s — pool may be busy`)),
      ms,
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

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
