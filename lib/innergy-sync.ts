/**
 * lib/innergy-sync.ts
 *
 * Pushes acc-website job data to Innergy as Opportunities.
 * acc-website is the master for intake/spec data.
 * Innergy is the master for production/WO/billing data.
 *
 * This module only writes to Innergy — it never reads from it to overwrite
 * acc-website records. Conflict resolution rule: acc-website wins on intake
 * fields; Innergy wins on production/cost fields.
 *
 * Innergy API docs: https://app.innergy.com/api/index.html
 * Auth: Api-Key header (no Bearer prefix)
 */

const BASE_URL = "https://app.innergy.com";

function headers() {
  const key = process.env.INNERGY_API_KEY;
  if (!key) throw new Error("INNERGY_API_KEY env var is not set");
  return {
    "Api-Key": key,
    "Accept": "application/json",
    "Content-Type": "application/json",
  };
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface JobForSync {
  id: string;                        // ACC-YYYY-NNNN (our primary key)
  job_number?: string | null;        // internal job number if assigned
  client_name: string;
  site_address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  job_type?: string | null;          // "residential" | "commercial"
  pm?: string | null;
  builder_name?: string | null;
  builder_company?: string | null;
  delivery_date?: string | null;
  estimated_value?: number | null;
  status?: string | null;
  innergy_opportunity_id?: string | null;
}

export interface InnergyCreateResult {
  opportunityId: string;   // UUID
  bidId: string;           // UUID (nested under opportunity)
  opportunityNumber: string; // O-26-XXXX
}

// ── Innergy status mapping ────────────────────────────────────────────────────
// Innergy uses numeric win-probability to express pipeline stage.
// Map our job statuses to reasonable defaults.

const STATUS_TO_WIN_PROBABILITY: Record<string, number> = {
  intake:      10,
  active:      40,
  engineering: 70,
  production:  90,
  complete:   100,
  on_hold:     20,
};

// ── Core: create opportunity ──────────────────────────────────────────────────

export async function createInnergyOpportunity(
  job: JobForSync
): Promise<InnergyCreateResult> {
  const name = buildOpportunityName(job);

  const payload = {
    Name: name,
    ExternalIdentifier: job.id,
    ProjectedRevenue: job.estimated_value ?? undefined,
    WinProbabilityPercentage: STATUS_TO_WIN_PROBABILITY[job.status ?? "intake"] ?? 10,
    BidDate: job.delivery_date
      ? new Date(job.delivery_date).toISOString()
      : undefined,
    Address: buildAddress(job),
    CurrentBidName: "Initial Bid",
  };

  const res = await fetch(`${BASE_URL}/api/opportunity/create`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Innergy createOpportunity failed ${res.status}: ${text.slice(0, 200)}`
    );
  }

  const data = await res.json();

  // Innergy returns the opportunity with a nested bids array
  // Shape: { Id, Number, Bids: [{ Id, ... }], ... }
  const opportunityId: string = data.Id ?? data.id;
  const bidId: string = data.Bids?.[0]?.Id ?? data.bids?.[0]?.id ?? "";
  const opportunityNumber: string = data.Number ?? data.number ?? "";

  if (!opportunityId) {
    throw new Error(`Innergy returned no opportunity ID: ${JSON.stringify(data).slice(0, 200)}`);
  }

  return { opportunityId, bidId, opportunityNumber };
}

// ── Core: fetch opportunity by ExternalIdentifier ────────────────────────────
// Innergy doesn't have a dedicated "find by external ID" endpoint, so we fetch
// all opportunities and filter. Cache result in caller if needed.

export async function findInnergyOpportunityByExternalId(
  externalId: string
): Promise<{ Id: string; Number: string; Bids: Array<{ Id: string }> } | null> {
  const res = await fetch(`${BASE_URL}/api/opportunities`, {
    headers: headers(),
  });
  if (!res.ok) return null;

  const list = await res.json() as Array<{ Id: string; Number: string; ExternalIdentifier?: string; Bids: Array<{ Id: string }> }>;
  return list.find((o) => o.ExternalIdentifier === externalId) ?? null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildOpportunityName(job: JobForSync): string {
  if (job.builder_company && job.client_name) {
    return `${job.builder_company} — ${job.client_name}`;
  }
  if (job.builder_name && job.client_name) {
    return `${job.builder_name} — ${job.client_name}`;
  }
  const type = job.job_type === "commercial" ? " (Commercial)" : "";
  return `${job.client_name}${type}`;
}

function buildAddress(job: JobForSync) {
  if (!job.site_address && !job.city) return undefined;
  return {
    Street: job.site_address ?? undefined,
    City: job.city ?? undefined,
    State: job.state ?? "ID",        // default to Idaho — update if wrong
    ZipCode: job.zip_code ?? undefined,
  };
}

// ── Main export: sync a job to Innergy ───────────────────────────────────────
//
// Call this from:
//   POST /api/jobs        → on job creation
//   PATCH /api/jobs/[id]  → after acc-website fields change
//
// Returns { opportunityId, bidId } if a new opp was created, or
//         { opportunityId, bidId, existing: true } if it already existed.
// Returns null if INNERGY_API_KEY is not configured (graceful no-op).

export async function syncJobToInnergy(job: JobForSync): Promise<{
  opportunityId: string;
  bidId: string;
  created: boolean;
} | null> {
  if (!process.env.INNERGY_API_KEY) {
    // Innergy not configured — skip silently (dev/staging environments)
    return null;
  }

  try {
    // If we already have an Innergy ID, nothing more to do on create.
    // (Future: call a field-update endpoint here once we confirm Innergy supports it.)
    if (job.innergy_opportunity_id) {
      return {
        opportunityId: job.innergy_opportunity_id,
        bidId: "",      // caller should look up from DB if needed
        created: false,
      };
    }

    // Check if an opportunity already exists for this job (prevents duplicates
    // if the DB record was written before innergy_opportunity_id was saved).
    const existing = await findInnergyOpportunityByExternalId(job.id);
    if (existing) {
      return {
        opportunityId: existing.Id,
        bidId: existing.Bids?.[0]?.Id ?? "",
        created: false,
      };
    }

    // Create new opportunity
    const result = await createInnergyOpportunity(job);
    return { ...result, created: true };

  } catch (err) {
    // Never let an Innergy failure crash the acc-website request.
    // Log it and return null — the job is still saved in our DB.
    console.error("[innergy-sync] syncJobToInnergy failed:", err);
    return null;
  }
}
