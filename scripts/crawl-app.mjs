#!/usr/bin/env node
/**
 * crawl-app.mjs — open every screen, press every button, write down what broke.
 *
 * WHY. "Does this button work?" has only ever been answered by someone clicking
 * it, which means it gets answered for the three screens a person happens to
 * visit and not for the other forty. A page can 200 and still be broken: the
 * request behind the button 500s, a required field is missing from the payload,
 * a handler throws in the console and the row silently does not save. So this
 * walks the app the way a person would and records what the person would not
 * see — the console errors, the failed requests, and which control caused them.
 *
 * It runs against a LOCAL build with the filesystem storage driver and no mail
 * credentials, so nothing it presses can reach a client. It refuses to run
 * against anything that is not localhost.
 *
 *   node scripts/crawl-app.mjs
 *   node scripts/crawl-app.mjs --only /jobs,/pipeline
 *   node scripts/crawl-app.mjs --buttons            # also press things
 *   node scripts/crawl-app.mjs --buttons --destructive
 *
 * By default it loads pages and presses nothing. --buttons presses the controls
 * it judges safe; --destructive adds the ones that send, release, advance or
 * delete. The judgement is by label, and it is deliberately cautious: anything
 * it cannot read confidently is treated as destructive and skipped.
 *
 * Output: crawl-report.md and crawl-report.json in the repo root.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";

/**
 * Playwright is a test-only dependency and is often installed globally rather
 * than into the repo, and ESM does not consult NODE_PATH. So resolve it either
 * way instead of failing with a bare "cannot find package".
 */
const require_ = createRequire(import.meta.url);
let chromium;
for (const spec of ["playwright", "playwright-core",
  `${process.env.PLAYWRIGHT_HOME || "/home/claude/.npm-global/lib/node_modules"}/playwright`]) {
  try { ({ chromium } = require_(spec)); break; } catch { /* try the next one */ }
}
if (!chromium) {
  console.error("\nPlaywright is not installed. Either:");
  console.error("  npm install --no-save playwright");
  console.error("  (or set PLAYWRIGHT_HOME to the directory holding a global install)\n");
  process.exit(1);
}

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };

const BASE = (process.env.BASE_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
if (!/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(BASE)) {
  console.error(`\nBASE_URL is ${BASE}. This crawler presses buttons; it only runs against localhost.\n`);
  process.exit(1);
}

const PRESS = flag("--buttons");
const DESTRUCTIVE = flag("--destructive");
const JOB = opt("--job", "90001");
const ONLY = opt("--only", "").split(",").map((s) => s.trim()).filter(Boolean);
const USER = process.env.CRAWL_USER || "residential@advancedcabinets.net";
const PASS = process.env.CRAWL_PASS || "Acc2026!";

/* ───────────────────────────── the routes ───────────────────────────── */

const ROUTES = [
  ["/", "public home"],
  ["/dashboard", "dashboard"],
  ["/pm-dashboard", "PM dashboard"],
  ["/jobs", "job inbox"],
  ["/jobs/new", "new job"],
  [`/jobs/${JOB}`, "job detail"],
  [`/jobs/${JOB}/edit`, "job edit"],
  [`/jobs/${JOB}/residential`, "residential spec"],
  [`/jobs/${JOB}/trim`, "trim spec"],
  [`/jobs/${JOB}/doors`, "door spec"],
  [`/jobs/${JOB}/schedule`, "job schedule"],
  ["/jobs/pm-hours", "PM hours"],
  ["/schedule", "schedule wall"],
  ["/schedule/verify", "schedule verify"],
  ["/punch", "punch list"],
  ["/warranty", "warranty"],
  ["/search", "search"],
  ["/engineer", "engineering queue"],
  ["/installer", "installer"],
  ["/admin", "admin index"],
  ["/admin/pipeline", "pipeline"],
  ["/admin/notifications", "automated emails"],
  ["/admin/accessories", "accessory catalog"],
  ["/admin/builders", "builder accounts"],
  ["/admin/builder-companies", "builder companies"],
  ["/admin/builder-profiles", "builder profiles"],
  ["/admin/portal-accounts", "portal accounts"],
  ["/admin/documents", "template documents"],
  ["/admin/libraries", "libraries"],
  ["/admin/catalog-review", "catalog review"],
  ["/admin/edgeband-matches", "edgeband matches"],
  ["/admin/palettes", "palettes"],
  ["/admin/constraints", "constraints"],
  ["/admin/permissions", "permissions"],
  ["/admin/leads", "leads"],
  ["/admin/bugs", "bugs"],
  ["/admin/billing", "billing"],
  ["/admin/estimating", "estimating"],
  ["/admin/estimating/settings", "estimating settings"],
  ["/admin/schedule", "admin schedule"],
  ["/admin/floor-plans", "floor plans"],
];

/* ─────────────────── which controls are safe to press ───────────────── */

/**
 * Cautious on purpose. A control is pressed only when its label reads as a
 * navigation or a disclosure; anything that sends, releases, advances, deletes,
 * approves or pays is left alone unless --destructive, and so is anything whose
 * label is empty or unreadable — an icon-only button could be either.
 */
const DESTRUCTIVE_WORDS = /\b(delete|remove|clear|wipe|reset|archive|send|email|release|advance|approve|reject|sign|submit|pay|invoice|void|cancel|generate|regenerate|sync|push|import|upload|save|create|add|duplicate|merge|promote|complete|finish|confirm|apply|seed|run)\b/i;
const SAFE_WORDS = /\b(view|open|show|hide|details|expand|collapse|next|prev|previous|back|close|filter|sort|search|tab|print|preview|refresh|reload|help|about|toggle|all|today|week|month)\b/i;

function classify(label) {
  const text = (label || "").trim();
  if (!text) return "unreadable";
  if (DESTRUCTIVE_WORDS.test(text)) return "destructive";
  if (SAFE_WORDS.test(text)) return "safe";
  return "unreadable";
}

/* ─────────────────────────────── run ────────────────────────────────── */

const findings = [];
const note = (route, kind, detail, extra = {}) =>
  findings.push({ route, kind, detail, ...extra });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium",
  args: ["--no-proxy-server", "--no-sandbox"],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

// Sign in through the API so the crawl starts authenticated.
const login = await context.request.post(`${BASE}/api/login`, { data: { username: USER, password: PASS } });
if (!login.ok()) {
  console.error(`\nCould not sign in as ${USER} (${login.status()}). Seed accounts first:`);
  console.error("  node scripts/seed-admin-accounts.mjs\n");
  await browser.close();
  process.exit(1);
}
console.log(`signed in as ${USER}\n`);

const page = await context.newPage();

/** Per-page collectors, reset before each navigation. */
let consoleErrors = [];
let pageErrors = [];
let badResponses = [];

page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text().slice(0, 300));
});
page.on("pageerror", (e) => pageErrors.push(String(e.message).slice(0, 300)));
page.on("response", (r) => {
  const s = r.status();
  if (s >= 400) badResponses.push(`${s} ${r.request().method()} ${r.url().replace(BASE, "")}`);
});

const reset = () => { consoleErrors = []; pageErrors = []; badResponses = []; };
const settle = async (ms = 900) => { await page.waitForTimeout(ms); };

const routes = ONLY.length ? ROUTES.filter(([p]) => ONLY.some((o) => p.startsWith(o))) : ROUTES;
const pageResults = [];

