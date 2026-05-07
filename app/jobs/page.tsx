import Link from "next/link";
import { sql } from "@/lib/db";

const STATUS_COLOR: Record<string, string> = {
  intake:     "text-white/40 bg-white/10",
  active:     "text-blue-300 bg-blue-900/30",
  production: "text-yellow-300 bg-yellow-900/30",
  complete:   "text-green-300 bg-green-900/30",
  on_hold:    "text-orange-300 bg-orange-900/30",
};

const MODULE_LABELS: Record<string, string> = {
  mod_residential: "Resi",
  mod_commercial:  "Comm",
  mod_trim:        "Trim",
  mod_doors:       "Doors",
};

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

      {jobs.length === 0 ? (
        <div className="text-center py-24 text-white/20 font-condensed uppercase tracking-widest text-sm">
          No jobs yet — create one to get started.
        </div>
      ) : (
        <div className="space-y-2">
          {jobs.map((job) => (
            <Link
              key={job.id as string}
              href={`/jobs/${job.id}`}
              className="flex items-center gap-4 bg-[#2d2d2d] hover:bg-[#353535] rounded px-5 py-4 transition-colors group"
            >
              {/* ID */}
              <span className="font-condensed text-[#f08122] text-sm w-36 shrink-0">
                {job.id as string}
              </span>

              {/* Client + Address */}
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate">{job.client_name as string}</p>
                <p className="text-white/40 text-xs truncate">{job.site_address as string}{job.city ? `, ${job.city}` : ""}</p>
              </div>

              {/* PM */}
              <span className="text-white/50 text-xs hidden md:block w-32 shrink-0 truncate">
                {(job.pm as string) || "—"}
              </span>

              {/* Modules + Express badge */}
              <div className="hidden sm:flex gap-1 shrink-0 items-center">
                {job.builder_name ? (
                  <span className="text-[10px] font-condensed uppercase tracking-wider text-[#f08122] bg-[#f08122]/15 border border-[#f08122]/20 rounded px-1.5 py-0.5">
                    Express
                  </span>
                ) : null}
                {Object.entries(MODULE_LABELS).map(([key, label]) =>
                  job[key] ? (
                    <span key={key} className="text-[10px] font-condensed uppercase tracking-wider text-white/50 bg-white/10 rounded px-1.5 py-0.5">
                      {label}
                    </span>
                  ) : null
                )}
              </div>

              {/* Status */}
              <span className={`text-[10px] font-condensed uppercase tracking-widest rounded px-2 py-0.5 shrink-0 ${STATUS_COLOR[job.status as string] ?? "text-white/40 bg-white/10"}`}>
                {job.status as string}
              </span>

              {/* Date */}
              <span className="text-white/30 text-xs hidden lg:block w-24 shrink-0 text-right">
                {new Date(job.created_at as string).toLocaleDateString()}
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
