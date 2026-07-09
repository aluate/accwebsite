export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { sql } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { LifecyclePanel } from "@/components/LifecyclePanel";
import { JobFilesPanel } from "@/components/JobFilesPanel";

type Spec = {
  id: string;
  job_id: string;
  name: string;
  status: string;
  lifecycle_state: string;
  updated_at: string;
};
type Job = {
  id: string;
  client_name: string;
  builder_name: string | null;
  builder_company: string | null;
  site_address: string;
};

// Phase 6 — engineering view.
//
// Read-mostly: engineer (or admin) lands here from a notification or a Jobs
// link, sees the full spec read-only, has the lifecycle panel for "Mark
// Engineered" forward / "Send back to PM" backward transitions, plus the
// job's files panel for uploading the engineered drawings PDF.
//
// Editing the actual spec data lives on the existing /jobs/[id]/residential/[specId]
// page; engineers can navigate there directly. We don't duplicate the form here.
export default async function EngineeringSpecPage({ params }: { params: Promise<{ specId: string }> }) {
  await requireRole(["engineer", "admin"]);
  const { specId } = await params;

  const [spec] = await sql`
    SELECT id, job_id, name, status, lifecycle_state, updated_at
    FROM residential_specs WHERE id = ${specId}
  ` as Spec[];
  if (!spec) notFound();

  const [job] = await sql`
    SELECT id, client_name, builder_name, builder_company, site_address
    FROM jobs WHERE id = ${spec.job_id}
  ` as Job[];
  if (!job) notFound();

  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
      <div className="flex items-center gap-4 mb-8">
        <Link
          href="/engineer"
          className="font-condensed uppercase tracking-widest text-xs text-white/30 hover:text-[#f08122] transition-colors"
        >
          ← Engineering Queue
        </Link>
        <span className="text-white/15 text-xs">·</span>
        <Link
          href={`/jobs/${spec.job_id}`}
          className="font-condensed uppercase tracking-widest text-xs text-white/20 hover:text-white/50 transition-colors"
        >
          View Full Job
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4 mb-10">
        <div>
          <p className="text-[#f08122] font-condensed uppercase tracking-[0.3em] text-xs mb-1">Engineering · {job.id}</p>
          <h1 className="font-heading text-3xl uppercase tracking-wide text-white">{job.client_name}</h1>
          <p className="text-white/40 text-sm mt-1">{job.site_address}</p>
          <p className="text-white/30 text-xs mt-1 font-condensed uppercase tracking-widest">
            Spec: <span className="text-white/60">{spec.name}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/jobs/${spec.job_id}/residential/${spec.id}`}
            className="text-white/40 hover:text-white font-condensed uppercase tracking-widest text-xs border border-white/15 hover:border-white/40 rounded px-3 py-1.5 transition-colors"
          >
            Open Spec Form
          </Link>
        </div>
      </div>

      {/* Lifecycle controls — engineer's primary actions */}
      <div className="bg-[#2d2d2d] rounded p-5 mb-8">
        <p className="text-[#f08122] font-condensed uppercase tracking-[0.3em] text-xs mb-3">Lifecycle</p>
        <LifecyclePanel specId={spec.id} />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Drawings + files */}
        <div>
          <p className="text-[#f08122] font-condensed uppercase tracking-[0.3em] text-xs mb-3">Drawings &amp; Files</p>
          <JobFilesPanel jobId={spec.job_id} />
        </div>

        {/* Engineering checklist (static for v1) */}
        <div className="bg-[#2d2d2d] rounded p-5">
          <p className="text-[#f08122] font-condensed uppercase tracking-[0.3em] text-xs mb-3">Engineering Checklist</p>
          <ul className="text-white/60 text-sm space-y-2 list-decimal pl-5">
            <li>Pull the latest CV file from <a href={`/jobs/${spec.job_id}`} className="text-[#f08122] hover:underline">the job page</a>.</li>
            <li>Verify carcass / drawer-box / edgeband match the spec form (the $70k columns).</li>
            <li>Upload the engineered drawings PDF as kind=<code className="text-white/80">drawings</code>.</li>
            <li>If anything in the spec is wrong, hit <strong>Re-spin</strong> on the lifecycle panel and put the reason in writing — it goes back to PM as DRAFT.</li>
            <li>If everything checks out, hit <strong>Mark Engineered</strong> (advances to ENGINEERED).</li>
            <li>Once the WO# exists, advance to RELEASED_TO_SHOP.</li>
          </ul>
          <p className="text-white/30 text-xs mt-4 font-condensed uppercase tracking-widest italic">
            WO# entry + auto-render of combined drawings — coming next phase.
          </p>
        </div>
      </div>
    </section>
  );
}
