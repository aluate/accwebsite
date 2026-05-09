export const dynamic = "force-dynamic";

import Link from "next/link";
import { sql } from "@/lib/db";
import { JobsClient } from "@/components/JobsClient";

type Job = Record<string, unknown>;

export default async function JobsPage() {
  const jobs = await sql`SELECT * FROM jobs ORDER BY seq DESC` as Job[];

  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-heading text-3xl uppercase tracking-wide text-white">Jobs</h1>
          <p className="text-white/40 text-xs font-condensed uppercase tracking-widest mt-1">
            {jobs.length} total
          </p>
        </div>
        <Link
          href="/jobs/new"
          className="bg-[#f08122] hover:bg-[#d9711e] text-white font-condensed uppercase tracking-widest text-sm py-2.5 px-5 rounded transition-colors"
        >
          + New Job
        </Link>
      </div>

      <JobsClient jobs={jobs} />
    </section>
  );
}
