export const dynamic = "force-dynamic";

/**
 * GET /api/test/billing-walkthrough?key=INTERNAL_API_KEY[&cleanup=true]
 *
 * End-to-end billing/stage walkthrough test.
 * Creates test accounts + test job, fires every stage transition (with emails),
 * and returns a full report.
 *
 * ?cleanup=true  — deletes the test job + accounts created by a previous run
 * ?job_only=true — skip account creation, only create job + walk stages
 *
 * Security: gated by INTERNAL_API_KEY env var. Never expose to public.
 */

import { NextRequest, NextResponse } from "next/server";
import { sql, uid } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { hashPassword as portalHashPassword } from "@/lib/portal-auth";
import { sendEmail } from "@/lib/mailer";
import { TRANSITION_GATES, STATUS_SEQUENCE } from "@/lib/transition-gates";
import { logActivity } from "@/lib/activity-log";

const API_KEY  = process.env.INTERNAL_API_KEY;
const TEST_TAG = "TEST-BILLING-WALKTHROUGH";
const ALL_TO   = "karlv@advancedcabinets.net";

function resolveRecipient(key: string, job: Record<string, string | null>): string {
  switch (key) {
    case "client": return job.client_email ?? ALL_TO;
    case "pm":          return process.env.PM_EMAIL          ?? ALL_TO;
    case "eng":         return process.env.ENG_EMAIL          ?? process.env.PM_EMAIL ?? ALL_TO;
    case "shop":        return process.env.SHOP_EMAIL         ?? process.env.PM_EMAIL ?? ALL_TO;
    case "residential": return process.env.RESIDENTIAL_EMAIL  ?? process.env.PM_EMAIL ?? ALL_TO;
    default: return ALL_TO;
  }
}

