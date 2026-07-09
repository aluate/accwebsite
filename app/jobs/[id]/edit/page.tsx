export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { sql } from "@/lib/db";
import { IntakeForm } from "@/components/IntakeForm";

type Job = {
  id: string; job_type: string; client_name: string; client_email: string;
  client_phone: string; site_address: string; city: string; pm: string;
  builder_name: string; builder_email: string; builder_phone: string;
  builder_company: string; delivery_date: string; notes: string;
  notes_install: string | null; notes_finishing: string | null;
  notes_shop: string | null;    notes_client: string | null;
  mod_residential: number; mod_commercial: number; mod_trim: number; mod_doors: number;
};

export default async function EditJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [job] = await sql`SELECT * FROM jobs WHERE id = ${id}` as Job[];
  if (!job) notFound();

  // Coerce nullable Phase 1B columns to "" so the form's Partial<string> typing works.
  const initial = {
    ...job,
    notes_install:   job.notes_install   ?? "",
    notes_finishing: job.notes_finishing ?? "",
    notes_shop:      job.notes_shop      ?? "",
    notes_client:    job.notes_client    ?? "",
  };

  return (
    <section className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
      <Link
        href={`/jobs/${id}`}
        className="font-condensed uppercase tracking-widest text-xs text-white/30 hover:text-[#f08122] transition-colors mb-8 block"
      >
        Back to Job
      </Link>
      <h1 className="font-heading text-3xl uppercase tracking-wide text-white mb-1">Edit Job</h1>
      <p className="text-[#f08122] font-condensed uppercase tracking-widest text-sm mb-10">{job.id}</p>
      <IntakeForm initial={initial} />
    </section>
  );
}
