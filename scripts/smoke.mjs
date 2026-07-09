/**
 * ACC Website deployed-build smoke test.
 *
 *   node scripts/smoke.mjs <base-url>
 *   npm run smoke -- https://accwebsite-staging.vercel.app
 *
 * Hits a DEPLOYED build (the staging preview URL) and checks the critical
 * field-facing paths actually respond. This is the layer that catches bugs
 * that only appear on deploy — environment differences, missing env vars,
 * build-time breakage — BEFORE they reach the live phone app.
 *
 * Dependency-free: uses built-in fetch (Node 18+). No browser, no framework.
 * It checks reachability + basic shape, not pixel-perfect UI. Pair it with a
 * real phone test of the same URL.
 *
 * Exit code is non-zero if any check FAILs, so it can gate a handoff.
 */

const base = (process.argv[2] || process.env.SMOKE_BASE_URL || "").replace(/\/$/, "");
if (!base) {
  console.error("Usage: node scripts/smoke.mjs <base-url>");
  console.error("   e.g. node scripts/smoke.mjs https://accwebsite-staging.vercel.app");
  process.exit(2);
}

const results = [];
const TIMEOUT_MS = 15000;

async function get(path) {
  const url = base + path;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: "manual" });
    const body = res.status >= 200 && res.status < 400 ? await res.text().catch(() => "") : "";
    return { status: res.status, body, headers: res.headers };
  } finally {
    clearTimeout(t);
  }
}

async function check(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, status: "PASS", detail: detail || "" });
  } catch (err) {
    results.push({ name, status: "FAIL", detail: String(err.message || err) });
  }
}

function ok(cond, msg) {
  if (!cond) throw new Error(msg);
}

// ── critical field paths ──────────────────────────────────────────────────────

await check("home page reachable", async () => {
  const r = await get("/");
  ok(r.status >= 200 && r.status < 400, `home returned ${r.status}`);
  return `status ${r.status}`;
});

await check("home is mobile-ready (viewport meta present)", async () => {
  const r = await get("/");
  ok(/<meta[^>]+name=["']viewport["']/i.test(r.body), "no viewport meta tag — mobile layout will break");
  return "viewport meta found";
});

await check("login page reachable", async () => {
  const r = await get("/login");
  ok(r.status >= 200 && r.status < 400, `/login returned ${r.status}`);
  return `status ${r.status}`;
});

await check("health endpoint responds", async () => {
  // health.mjs exists as a script; if there's an HTTP health route it should answer.
  const r = await get("/api/health");
  ok(r.status !== 0, "no response from /api/health");
  // 404 is acceptable if no such route — we only fail on a server error.
  ok(r.status < 500, `/api/health returned server error ${r.status}`);
  return `status ${r.status}`;
});

await check("no 5xx on jobs/schedule entry points", async () => {
  // These may redirect to /login when unauthenticated — that's fine (3xx/2xx).
  for (const p of ["/jobs", "/schedule", "/dashboard"]) {
    const r = await get(p);
    ok(r.status < 500, `${p} returned server error ${r.status}`);
  }
  return "no 5xx on jobs/schedule/dashboard";
});

// ── report ────────────────────────────────────────────────────────────────────

const pad = Math.max(...results.map((r) => r.name.length));
let failed = 0;
for (const r of results) {
  if (r.status === "FAIL") failed++;
  console.log(`${r.status === "PASS" ? "PASS" : "FAIL"}  ${r.name.padEnd(pad)}  ${r.detail}`);
}
console.log(`\n${results.length - failed}/${results.length} passed against ${base}`);
process.exit(failed > 0 ? 1 : 0);
