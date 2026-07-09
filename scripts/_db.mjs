/**
 * Shared Postgres connection for scripts. Loads .env.local automatically.
 * Usage: import { sql } from "./_db.mjs";
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "..", ".env.local");

// Load .env.local manually (scripts run outside Next.js)
try {
  const raw = readFileSync(envPath, "utf-8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
} catch {
  // .env.local not present — rely on actual env vars being set
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Check .env.local or set the env var.");
  process.exit(1);
}

export const sql = postgres(process.env.DATABASE_URL, {
  ssl: process.env.DATABASE_URL?.includes("localhost") || process.env.DATABASE_URL?.includes("127.0.0.1") ? false : "require",
  max: 3,
  idle_timeout: 10,
  connect_timeout: 15,
});
