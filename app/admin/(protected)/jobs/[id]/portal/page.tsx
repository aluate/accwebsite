export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import { JobPortalAdmin } from "@/components/JobPortalAdmin";
import { listRequiredInputs, summarize } from "@/lib/portal-required-inputs";

type JobRow = {
  id: string; client_name: string; builder_company: string | null;
  builder_portal_enabled: boolean; target_delivery_weeks: number;
  delivery_clock_started_at: string | null; estimated_delivery_at: string | null;
};

export default async function JobPortalAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [job] = await sql`
    SELECT id, client_name, builder_company, builder_portal_enabled, target_delivery_weeks,
           delivery_clock_started_at, estimated_delivery_at FROM jobs WHERE id = ${id}
  ` as JobRow[];
  if (!job) notFound();

  const inputs = await listRequiredInputs(id);
  const summary = await summarize(id);

  type CRRow = {
    id: string; submitted_at: string; submitted_by: string; body: string;
    status: string; resolved_at: string | null; resolution_notes: string | null;
  };
  type CommentRow = {
    id: string; drawing_filename: string; page_number: number | null;
    cabinet_ref: string | null; body: string;
    submitted_at: string; submitted_by: string; submitted_role: string;
    status: string;
  };
  const changeRequests = await sql`
    SELECT * FROM builder_change_requests WHERE job_id = ${id} ORDER BY submitted_at DESC
  ` as CRRow[];
  const comments = await sql`
    SELECT * FROM drawing_comments WHERE job_id = ${id} ORDER BY submitted_at DESC
  ` as CommentRow[];

  return (
    <div className="min-h-screen bg-[#111] text-white">
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link href={`/jobs/${id}`} className="text-white/30 hover:text-[#f08122] font-condensed uppercase tracking-widest text-xs">← Back to job</Link>
          <p className="text-[#f08122] font-condensed uppercase tracking-widest text-xs mt-2">{job.id}</p>
          <h1 className="font-heading text-xl uppercase tracking-wide">{job.client_name}</h1>
          <p className="text-white/40 text-xs">Builder: {job.builder_company || "(walk-in residential)"}</p>
        </div>
        <Link href="/admin/portal-accounts" className="text-white/40 hover:text-[#f08122] font-condensed uppercase tracking-widest text-xs border border-white/15 hover:border-[#f08122] rounded px-3 py-2">
          Manage Portal Accounts
        </Link>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <JobPortalAdmin
          jobId={id}
          initialJob={{
            builder_portal_enabled: !!job.builder_portal_enabled,
            target_delivery_weeks: job.target_delivery_weeks,
            delivery_clock_started_at: job.delivery_clock_started_at,
            estimated_delivery_at: job.estimated_delivery_at,
          }}
          initialInputs={inputs}
          initialSummary={summary}
          initialChangeRequests={changeRequests}
          initialComments={comments}
        />
      </main>
    </div>
  );
}
