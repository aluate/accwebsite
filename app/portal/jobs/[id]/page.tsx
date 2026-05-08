import Link from "next/link";
import { sql } from "@/lib/db";
import { requirePortalAccessToJob } from "@/lib/portal-auth";
import { listRequiredInputs, summarize } from "@/lib/portal-required-inputs";
import { PortalJobClient } from "@/components/PortalJobClient";

type FullJob = {
  id: string; client_name: string; site_address: string; city: string | null;
  status: string; pm: string | null; builder_company: string | null;
  delivery_date: string | null; delivery_clock_started_at: string | null;
  estimated_delivery_at: string | null;
};

export default async function PortalJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePortalAccessToJob(id);

  const [job] = await sql`
    SELECT id, client_name, site_address, city, status, pm, builder_company,
           delivery_date, delivery_clock_started_at, estimated_delivery_at
    FROM jobs WHERE id = ${id}
  ` as FullJob[];

  const inputs  = await listRequiredInputs(id);
  const summary = await summarize(id);

  // Latest drawing from DB (replaces old filesystem scan).
  type DrawingRow = { filename: string; storage_path: string };
  const [latestDrawingRow] = await sql`
    SELECT filename, storage_path FROM job_files
    WHERE job_id = ${id} AND kind = 'drawings'
    ORDER BY uploaded_at DESC
    LIMIT 1
  ` as DrawingRow[];

  const latestDrawing = latestDrawingRow
    ? { filename: latestDrawingRow.filename, size: 0, uploaded_at: "" }
    : null;

  // Existing change requests + drawing comments for this job.
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
    SELECT * FROM builder_change_requests WHERE job_id = ${id} ORDER BY submitted_at DESC LIMIT 50
  ` as CRRow[];
  const comments: CommentRow[] = latestDrawingRow
    ? await sql`
        SELECT * FROM drawing_comments
        WHERE job_id = ${id} AND drawing_filename = ${latestDrawingRow.filename}
        ORDER BY submitted_at
      ` as CommentRow[]
    : [];

  return (
    <main className="min-h-screen bg-[#111] text-white">
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link href="/portal/jobs" className="text-white/30 hover:text-[#f08122] font-condensed uppercase tracking-widest text-xs">← Jobs</Link>
          <p className="text-[#f08122] font-condensed uppercase tracking-widest text-xs mt-2">{job.id}</p>
          <h1 className="text-white font-heading text-xl uppercase tracking-wide">{job.client_name}</h1>
          <p className="text-white/40 text-xs mt-0.5">{job.site_address}{job.city ? `, ${job.city}` : ""}</p>
          {job.pm && <p className="text-white/30 text-[10px] font-condensed uppercase tracking-widest mt-1">PM: {job.pm}</p>}
        </div>
        <form action="/api/portal/auth/logout" method="POST">
          <button type="submit" className="text-white/30 hover:text-white font-condensed uppercase tracking-widest text-xs">Sign out</button>
        </form>
      </header>

      <PortalJobClient
        jobId={id}
        initialInputs={inputs}
        initialSummary={summary}
        initialJob={{
          status: job.status,
          delivery_clock_started_at: job.delivery_clock_started_at,
          estimated_delivery_at: job.estimated_delivery_at,
        }}
        latestDrawing={latestDrawing}
        initialComments={comments}
        initialChangeRequests={changeRequests}
      />
    </main>
  );
}
