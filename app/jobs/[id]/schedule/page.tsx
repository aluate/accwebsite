import { notFound } from "next/navigation";
import Link from "next/link";
import { sql, withDbTimeout } from "@/lib/db";
import { requireBuilder } from "@/lib/auth";
import { jobEvents, listCrews } from "@/lib/schedule";
import { PhaseIntakeClient } from "@/components/PhaseIntakeClient";

export default async function JobSchedulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireBuilder();
  // PMs (role="user") and admins can add/delete phases; installers are read-only.
  const canEdit = session.role === "admin" || session.role === "user";

  // Resolve job_number to internal UUID, same as the main job detail page.
  // Without this, navigating via ACC-YYYY-NNNN URLs returns no events because
  // job_events.job_id stores the UUID, not the job_number.
  // withDbTimeout prevents Vercel Lambda from hanging until the 10s hard kill.
  const jobRows = await withDbTimeout(() =>
    sql`SELECT id, client_name, site_address FROM jobs WHERE id = ${id} OR job_number = ${id}`
  );
  if (!jobRows.length) notFound();
  const job = jobRows[0];
  const internalId = job.id as string;

  const [events, crews, labels] = await withDbTimeout(() =>
    Promise.all([
      jobEvents(internalId),
      listCrews({ activeOnly: true }),
      sql`SELECT * FROM event_phase_labels WHERE active = 1 ORDER BY sort_order, label`,
    ])
  );

  // Only install events
  const installEvents = events.filter((e) => e.event_type === "install");

  return (
    <section className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
      <Link
        href={`/jobs/${id}`}
        className="font-condensed uppercase tracking-widest text-xs text-white/30 hover:text-[#f08122] transition-colors mb-6 block"
      >
        ← {job.client_name as string}
      </Link>

      <div className="flex items-baseline justify-between mb-8">
        <div>
          <p className="font-condensed text-[#f08122] uppercase tracking-widest text-sm">{id}</p>
          <h1 className="font-heading text-2xl uppercase tracking-wide text-white">Install Schedule</h1>
        </div>
        <Link
          href="/schedule"
          className="text-xs font-condensed uppercase tracking-widest text-white/30 hover:text-[#f08122] border border-white/10 hover:border-[#f08122]/30 px-3 py-1.5 rounded transition-colors"
        >
          Wall Calendar →
        </Link>
      </div>

      <PhaseIntakeClient
        jobId={internalId}
        isAdmin={canEdit}
        installEvents={installEvents as Parameters<typeof PhaseIntakeClient>[0]["installEvents"]}
        crews={crews}
        phaseLabels={labels as Parameters<typeof PhaseIntakeClient>[0]["phaseLabels"]}
      />
    </section>
  );
}
