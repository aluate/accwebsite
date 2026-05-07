/**
 * Operational health check for Supabase Postgres deployment.
 *
 *   npm run health           # human-readable summary
 *   npm run health -- --json # machine-readable
 */
import { sql } from "./_db.mjs";

const jsonMode = process.argv.includes("--json");
const out = {};
const issues = [];

function add(name, value, status = "ok", note = "") {
  out[name] = { value, status, note };
  if (status !== "ok") console.warn(`  [${status}] ${name}: ${note || value}`);
}

try {
  const [r] = await sql`SELECT COUNT(*) AS n FROM jobs`;
  add("jobs_count", Number(r.n));
} catch (e) {
  add("jobs_count", String(e.message), "fail");
  issues.push("Cannot query jobs table");
}

try {
  const [r] = await sql`SELECT COUNT(*) AS n FROM residential_specs`;
  add("specs_count", Number(r.n));
} catch (e) {
  add("specs_count", String(e.message), "fail");
}

try {
  const [r] = await sql`SELECT COUNT(*) AS n FROM finish_groups WHERE carcass_id IS NULL OR drawer_box_id IS NULL OR edgeband_id IS NULL`;
  add("orphan_finish_groups", Number(r.n), Number(r.n) > 0 ? "warn" : "ok",
    Number(r.n) > 0 ? `${r.n} finish_groups missing carcass/drawer/edgeband — the $70k canary` : "");
  if (Number(r.n) > 0) issues.push(`${r.n} orphan finish_groups`);
} catch (e) {
  add("orphan_finish_groups", String(e.message), "warn");
}

try {
  const rows = await sql`SELECT lifecycle_state, COUNT(*) AS n FROM residential_specs GROUP BY lifecycle_state ORDER BY n DESC`;
  add("lifecycle_distribution", rows.map((r) => `${r.lifecycle_state}:${r.n}`).join(", ") || "empty");
} catch (e) {
  add("lifecycle_distribution", String(e.message), "warn");
}

try {
  const [r] = await sql`SELECT MAX(updated_at) AS last FROM residential_specs`;
  add("last_spec_save", r?.last ?? "never");
} catch (e) {
  add("last_spec_save", String(e.message), "warn");
}

try {
  const [r] = await sql`SELECT COUNT(*) AS n FROM admin_sessions WHERE expires_at > NOW()`;
  add("active_admin_sessions", Number(r.n));
} catch (e) {
  add("active_admin_sessions", String(e.message), "warn");
}

if (jsonMode) {
  console.log(JSON.stringify(out, null, 2));
} else {
  console.log("\n── ACC Health Check ──────────────────────────");
  for (const [k, v] of Object.entries(out)) {
    const icon = v.status === "ok" ? "✓" : v.status === "warn" ? "⚠" : "✗";
    console.log(`  ${icon} ${k}: ${v.value}${v.note ? "  ← " + v.note : ""}`);
  }
  console.log("─────────────────────────────────────────────");
  if (issues.length) {
    console.log(`\n${issues.length} issue(s):\n  ` + issues.join("\n  "));
    process.exitCode = 1;
  } else {
    console.log("\nAll checks passed.");
  }
}

await sql.end();
