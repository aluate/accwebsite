/**
 * lib/permissions.ts — one place that says who may do what.
 *
 * WHY THIS FILE EXISTS.
 *
 * Karl, 2026-09-17: "Part of the reason no one is a PM is because the PM
 * permissions were incomplete and I had to bump everyone up to make it work."
 *
 * He was right, and the reason was structural. `/admin/*` was one gate —
 * app/admin/(protected)/layout.tsx did requireRole(["admin"]) over twenty-two
 * pages. There was no way to let a PM see the pipeline without also handing them
 * user management and wipe-jobs. So five people who do PM work hold `admin`, the
 * `pm` role is carried by nobody, and every pm-specific rule in the codebase is
 * untested.
 *
 * The fix is to stop asking "which page is this" and start asking "what is this
 * person allowed to DO". A capability is a verb. Pages and routes name the verb
 * they need; this file is the only place that decides who has it.
 *
 * THE DRIFT PROBLEM THIS ALSO SOLVES.
 *
 * app/admin/(protected)/permissions/page.tsx is a hand-written matrix with this
 * at the top: "Update this page whenever a page gains or loses a role check."
 * That instruction was last honoured on 2026-07-16 and the page is now wrong in
 * at least six places — it still says a PM has full access to billing, leads and
 * estimating, none of which they can reach. A document maintained by remembering
 * to maintain it is a document that is wrong.
 *
 * So that page is now GENERATED from CAPABILITIES below. It cannot disagree with
 * enforcement, because it is rendered from the thing that enforces.
 *
 * HOW TO USE IT.
 *
 *   Server page:   await requireCap("schedule.edit")
 *   API route:     const guard = await guardCap("schedule.edit")
 *   In a component: can(session.role, "schedule.edit")
 *
 * Never write a role list anywhere else. If you find yourself typing
 * ["admin", "pm"] in a route handler, the capability you want is missing from
 * this file — add it here instead.
 */

import type { Role } from "@/lib/auth";

/* ─────────────────────────────────────────────────────────────────────────────
   The capabilities.

   Named for what a person is doing, not for the screen they are on. "Can this
   person put something on the calendar" survives a redesign; "can this person
   open /schedule" does not.
   ───────────────────────────────────────────────────────────────────────────── */

export const CAPABILITIES = {
  // ── Jobs ──────────────────────────────────────────────────────────────────
  "jobs.view":        "See the job list and any job",
  "jobs.create":      "Create a job",
  "jobs.edit":        "Change job details — status, PM, dates, value, client contact",
  "jobs.advance":     "Move a job to the next stage, which emails the client",
  "jobs.delete":      "Delete a job and everything hanging off it",

  // ── Specs and engineering ─────────────────────────────────────────────────
  "specs.view":       "Open a spec sheet",
  "specs.edit":       "Change a spec — finishes, rooms, line items, hardware",
  "engineering.view": "See the engineering queue",
  "engineering.edit": "Open and work a spec in engineering; release it",

  // ── Schedule ──────────────────────────────────────────────────────────────
  "schedule.view":    "See the calendar",
  "schedule.edit":    "Put work on the calendar, move it, assign a crew",
  "schedule.admin":   "Crews, PTO, the change-request queue, locking a week",

  // ── Punch and warranty ────────────────────────────────────────────────────
  "punch.view":       "See punch items",
  "punch.create":     "Add a punch item and mark one done",
  "punch.manage":     "Reopen, close as won't fix, delete a punch item",
  "warranty.view":    "See warranty claims",
  "warranty.manage":  "Raise and resolve a warranty claim",

  // ── Files ─────────────────────────────────────────────────────────────────
  "files.view":       "See and download job files",
  "files.upload":     "Add a file to a job",
  "files.delete":     "Remove a file from a job",

  // ── Things the client receives ────────────────────────────────────────────
  "client.send":      "Send a bid, contract or signoff request to a client",
  "portal.manage":    "Turn the builder portal on for a job and manage portal logins",

  // ── Money ─────────────────────────────────────────────────────────────────
  "billing.view":     "See invoices and the past-due report",
  "billing.manage":   "Raise, send, void and mark invoices paid",
  "estimating.view":  "Open an estimate, its BOM and its quote",
  "estimating.edit":  "Build and price an estimate",
  "estimating.setup": "Change the rates and profiles the estimator prices from",

  // ── Reference data ────────────────────────────────────────────────────────
  "catalog.view":     "Read the catalogs — libraries, palettes, accessories, edgebands",
  "catalog.edit":     "Change what is in a catalog",
  "documents.view":   "Open the template document library and builder floor plans",

  // ── Front of house ────────────────────────────────────────────────────────
  "leads.manage":     "Work the leads list and reply to an enquiry",
  "bugs.view":        "See reported bugs",

  // ── Running the system ────────────────────────────────────────────────────
  "users.view":       "See who has a login and what role they hold",
  "users.manage":     "Create, edit, deactivate a login; change somebody's role",
  "notify.manage":    "Change who automated emails go to",
  "system.destructive": "Wipe jobs, restore archives, and anything else with no undo",
} as const;