type StepResult = {
  stage: string;
  ok: boolean;
  emailTo?: string;
  emailSubject?: string;
  emailError?: string;
  error?: string;
  skipped?: boolean;
};

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!API_KEY || key !== API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cleanup  = req.nextUrl.searchParams.get("cleanup") === "true";
  const jobOnly  = req.nextUrl.searchParams.get("job_only") === "true";

  // ── Cleanup mode ────────────────────────────────────────────────────────
  if (cleanup) {
    const deleted: string[] = [];
    try {
      const jobs = await sql<{ id: string }[]>`SELECT id FROM jobs WHERE notes LIKE ${'%' + TEST_TAG + '%'}`;
      for (const j of jobs) {
        await sql`DELETE FROM jobs WHERE id = ${j.id}`;
        deleted.push(`job:${j.id}`);
      }
    } catch { /* ignore */ }
    try {
      await sql`DELETE FROM builder_accounts WHERE username = 'test_pm_billing'`;
      deleted.push("builder_account:test_pm_billing");
    } catch { /* ignore */ }
    try {
      await sql`DELETE FROM builder_portal_accounts WHERE username = 'test_builder_billing'`;
      deleted.push("portal_account:test_builder_billing");
    } catch { /* ignore */ }
    return NextResponse.json({ ok: true, cleaned: deleted });
  }

  const report: Record<string, unknown> = { tag: TEST_TAG, startedAt: new Date().toISOString() };
  const steps: StepResult[] = [];

  // ── 1. Create test PM account ────────────────────────────────────────────
  let pmAccountId: string | null = null;
  if (!jobOnly) {
    try {
      const existing = await sql<{ id: string }[]>`SELECT id FROM builder_accounts WHERE username = 'test_pm_billing'`;
      if (existing.length > 0) {
        pmAccountId = existing[0].id;
        report.pmAccount = { id: pmAccountId, note: "already exists" };
      } else {
        pmAccountId = uid();
        const hash = await hashPassword("TestPM2026!");
        await sql`
          INSERT INTO builder_accounts (id, username, password_hash, name, email, role, active, created_at)
          VALUES (${pmAccountId}, 'test_pm_billing', ${hash}, 'Test PM', ${ALL_TO}, 'pm', 1, ${new Date().toISOString()})
        `;
        report.pmAccount = { id: pmAccountId, username: "test_pm_billing", password: "TestPM2026!", role: "pm" };
      }
    } catch (e) {
      report.pmAccount = { error: String(e) };
    }
  }

  // ── 2. Create test builder portal account ────────────────────────────────
  let portalAccountId: string | null = null;
  if (!jobOnly) {
    try {
      const existing = await sql<{ id: string }[]>`SELECT id FROM builder_portal_accounts WHERE username = 'test_builder_billing'`;
      if (existing.length > 0) {
        portalAccountId = existing[0].id;
        report.builderPortalAccount = { id: portalAccountId, note: "already exists" };
      } else {
        portalAccountId = uid();
        const hash = await portalHashPassword("TestBuilder2026!");
        await sql`
          INSERT INTO builder_portal_accounts
            (id, username, password_hash, display_name, builder_company, contact_email, active, created_at, must_change_pw)
          VALUES (${portalAccountId}, 'test_builder_billing', ${hash},
                  'Test Builder Co.', 'Test Builder Co.', ${ALL_TO}, 1, ${new Date().toISOString()}, 0)
        `;
        report.builderPortalAccount = { id: portalAccountId, username: "test_builder_billing", password: "TestBuilder2026!" };
      }
    } catch (e) {
      report.builderPortalAccount = { error: String(e) };
    }
  }

  // ── 3. Create test job ───────────────────────────────────────────────────
  const jobId     = uid();
  const jobNumber = "TEST-" + Date.now().toString(36).toUpperCase();
  try {
    await sql`
      INSERT INTO jobs (
        id, job_number, status, client_name, client_email,
        site_address, city, pm, install_type, notes, created_at, updated_at
      ) VALUES (
        ${jobId}, ${jobNumber}, 'intake',
        'Test Client (Billing Walkthrough)', ${ALL_TO},
        '123 Test St', 'Coeur d Alene',
        'Test PM',
        'residential',
        ${`[${TEST_TAG}] Created by billing walkthrough test`},
        ${new Date().toISOString()},
        ${new Date().toISOString()}
      )
    `;
    report.testJob = { id: jobId, jobNumber, clientEmail: ALL_TO, status: "intake" };
  } catch (e) {
    return NextResponse.json({ error: "Failed to create test job", detail: String(e), report }, { status: 500 });
  }

  // ── 4. Walk through all stages ───────────────────────────────────────────
  const stagesToAdvance = STATUS_SEQUENCE.slice(1); // skip "intake", advance from intake→bid→...→complete

  const jobMeta = {
    id: jobId,
    job_number: jobNumber,
    client_name: "Test Client (Billing Walkthrough)",
    client_email: ALL_TO,
    site_address: "123 Test St",
    city: "Coeur d Alene",
    pm: "Test PM",
  };

  let currentStatus = "intake";

  for (const toStatus of stagesToAdvance) {
    const gate = TRANSITION_GATES[toStatus];
    const step: StepResult = { stage: `${currentStatus} → ${toStatus}`, ok: false };

    try {
      // Update status
      await sql`UPDATE jobs SET status = ${toStatus}, updated_at = ${new Date().toISOString()} WHERE id = ${jobId}`;

      // Fire email if gate exists
      if (gate) {
        const toAddr = gate.recipients
          .map((k) => resolveRecipient(k, jobMeta as Record<string, string | null>))
          .filter(Boolean)
          .join(", ");
        const ccAddr = (gate.ccKeys ?? [])
          .map((k) => resolveRecipient(k, jobMeta as Record<string, string | null>))
          .filter(Boolean)
          .join(", ") || undefined;

        const subject = gate.subject(jobMeta);
        const text    = gate.body(jobMeta, `[BILLING TEST] Stage ${toStatus}`);

        step.emailTo      = toAddr + (ccAddr ? ` (cc: ${ccAddr})` : "");
        step.emailSubject = subject;

        const result = await sendEmail({ to: toAddr, cc: ccAddr, subject, text });
        if (result.ok) {
          step.ok = true;
        } else {
          step.ok = false;
          step.emailError = (result as { ok: false; error: string }).error;
        }
      } else {
        step.ok      = true;
        step.skipped = true; // no email gate for this transition
      }

      // Activity log
      await logActivity({
        entityType: "job", entityId: jobId, jobId,
        eventType: "status_change",
        fromState: currentStatus, toState: toStatus,
        actor: "billing-test", actorRole: "system",
        payload: { note: "[BILLING TEST]" },
      }).catch(() => {});

      currentStatus = toStatus;
    } catch (e) {
      step.ok    = false;
      step.error = String(e);
    }

    steps.push(step);
  }

  report.stages      = steps;
  report.completedAt = new Date().toISOString();
  report.summary = {
    total:       steps.length,
    emailsFired: steps.filter((s) => !s.skipped).length,
    passed:      steps.filter((s) => s.ok).length,
    failed:      steps.filter((s) => !s.ok).length,
    cleanupUrl:  `/api/test/billing-walkthrough?key=${key}&cleanup=true`,
  };

  return NextResponse.json(report, {
    headers: { "Content-Type": "application/json" },
  });
}