for (const [route, label] of routes) {
  reset();
  let status = 0;
  let failed = null;
  try {
    const res = await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 30000 });
    status = res?.status() ?? 0;
    await settle();
  } catch (e) {
    failed = String(e.message).split("\n")[0];
  }

  const landed = page.url().replace(BASE, "");
  const redirected = landed !== route;

  if (failed) note(route, "page-load", failed);
  if (status >= 400) note(route, "page-status", `${status} on ${route}`);
  for (const e of pageErrors) note(route, "uncaught", e);
  for (const e of consoleErrors) note(route, "console", e);
  for (const r of badResponses) note(route, "request", r);

  // What is on the page to press.
  let controls = [];
  try {
    controls = await page.$$eval(
      "button:not([disabled]), [role=button]:not([aria-disabled=true]), a[href^='/']",
      (els) => els.slice(0, 120).map((el) => ({
        tag: el.tagName.toLowerCase(),
        label: (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60),
        href: el.getAttribute("href") || null,
        visible: !!(el.offsetParent || el.getClientRects().length),
      })).filter((c) => c.visible),
    );
  } catch { /* a page that failed to load has no controls */ }

  const buttons = controls.filter((c) => c.tag !== "a");
  const pressable = buttons.map((b) => ({ ...b, verdict: classify(b.label) }));

  const result = {
    route, label, status, landed, redirected,
    controls: controls.length,
    buttons: buttons.length,
    safe: pressable.filter((b) => b.verdict === "safe").length,
    destructive: pressable.filter((b) => b.verdict === "destructive").length,
    unreadable: pressable.filter((b) => b.verdict === "unreadable").length,
    pressed: [],
  };

  /* ───────────────── press the buttons, one at a time ───────────────── */

  if (PRESS && !failed && status < 400) {
    const wanted = pressable.filter((b) =>
      b.verdict === "safe" || (DESTRUCTIVE && b.verdict === "destructive"));

    for (const b of wanted) {
      reset();
      let outcome = "ok";
      try {
        // Re-find by label each time: the previous press may have re-rendered.
        const target = page.getByRole("button", { name: b.label, exact: false }).first();
        if (!(await target.count())) { outcome = "gone after an earlier press"; }
        else {
          await target.click({ timeout: 4000, noWaitAfter: true });
          await settle(700);
        }
      } catch (e) {
        outcome = String(e.message).split("\n")[0].slice(0, 160);
      }

      const trouble = [
        ...pageErrors.map((m) => `uncaught: ${m}`),
        ...badResponses.map((m) => `request: ${m}`),
        ...consoleErrors.map((m) => `console: ${m}`),
      ];
      result.pressed.push({ label: b.label, outcome, trouble });
      for (const t of trouble) note(route, "on-press", t, { control: b.label });
      if (outcome !== "ok" && !/gone after/.test(outcome)) {
        note(route, "press-failed", outcome, { control: b.label });
      }

      // Back to a known state before the next one.
      if (page.url().replace(BASE, "") !== route) {
        try { await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 20000 }); await settle(500); }
        catch { break; }
      }
    }
  }

  pageResults.push(result);
  const flagCount = findings.filter((f) => f.route === route).length;
  console.log(
    `${String(status).padStart(3)} ${route.padEnd(34)} ` +
    `${String(result.buttons).padStart(3)} buttons` +
    (PRESS ? `, ${String(result.pressed.length).padStart(2)} pressed` : "") +
    (flagCount ? `   ⚠ ${flagCount}` : ""),
  );
}

await browser.close();

/* ───────────────────────────── the report ───────────────────────────── */

const byKind = {};
for (const f of findings) (byKind[f.kind] ??= []).push(f);

const md = [];
md.push(`# Crawl report`);
md.push("");
md.push(`${new Date().toISOString()} · ${BASE} · ${routes.length} routes · ` +
        `${PRESS ? (DESTRUCTIVE ? "pressed safe and destructive controls" : "pressed safe controls only") : "pages loaded, nothing pressed"}`);
md.push("");

md.push(`## What broke`);
md.push("");
if (!findings.length) {
  md.push("Nothing. Every route loaded and nothing logged an error.");
} else {
  const order = ["page-load", "page-status", "uncaught", "request", "press-failed", "on-press", "console"];
  const title = {
    "page-load": "Pages that would not load",
    "page-status": "Pages that answered with an error status",
    "uncaught": "Uncaught exceptions",
    "request": "Failed requests on load",
    "press-failed": "Buttons that could not be pressed",
    "on-press": "Errors caused by pressing something",
    "console": "Console errors",
  };
  for (const kind of order) {
    const rows = byKind[kind];
    if (!rows?.length) continue;
    md.push(`### ${title[kind]} (${rows.length})`);
    md.push("");
    const seen = new Set();
    for (const r of rows) {
      const key = `${r.route}|${r.control ?? ""}|${r.detail}`;
      if (seen.has(key)) continue;
      seen.add(key);
      md.push(`- \`${r.route}\`${r.control ? ` — **${r.control}**` : ""} — ${r.detail}`);
    }
    md.push("");
  }
}

md.push(`## Every route`);
md.push("");
md.push("| Route | Status | Landed | Buttons | Safe | Destructive | Unreadable | Pressed |");
md.push("|---|---|---|---|---|---|---|---|");
for (const r of pageResults) {
  md.push(`| \`${r.route}\` | ${r.status} | ${r.redirected ? `\`${r.landed}\`` : "—"} | ${r.buttons} | ${r.safe} | ${r.destructive} | ${r.unreadable} | ${r.pressed.length} |`);
}
md.push("");
md.push("Unreadable means the label was empty or did not clearly say what the button does — an icon with no aria-label. Those are skipped, so a high count on a screen is itself worth a look.");
md.push("");

writeFileSync(resolve("crawl-report.md"), md.join("\n"), "utf8");
writeFileSync(resolve("crawl-report.json"), JSON.stringify({ base: BASE, when: new Date().toISOString(), pressed: PRESS, destructive: DESTRUCTIVE, pageResults, findings }, null, 2), "utf8");

console.log(`\n${findings.length} finding${findings.length === 1 ? "" : "s"} across ${routes.length} routes.`);
console.log(`crawl-report.md and crawl-report.json written.\n`);