export type Capability = keyof typeof CAPABILITIES;

/* ─────────────────────────────────────────────────────────────────────────────
   Who holds what.

   Read down a column to see a whole job. `karl` is deliberately absent from the
   lists: it is the owner role and holds everything, applied in can() below, so
   nobody has to remember to add it to a new capability.

   AS OF 2026-09-17 KARL IS THE ONLY ADMIN. `admin` stays in the model as the
   break-glass role — a second pair of hands for user management and destructive
   work — but no account holds it. Everyone who was bumped to admin to make PM
   work goes to `pm`.

   WHY THERE IS BOTH A `karl` AND AN `admin` AT ALL. Karl, 2026-09-17: "the
   reason KARL exists is for somereason admin got nerfed and it was easier to
   make a new role than fix the old one." That is the whole history — `karl` is
   not a vanity role, it is a workaround for a regression in `admin` that nobody
   ever tracked down. Today the two are identical in code (requireKarl() exists
   and is called from nowhere), so whatever the nerf was, it is gone.

   This file is where that gets resolved: `admin` is defined here as holding
   everything `karl` does, so the workaround is no longer load-bearing. Keeping
   both means promoting a second owner later is a one-word change. If `admin`
   ever looks nerfed again, this table is the only place it could have happened.

   Tahiti Test on that: with one admin, creating a login and editing a catalog
   both stop when Karl is unreachable. That is a real cost and an accepted one —
   both are rare and neither blocks the floor. What must NEVER end up admin-only
   is anything the field or a PM needs on a Tuesday, which is why schedule.edit,
   client.send and billing.manage all sit with `pm`.
   ───────────────────────────────────────────────────────────────────────────── */

