#!/usr/bin/env node
/**
 * check-route-auth.mjs — fail the build if an API route handler has no auth guard.
 *
 * Why this exists:
 *
 * An audit on 2026-08-08 found 24 routes accepting writes with no authentication of
 * any kind. Among them: /api/admin/builders, where an unauthenticated POST created
 * an account with role "admin" and an unauthenticated PATCH reset any existing
 * account's password. Also /api/send-digest, which took `to`, `subject` and `body`
 * from the request and sent the mail — an open relay on the company Gmail.
 *
 * Fixing those 24 is a one-time job. Keeping the 25th from happening is this script.
 * A guard that is only ever applied by hand gets forgotten exactly once, and the
 * failure is silent: the route works perfectly, for everybody, including strangers.
 *
 *   node scripts/check-route-auth.mjs           # exits 1 on any unguarded handler
 *   node scripts/check-route-auth.mjs --list    # print the full inventory
 *
 * Adding a genuinely public route means adding it to PUBLIC below WITH a reason.
 * That is the point: it forces the decision to be written down and reviewed, rather
 * than inferred later from the absence of a guard.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, sep } from "node:path";

const API_DIR = "app/api";

/**
 * Routes that must stay reachable without a session, each with the reason it is
 * safe. Anything not listed here needs a guard.
 */
const PUBLIC = {
  "/admin/login":        "issues the admin session; checks ADMIN_PASSWORD itself",
  "/admin/logout":       "clears a cookie",
  "/auth/login":         "issues a session; verifies the password itself",
  "/auth/logout":        "clears a cookie",
  "/login":              "issues a session; verifies the password itself",
  "/express/login":      "issues a session; verifies the password itself",
  "/express/logout":     "clears a cookie",
  "/portal/auth/login":  "issues a client-portal session; verifies the password itself",
  "/portal/auth/logout": "clears a cookie",
  "/contact":            "public website contact form",
  "/docusign/webhook":   "third-party callback; verifies the DocuSign signature",
  "/docusign/callback":  "OAuth consent redirect target; reads no data and only 302s to /admin",
  "/signoffs/[token]":   "client signs without an account; the token IS the credential",
  "/internal/vercel-log-drain": "Vercel callback; verifies VERCEL_LOG_DRAIN_SECRET",
};

/**
 * Any of these appearing inside a handler counts as a guard.
 *
 * This is a text match, which makes it a smoke alarm rather than a proof. It cannot
 * tell whether the result was actually checked: `await getBuilder()` followed by no
 * null test would pass here and protect nothing. It catches the failure that
 * actually happens — a handler with no auth code in it at all — and it is cheap
 * enough to run on every push, which a stricter analysis would not be.
 *
 * Prefer guardApi(): it returns the status and message ready to hand back, so there
 * is nothing to forget to check.
 */
const GUARDS = [
  "guardApi(",              // preferred
  "requireBuilderApi(",     // auth-only, no role
  "getBuilder(",            // hand-rolled: `const s = await getBuilder(); if (!s) ...`
  "requireBuilder(",        // works, but redirects — wrong shape for an API route
  "requireRole(",
  "requireKarl(",
  "requireAdmin(",
  "requirePortalUser(",
  "requirePortalAccessToJob(",
  "CRON_SECRET",
  "VERCEL_LOG_DRAIN_SECRET",
];

const HANDLER = /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\s*\(/g;

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (e === "route.ts") out.push(p);
  }
  return out;
}

const files = walk(API_DIR).sort();
const unguarded = [];
const staleAllowlist = new Set(Object.keys(PUBLIC));
let handlerCount = 0, guardedCount = 0;

for (const file of files) {
  const route = "/" + file.split(sep).slice(2, -1).join("/");
  const src = readFileSync(file, "utf8");
  staleAllowlist.delete(route);

  // Body of each handler = from its opening paren to the start of the next handler.
  const starts = [...src.matchAll(HANDLER)];
  for (let i = 0; i < starts.length; i++) {
    handlerCount++;
    const method = starts[i][1];
    const body = src.slice(starts[i].index, starts[i + 1]?.index ?? src.length);
    const guarded = GUARDS.some((g) => body.includes(g));
    if (guarded) { guardedCount++; continue; }
    if (route in PUBLIC) continue;
    unguarded.push({ route, method, file });
  }
}

if (process.argv.includes("--list")) {
  for (const f of files) console.log("  " + "/" + f.split(sep).slice(2, -1).join("/"));
}

console.log(`Scanned ${files.length} routes, ${handlerCount} handlers — ${guardedCount} guarded, ${Object.keys(PUBLIC).length} intentionally public.`);

// An allowlist entry for a route that no longer exists is a trap: it silently
// pre-approves whatever gets created at that path later.
if (staleAllowlist.size) {
  console.error(`\nPUBLIC lists ${staleAllowlist.size} route(s) that no longer exist — remove them:`);
  for (const r of staleAllowlist) console.error(`  ${r}`);
}

if (unguarded.length) {
  console.error(`\nFAIL — ${unguarded.length} handler(s) with no auth guard:\n`);
  for (const u of unguarded) console.error(`  ${u.method.padEnd(6)} ${u.route}`);
  console.error(`\nAdd a guard:`);
  console.error(`  const guard = await guardApi(["admin", "pm"]);`);
  console.error(`  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });`);
  console.error(`\nOr, if the route is genuinely public, add it to PUBLIC in this file with a reason.`);
  process.exit(1);
}

if (staleAllowlist.size) process.exit(1);

console.log("OK — every handler is guarded or explicitly public.");
