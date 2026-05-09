export const dynamic = "force-dynamic";

import Link from "next/link";
import { sql } from "@/lib/db";
import { requireRole } from "@/lib/auth";

type SpecRow = {
  id: string;
  name: string;
  lifecycle_state: string;
  updated_at: string;
  job_id: string;
  client_name: string;
  site_address: string;
  city: string | null;
  pm: string | null;
};

const STATE_LABEL: Record<string, string> = {
  RELEASED_TO_ENG: "Released to Engineering",
  ENGINEERED:      "Engineered",
  PM_REVIEW:       "PM Review",
  CLIENT_APPROVED: "Client Approved",
  RELEASED_TO_SHOP:"Released to Shop",
};

const STATE_COLOR: Record<string, string> = {
  RELEASED_TO_ENG:  "text-indigo-300 bg-indigo-900/30 border-indigo-700/40",
  ENGINEERED:       "text-purple-300 bg-purple-900/30 border-purple-700/40",
  PM_REVIEW:        "text-blue-300 bg-blue-900/30 border-blue-700/40",
  CLIENT_APPROVED:  "text-blue-300 bg-blue-900/30 border-blue-700/40",
  RELEASED_TO_SHOP: "text-green-300 bg-green-900/30 border-green-700/40",
};

function fmtDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${MON[m-1]} ${d}, ${y}`;
}

export default async function EngineerPage() {
  const session = await requireRole(["engineer", "admin"]);

  const specs = await sql<SpecRow[]>`
    SELECT
      rs.id, rs.name, rs.lifecycle_state, rs.updated_at,
      j.id AS job_id, j.client_name, j.site_address, j.city, j.pm
    FROM residential_specs rs
    JOIN jobs j ON j.id = rs.job_id
    WHERE rs.lifecycle_state IN ('RELEASED_TO_ENG', 'ENGINEERED', 'PM_REVIEW')
    ORDER BY
      CASE rs.lifecycle_state
        WHEN 'RELEASED_TO_ENG' THEN 0
        WHEN 'PM_REVIEW'       THEN 1
        WHEN 'ENGINEERED'      THEN 2
        ELSE 3
      END,
      rs.updated_at DESC
  `;

  const queue     = specs.filter((s) => s.lifecycle_state === "RELEASED_TO_ENG");
  const review    = specs.filter((s) => s.lifecycle_state === "PM_REVIEW");
  const engineered = specs.filter((s) => s.lifecycle_state === "ENGINEERED");

  return (
    <section className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading text-2xl uppercase tracking-wide text-white">Engineering Queue</h1>
          <p className="text-white/30 text-xs font-condensed uppercase tracking-widest mt-1">
            {session.name} · {queue.length} waiting
          </p>
        </div>
        <Link
          href="/jobs"
          className="text-white/30 hover:text-[#f08122] font-condensed uppercase tracking-widest text-xs border border-white/10 rounded px-3 py-1.5 transition-colors"
        >
          All Jobs
        </Link>
      </div>

      {specs.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-white/20 font-condensed uppercase tracking-widest text-sm">No specs in queue</p>
          <p className="text-white/10 text-xs mt-2">Specs released to engineering will appear here.</p>
        </div>
      ) : (
        <div className="space-y-8">
          <QueueSection title="Needs Engineering" count={queue.length} specs={queue} />
          <QueueSection title="In PM Review"      count={review.length} specs={review} />
          <QueueSection title="Engineered"        count={engineered.length} specs={engineered} dimmed />
        </div>
      )}
    </section>
  );
}

function QueueSection({ title, count, specs, dimmed = false }: {
  title: string; count: number; specs: SpecRow[]; dimmed?: boolean;
}) {
  if (count === 0) return null;
  return (
    <div className={dimmed ? "opacity-50" : ""}>
      <p className="text-white/30 text-[10px] font-condensed uppercase tracking-widest mb-3">
        {title} — {count}
      </p>
      <div className="space-y-3">
        {specs.map((s) => (
          <Link
            key={s.id}
            href={`/engineering/${s.id}`}
            className="block bg-[#2d2d2d] hover:bg-[#353535] rounded-lg p-4 transition-colors group"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-[#f08122] font-condensed text-xs uppercase tracking-widest">{s.job_id}</span>
                  <span className={`text-[10px] font-condensed uppercase tracking-widest px-2 py-0.5 rounded border ${STATE_COLOR[s.lifecycle_state] ?? "text-white/40 bg-white/5 border-white/10"}`}>
                    {STATE_LABEL[s.lifecycle_state] ?? s.lifecycle_state}
                  </span>
                </div>
                <p className="text-white font-medium text-base leading-tight">{s.client_name}</p>
                <p className="text-white/40 text-xs mt-0.5">
                  {s.name}{s.site_address ? ` · ${s.site_address}${s.city ? `, ${s.city}` : ""}` : ""}
                </p>
                <div className="flex items-center gap-3 mt-2">
                  {s.pm && <span className="text-white/30 text-[10px] font-condensed">PM: {s.pm}</span>}
                  <span className="text-white/20 text-[10px] font-condensed">Updated {fmtDate(s.updated_at)}</span>
                </div>
              </div>
              <span className="text-white/20 group-hover:text-[#f08122] transition-colors text-lg shrink-0 mt-1">→</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