const GRANTS: Record<Capability, readonly Role[]> = {
  // Everybody internal can see a job and its specs. This app is not a place
  // where people are kept from looking at the work.
  "jobs.view":        ["admin", "pm", "engineer", "shop", "installer"],
  "specs.view":       ["admin", "pm", "engineer", "shop", "installer"],
  "files.view":       ["admin", "pm", "engineer", "shop", "installer"],
  "schedule.view":    ["admin", "pm", "engineer", "shop", "installer"],
  "punch.view":       ["admin", "pm", "engineer", "shop", "installer"],

  // Anyone on a job can add a punch item and close one out. The photo
  // requirement, not the role, is what keeps that honest — see PunchListPanel.
  "punch.create":     ["admin", "pm", "engineer", "shop", "installer"],
  "files.upload":     ["admin", "pm", "engineer", "shop", "installer"],

  // Running a job.
  "jobs.create":      ["admin", "pm"],
  "jobs.edit":        ["admin", "pm"],
  "jobs.advance":     ["admin", "pm"],
  // Deleting a job removes invoices, change orders, punch history and files with
  // it. Owner only — and note the Delete button on the job page is already the
  // only place in the app that calls it.
  "jobs.delete":      ["admin"],
  "punch.manage":     ["admin", "pm"],
  "files.delete":     ["admin", "pm"],
  "warranty.view":    ["admin", "pm", "engineer", "installer"],
  "warranty.manage":  ["admin", "pm"],

  // The calendar. THIS IS THE ONE THAT WAS MISSING: adding and moving events was
  // admin-only, so a PM could not schedule a delivery, a service call or a punch
  // trip — only install phases. It is the reason the punch-to-installer flow had
  // no first step.
  "schedule.edit":    ["admin", "pm"],
  "schedule.admin":   ["admin", "pm"],

  // Specs. Engineers work them; PMs set them up.
  "specs.edit":       ["admin", "pm"],
  "engineering.view": ["admin", "pm", "engineer"],
  // Karl, 2026-09-17, asked whether PMs should be shut out of this: "they can do
  // that too if needed." So a PM can open and work a spec in engineering — it is
  // their job that is stuck when the engineer is out.
  "engineering.edit": ["admin", "pm", "engineer"],

  // Anything a customer receives has to come from someone who owns the job.
  "client.send":      ["admin", "pm"],
  "portal.manage":    ["admin", "pm"],

  /*
    Money — owner only, for now.

    The first draft of this file gave PMs billing and estimating, on the strength
    of the July matrix saying so. Karl, 2026-09-17: "mine only. we can roll out
    billing after more testing."

    So this is a deliberate hold, not a judgement about who is trusted with
    margin. When billing has had its testing, moving all five lines to
    ["admin", "pm"] is the whole change — no route, page or component needs
    touching, which is the point of keeping the policy in one file.
  */
  "billing.view":     ["admin"],
  "billing.manage":   ["admin"],
  "estimating.view":  ["admin"],
  "estimating.edit":  ["admin"],
  "estimating.setup": ["admin"],

  // Reference data. Everyone reads it; changing it changes every job at once,
  // so it stays up top.
  /*
    Split out of one "catalog.view" on 2026-09-17. Lumping them together let
    engineer and shop into /admin/libraries and /admin/palettes, which Karl's
    July matrix deliberately kept to PMs. The catalogs are reference data the
    shop reads THROUGH a job or a spec, not by opening the admin page.

    Floor plans and the template document library are different — engineering
    genuinely works from those, and the shop reads the documents.
  */
  "catalog.view":     ["admin", "pm"],
  "catalog.edit":     ["admin"],
  "documents.view":   ["admin", "pm", "engineer", "shop"],

  "leads.manage":     ["admin", "pm"],
  "bugs.view":        ["admin", "pm"],

  // Running the system. users.view is the roster — a PM needs it to assign a job
  // to somebody. users.manage is creating logins and handing out roles, which is
  // the one thing that can grant every other capability on this page, so it is
  // owner-only and not delegated.
  "users.view":       ["admin", "pm"],
  "notify.manage":    ["admin"],

  // The three that can undo other people's work or hand out access. `admin`
  // holds them because that is the entire point of the break-glass role — an
  // admin who cannot create a login is not a second pair of hands, it is a PM
  // with extra steps. Nobody holds `admin` today, so in practice these are
  // Karl's alone until he grants it.
  "users.manage":     ["admin"],
  "system.destructive": ["admin"],
};

/* ─────────────────────────────────────────────────────────────────────────────
   The check.
   ───────────────────────────────────────────────────────────────────────────── */

/**
 * Does this role hold this capability?
 *
 * `karl` holds everything. That is the one hard-coded rule, and it is here
 * rather than repeated in thirty grant lists so that adding a capability cannot
 * accidentally lock the owner out of his own app.
 */
export function can(role: Role | null | undefined, cap: Capability): boolean {
  if (!role) return false;
  if (role === "karl") return true;
  return GRANTS[cap].includes(role);
}

/** Every capability a role holds, in declaration order. For the matrix page. */
export function capabilitiesFor(role: Role): Capability[] {
  return (Object.keys(CAPABILITIES) as Capability[]).filter((c) => can(role, c));
}

/** Every role that holds a capability, owner first. For the matrix page. */
export function rolesWith(cap: Capability): Role[] {
  const out: Role[] = ["karl"];
  for (const r of ["admin", "pm", "engineer", "shop", "installer"] as const) {
    if (GRANTS[cap].includes(r)) out.push(r);
  }
  return out;
}

