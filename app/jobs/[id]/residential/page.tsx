export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { sql } from "@/lib/db";
import { NewSpecButton } from "@/components/NewSpecButton";
import { catalogs } from "@/lib/catalogs";

type Job  = {
  id: string;
  client_name: string;
  mod_residential: boolean;
  builder_name: string | null;
  builder_company: string | null;
};
type Spec = { id: string; name: string; status: string; created_at: string; updated_at: string };

// Walk-in residential customers: any job without a builder_company falls
// through to the BPROF-RESIDENTIAL profile (Karl's "residential pop tier"
// default — PF maple ply box, dovetail drawers, 3in bar pull, SW paint, etc.).
//
// Otherwise we match on builder_company exactly. If the company doesn't match
// any known profile, no auto-populate happens (safer than guessing wrong).
function resolveBuilderProfileId(job: Job): string | null {
  const profiles = catalogs.builderProfiles();
  if (!job.builder_company || job.builder_company.trim() === "") {
    return profiles.find((p) => p.is_residential_default)?.id ?? null;
  }
  const wanted = job.builder_company.trim().toLowerCase();
  const match = profiles.find(
    (p) => (p.builder_company ?? "").trim().toLowerCase() === wanted
  );
  return match?.id ?? null;
}

export default async function ResidentialIndexPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [job] = await sql`
    SELECT id, client_name, mod_residential, builder_name, builder_company
    FROM jobs WHERE id = ${id} OR job_number = ${id}
  ` as Job[];
  if (!job || !job.mod_residential) notFound();

  // Always use the canonical internal id for subsequent queries
  const jobId = job.id;

  const builderProfileId = resolveBuilderProfileId(job);
  const builderProfile = builderProfileId
    ? catalogs.builderProfiles().find((p) => p.id === builderProfileId)
    : null;

  const specs = await sql`
    SELECT * FROM residential_specs WHERE job_id = ${jobId} ORDER BY created_at
  ` as Spec[];

  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
      <Link href={`/jobs/${jobId}`} className="font-condensed uppercase tracking-widest text-xs text-white/30 hover:text-[#f08122] transition-colors mb-8 block">
        ← Back to Job
      </Link>

      <div className="flex items-start justify-between mb-10">
        <div>
          <h1 className="font-heading text-3xl uppercase tracking-wide text-white">Residential Cabinets</h1>
          <p className="text-[#f08122] font-condensed uppercase tracking-widest text-sm mt-1">{jobId} — {job.client_name}</p>
          {builderProfile && (
            <p className="text-white/40 text-xs mt-1 font-condensed uppercase tracking-widest">
              New specs auto-seeded from: <span className="text-white/70">{builderProfile.builder_name}</span>
            </p>
          )}
        </div>
        <NewSpecButton jobId={jobId} builderProfileId={builderProfileId} />
      </div>

      {specs.length === 0 ? (
        <div className="text-center py-20 text-white/20 font-condensed uppercase tracking-widest text-sm">
          No specs yet — create one to get started.
        </div>
      ) : (
        <div className="space-y-2">
          {specs.map((spec) => (
            <Link
              key={spec.id}
              href={`/jobs/${jobId}/residential/${spec.id}`}
              className="flex items-center justify-between bg-[#2d2d2d] hover:bg-[#353535] rounded px-5 py-4 transition-colors group"
            >
              <div>
                <p className="text-white text-sm font-medium">{spec.name}</p>
                <p className="text-white/30 text-xs mt-0.5">
                  Updated {new Date(spec.updated_at).toLocaleDateString("en-US", { timeZone: "UTC", year: "numeric", month: "short", day: "numeric" })}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-[10px] font-condensed uppercase tracking-widest rounded px-2 py-0.5 ${
                  spec.status === "final" ? "text-green-300 bg-green-900/30" : "text-white/30 bg-white/10"
                }`}>
                  {spec.status}
                </span>
                <span className="text-white/20 group-hover:text-[#f08122] transition-colors">→</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
