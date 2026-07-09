/**
 * lib/db.ts — Postgres client (replaces better-sqlite3).
 *
 * Uses the `postgres` npm package (tagged template literals).
 * Connection string comes from DATABASE_URL env var.
 *
 * Exports:
 *   sql            — tagged template function for all queries
 *   uid()          — random hex ID generator
 *   nextJobId()    — async, atomically increments seq table, returns ACC-YYYY-NNNN
 *   withDbTimeout() — race a DB call against a timeout to avoid Lambda hangs
 */
import postgres from "postgres";
import { randomBytes } from "crypto";

// Lazy-init: don't throw at module load (breaks Next.js build-time evaluation).
// The error surfaces on first query instead.
function createSql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL env var is not set");
  return postgres(url, {
    ssl: url.includes("localhost") || url.includes("127.0.0.1") ? false : "require",
    // max: 1 — Supabase free tier has only ~10 connections total.
    // Each Vercel Lambda is its own process with its own pool.
    // Sequential queries never need more than 1 connection at a time,
    // so max: 1 prevents multiple warm Lambdas from exhausting the pool.
    max: 1,
    // idle_timeout: 2 — release connections to PgBouncer quickly after use,
    // so other Lambda invocations can acquire them. 20s idle keeps connections
    // tied up unnecessarily across requests.
    idle_timeout: 2,
    connect_timeout: 10,  // fail fast if PgBouncer pool is exhausted
    // Required for PgBouncer transaction-mode pooling (Supabase Shared Pooler).
    // Prepared statements are stateful and incompatible with transaction poolers.
    prepare: false,
    // NOTE: Do NOT add `connection: { statement_timeout, lock_timeout }` here.
    // PgBouncer in transaction mode treats connection options as startup parameters
    // and rejects unknown ones, breaking every connection with a 500 error.
  });
}

// In dev, Next.js hot-reloads modules on every file save — re-running this
// module creates a new postgres client and abandons the old one without closing
// it. Over a testing session with many reloads the leaked connections pile up
// until Supabase hits its limit and starts rejecting new ones.
//
// Fix: stash the client on `global` so it survives HMR cycles. In production
// (Vercel Lambdas) each process is fresh anyway, so this has no effect there.
declare global {
  // eslint-disable-next-line no-var
  var __pgClient: ReturnType<typeof postgres> | undefined;
}

function getSql() {
  if (!global.__pgClient) global.__pgClient = createSql();
  return global.__pgClient;
}

// Proxy so existing `sql` tagged-template call sites work unchanged.
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

/**
 * withDbTimeout — wraps a DB operation in a race against a timeout.
 * Prevents Vercel Lambda from hanging silently until the 10s hard kill.
 * Default: 8 seconds (leaves headroom for the Lambda to return a proper error).
 */
export async function withDbTimeout<T>(
  fn: () => Promise<T>,
  ms = 8000
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`DB query timed out after ${ms}ms`)),
      ms
    );
  });
  try {
    return await Promise.race([fn(), timeout]);
  } finally {
    clearTimeout(timer);
  }
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