/** The grant table itself, for the generated matrix page and for the tests. */
export const CAPABILITY_GRANTS = GRANTS;

/* ─────────────────────────────────────────────────────────────────────────────
   The gates.

   These are the only two things a page or a route should call. Both take a
   capability, never a role list — that is the whole point of the file.
   ───────────────────────────────────────────────────────────────────────────── */

import { redirect } from "next/navigation";
import { getBuilder, requireBuilder } from "@/lib/auth";
import type { BuilderSession } from "@/lib/auth";

/**
 * Server-page gate. Sends anyone without the capability back to /jobs, the same
 * place requireRole() has always sent them, so the felt behaviour is unchanged.
 *
 *   export default async function Page() {
 *     const session = await requireCap("billing.view");
 */
export async function requireCap(cap: Capability): Promise<BuilderSession> {
  const session = await requireBuilder();
  if (!can(session.role, cap)) redirect("/jobs");
  return session;
}

export type CapGuard =
  | { ok: true; session: BuilderSession }
  | { ok: false; status: number; error: string };

/**
 * API-route gate. Returns rather than redirecting, because a route handler that
 * redirects hands the caller a login page where it expected JSON — the exact
 * shape of bug that made /api/admin/leads/send-response useless.
 *
 * The 403 names the capability. "Requires one of: admin, pm" tells a developer
 * nothing about WHY; "Requires: billing.manage" points straight at the line in
 * this file that decided it.
 */
export async function guardCap(cap: Capability): Promise<CapGuard> {
  const session = await getBuilder();
  if (!session) return { ok: false, status: 401, error: "Unauthorized" };
  if (!can(session.role, cap)) {
    return { ok: false, status: 403, error: `Requires: ${cap}` };
  }
  return { ok: true, session };
}

/* ─────────────────────────────────────────────────────────────────────────────
   Which capability opens which admin page.

   /admin used to be one gate — app/admin/(protected)/layout.tsx did
   requireRole(["admin"]) over everything below it. That is the reason a PM could
   not have the pipeline without also getting user management and wipe-jobs, and
   the reason Karl had to bump five people to admin.

   Every page now names its own capability. The layout still refuses anyone
   holding NONE of them, so a page that forgets to declare one is not left wide
   open, and scripts/test-permission-map.mjs fails the build if any page under
   app/admin/(protected)/ is missing from this table or does not call
   requireCap().

   Where the audience was not obvious, the capability chosen is an owner-only one
   so behaviour is unchanged from today. Widening is a deliberate act, and it is
   done here, in one line, not by editing a page.
   ───────────────────────────────────────────────────────────────────────────── */

export const ADMIN_PAGE_CAPS = {
  // Karl's own matrix of 2026-07-16 gave PMs these.
  "pipeline":          "jobs.edit",
  "leads":             "leads.manage",
  "portal-accounts":   "portal.manage",
  "jobs":              "portal.manage",      // /admin/jobs/[id]/portal
  "schedule":          "schedule.admin",
  "bugs":              "bugs.view",
  "builders":          "users.view",
  "permissions":       "users.view",

  // Read the reference data; changing it is guarded by catalog.edit in the APIs.
  "libraries":         "catalog.view",
  "palettes":          "catalog.view",
  "accessories":       "catalog.view",
  "edgeband-matches":  "catalog.view",
  "catalog-review":    "catalog.view",
  "floor-plans":       "documents.view",
  "documents":         "documents.view",

  // Held back on 2026-09-17: "mine only. we can roll out billing after more
  // testing." Moving these to a pm-inclusive capability is the whole change.
  "billing":           "billing.view",
  "estimating":        "estimating.view",

  // Owner only, and unchanged from today.
  "builder-companies": "catalog.edit",
  "builder-profiles":  "catalog.edit",
  "constraints":       "catalog.edit",
  "notifications":     "notify.manage",
  "wipe-jobs":         "system.destructive",
} as const satisfies Record<string, Capability>;

/** Does this role hold any capability that opens some part of /admin? */
export function canEnterAdmin(role: Role | null | undefined): boolean {
  return Object.values(ADMIN_PAGE_CAPS).some((c) => can(role, c as Capability));
}
