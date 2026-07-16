# Innergy Integration

**Status as of 2026-07-16**

## What It Does

acc-website pushes new jobs to Innergy as **Opportunities** automatically on job creation, and re-syncs the win-probability when the job status changes. Innergy remains the master for production scheduling, WO management, and billing — this integration is **one-way: acc-website → Innergy only**.

## Data Flow

```
User creates job in acc-website
        │
        ▼
POST /api/jobs → inserts into jobs table
        │
        ▼ (fire-and-forget, non-blocking)
syncJobToInnergy()
        │
        ├─ If INNERGY_API_KEY not set → no-op (dev/staging)
        ├─ If innergy_opportunity_id already set → skip create (already synced)
        ├─ If ExternalIdentifier match found → skip create (dedup guard)
        └─ Else → POST /api/opportunity/create
                        │
                        ▼
                 Innergy returns { Id, Number, Bids: [{Id}] }
                        │
                        ▼
              UPDATE jobs SET innergy_opportunity_id, innergy_bid_id, innergy_synced_at

Status change (PATCH /api/jobs/[id])
        │
        ▼ (fire-and-forget)
syncJobToInnergy() — updates WinProbabilityPercentage via same create path
(future: dedicated update endpoint once confirmed in Innergy API)
```

## Fields Sent to Innergy

| Innergy field              | Source                        |
|----------------------------|-------------------------------|
| `Name`                     | `{builder_company} — {client_name}` |
| `ExternalIdentifier`       | `jobs.id` (ACC-YYYY-NNNN)     |
| `ProjectedRevenue`         | `jobs.estimated_value`        |
| `WinProbabilityPercentage` | Mapped from `jobs.status`     |
| `BidDate`                  | `jobs.delivery_date`          |
| `Address.Street`           | `jobs.site_address`           |
| `Address.City`             | `jobs.city`                   |
| `Address.State`            | `jobs.state` (defaults to ID) |
| `Address.ZipCode`          | `jobs.zip_code`               |
| `CurrentBidName`           | `"Initial Bid"` (hardcoded)   |

## Status → Win Probability Mapping

| acc-website status | Win probability |
|--------------------|----------------|
| intake             | 10%            |
| active             | 40%            |
| engineering        | 70%            |
| production         | 90%            |
| complete           | 100%           |
| on_hold            | 20%            |

## DB Columns (jobs table)

| Column                    | Type        | Purpose                              |
|---------------------------|-------------|--------------------------------------|
| `innergy_opportunity_id`  | TEXT        | Innergy UUID — prevents duplicate pushes |
| `innergy_bid_id`          | TEXT        | First bid UUID under the opportunity |
| `innergy_synced_at`       | TIMESTAMPTZ | Last successful sync timestamp       |

These columns are created by `scripts/db-push.mjs`.

## Configuration

Set one env var in Vercel (and locally in `.env.local`):

```
INNERGY_API_KEY=<your key from Innergy Settings → API>
```

- Auth header: `Api-Key: <key>` (no "Bearer" prefix)
- Base URL: `https://app.innergy.com`
- Without this var set, all sync calls are silent no-ops — safe for dev/staging.

## What Is NOT Yet Built

| Gap | Notes |
|-----|-------|
| **Field updates** | Status changes re-run the create path (which deduplicates), but no field-update call exists yet. If client name or address changes in acc-website after the opportunity is created, it won't propagate. Need `PATCH /api/opportunity/{id}` or equivalent once confirmed in Innergy API docs. |
| **Pull from Innergy** | We don't read WO numbers, production dates, or cost actuals back from Innergy. That's intentional for now — acc-website doesn't need those fields yet. |
| **estimated_value sync** | The `estimated_value` field exists in DB schema but isn't surfaced in the job creation UI. Once billing/estimating produces a contract value, wire it through here. |
| **state / zip fields** | DB columns exist, but the job creation form doesn't capture state or zip. `state` defaults to "ID" (Idaho) in the Innergy payload. Add these fields to the intake form when needed. |
| **Innergy → stage gate** | When Innergy marks a WO complete, there's no webhook to advance the acc-website job status. Low priority until Innergy API supports outbound webhooks reliably. |
| **Re-sync endpoint** | No admin UI to manually re-push a job to Innergy (e.g., after a failed sync). Add `POST /api/admin/innergy-sync/[jobId]` when needed. |

## Files

| File | Purpose |
|------|---------|
| `lib/innergy-sync.ts` | Core sync library — create opportunity, dedup check, main export |
| `app/api/jobs/route.ts` | Calls `syncJobToInnergy` after job creation |
| `app/api/jobs/[id]/route.ts` | Calls `syncJobToInnergy` on status change |
| `scripts/db-push.mjs` | Creates `innergy_opportunity_id`, `innergy_bid_id`, `innergy_synced_at` columns |

## Enabling in Production

1. Get your API key: Innergy → Settings → API
2. Add to Vercel: `INNERGY_API_KEY=<key>`
3. Run `node scripts/db-push.mjs` if not already done (adds innergy columns)
4. Create a test job in acc-website and verify it appears in Innergy within a few seconds

## Known Limitations

- `findInnergyOpportunityByExternalId` fetches **all** opportunities and filters in memory. Fine for now; add a server-side filter if the list grows past ~1,000 entries.
- Innergy API responses use mixed-case keys (`Id`, `Number`, `Bids`) — the sync library handles both casing variations.
