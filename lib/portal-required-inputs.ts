/**
 * Required-inputs logic for the builder portal.
 *
 * Karl's accountability lever: delivery date is `(last input received) +
 * target_delivery_weeks`, NOT (today + weeks). If a builder hasn't given us
 * appliance specs, the date moves out every day they stall.
 */
import { sql, uid } from "@/lib/db";

export const DEFAULT_REQUIRED_INPUTS: Array<{ kind: string; label: string; description: string }> = [
  {
    kind: "plans",
    label: "Architectural plans uploaded",
    description: "PDF set with floor plans, elevations, sections. Upload as kind=plans.",
  },
  {
    kind: "appliances",
    label: "Appliance package / cut sheets",
    description: "All major appliances (range, hood, refrigerator, dishwasher, microwave) — model numbers + manufacturer cut sheets.",
  },
  {
    kind: "site_measure_ready",
    label: "Site ready for field measure",
    description: "Walls/floors at finish levels, drywall complete (or framing if pre-rock), accessible during daytime.",
  },
  {
    kind: "finish_selection",
    label: "Finish selection confirmed",
    description: "Paint color, stain, or melamine TFL — confirmed in writing or via portal.",
  },
  {
    kind: "redline_ack",
    label: "Engineered drawings reviewed",
    description: "Builder has reviewed the latest engineered drawings and acknowledged any redlines.",
  },
  {
    kind: "change_window_close",
    label: "Change-request window closed",
    description: "After redline acknowledgement, builder has 14 days to submit change requests. After this, change orders are billable.",
  },
];

export type RequiredInputRow = {
  id: string;
  job_id: string;
  kind: string;
  label: string;
  description: string | null;
  sort_order: number;
  status: "pending" | "received" | "waived";
  received_at: string | null;
  received_via: string | null;
  received_by: string | null;
  notes: string | null;
};

/** Seed the default checklist for a job. Idempotent — won't duplicate. */
export async function seedDefaultRequiredInputs(jobId: string): Promise<number> {
  const [countRow] = await sql`SELECT COUNT(*) as n FROM builder_required_inputs WHERE job_id = ${jobId}`;
  if (Number((countRow as { n: string | number }).n) > 0) return 0;

  await sql.begin(async (tx) => {
    for (let i = 0; i < DEFAULT_REQUIRED_INPUTS.length; i++) {
      const r = DEFAULT_REQUIRED_INPUTS[i];
      await tx`
        INSERT INTO builder_required_inputs (id, job_id, kind, label, description, sort_order, status)
        VALUES (${uid()}, ${jobId}, ${r.kind}, ${r.label}, ${r.description}, ${i}, 'pending')
      `;
    }
  });

  return DEFAULT_REQUIRED_INPUTS.length;
}

export async function listRequiredInputs(jobId: string): Promise<RequiredInputRow[]> {
  return await sql`
    SELECT * FROM builder_required_inputs WHERE job_id = ${jobId} ORDER BY sort_order, label
  ` as RequiredInputRow[];
}

export async function markInputReceived(input: {
  id: string;
  jobId: string;
  by: string;
  via: "portal_upload" | "admin_marked" | "email_attached" | "portal_self_attest";
  notes?: string;
}): Promise<boolean> {
  const now = new Date().toISOString();
  const result = await sql`
    UPDATE builder_required_inputs
    SET status = 'received', received_at = ${now}, received_via = ${input.via},
        received_by = ${input.by}, notes = COALESCE(${input.notes ?? null}, notes)
    WHERE id = ${input.id} AND job_id = ${input.jobId} AND status != 'received'
  `;
  if (result.count > 0) {
    await recomputeDeliveryClock(input.jobId);
    return true;
  }
  return false;
}

export async function markInputPending(inputId: string, jobId: string): Promise<void> {
  await sql`
    UPDATE builder_required_inputs
    SET status = 'pending', received_at = NULL, received_via = NULL, received_by = NULL
    WHERE id = ${inputId} AND job_id = ${jobId}
  `;
  await recomputeDeliveryClock(jobId);
}

export async function waiveInput(inputId: string, jobId: string, by: string, notes?: string): Promise<void> {
  const now = new Date().toISOString();
  await sql`
    UPDATE builder_required_inputs
    SET status = 'waived', received_at = ${now}, received_via = 'admin_waived',
        received_by = ${by}, notes = COALESCE(${notes ?? null}, notes)
    WHERE id = ${inputId} AND job_id = ${jobId}
  `;
  await recomputeDeliveryClock(jobId);
}

/**
 * Recompute jobs.delivery_clock_started_at and estimated_delivery_at.
 *
 * Rule:
 *   - If ANY input is still 'pending', clear both columns. Date is in flux.
 *   - If all inputs are 'received' or 'waived', set delivery_clock_started_at
 *     to MAX(received_at) and estimated_delivery_at to that date + target_delivery_weeks weeks.
 */
export async function recomputeDeliveryClock(jobId: string): Promise<{ startedAt: string | null; estimatedAt: string | null }> {
  const inputs = await sql`SELECT status, received_at FROM builder_required_inputs WHERE job_id = ${jobId}` as
    { status: string; received_at: string | null }[];

  if (inputs.length === 0 || inputs.some((i) => i.status === "pending")) {
    await sql`UPDATE jobs SET delivery_clock_started_at = NULL, estimated_delivery_at = NULL WHERE id = ${jobId}`;
    return { startedAt: null, estimatedAt: null };
  }

  const dates = inputs.map((i) => i.received_at).filter((d): d is string => !!d).sort();
  const last = dates[dates.length - 1];
  if (!last) {
    await sql`UPDATE jobs SET delivery_clock_started_at = NULL, estimated_delivery_at = NULL WHERE id = ${jobId}`;
    return { startedAt: null, estimatedAt: null };
  }

  const [jobRow] = await sql`SELECT target_delivery_weeks FROM jobs WHERE id = ${jobId}`;
  const weeks = (jobRow as { target_delivery_weeks: number } | undefined)?.target_delivery_weeks ?? 8;

  const start = new Date(last);
  const est = new Date(start.getTime() + weeks * 7 * 24 * 3600 * 1000);
  const estAt = est.toISOString();

  await sql`
    UPDATE jobs SET delivery_clock_started_at = ${start.toISOString()}, estimated_delivery_at = ${estAt}
    WHERE id = ${jobId}
  `;
  return { startedAt: start.toISOString(), estimatedAt: estAt };
}

export async function summarize(jobId: string): Promise<{
  total: number; received: number; waived: number; pending: number;
  pct_complete: number;
  estimated_delivery_at: string | null;
  delivery_clock_started_at: string | null;
}> {
  const inputs = await listRequiredInputs(jobId);
  const total = inputs.length;
  const received = inputs.filter((i) => i.status === "received").length;
  const waived = inputs.filter((i) => i.status === "waived").length;
  const pending = total - received - waived;
  const pct = total === 0 ? 100 : Math.round(((received + waived) / total) * 100);
  const [jobRow] = await sql`SELECT delivery_clock_started_at, estimated_delivery_at FROM jobs WHERE id = ${jobId}`;
  const job = jobRow as { delivery_clock_started_at: string | null; estimated_delivery_at: string | null } | undefined;
  return {
    total, received, waived, pending,
    pct_complete: pct,
    estimated_delivery_at: job?.estimated_delivery_at ?? null,
    delivery_clock_started_at: job?.delivery_clock_started_at ?? null,
  };
}
