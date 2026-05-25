export const dynamic = "force-dynamic";

import Link from "next/link";
import { sql } from "@/lib/db";
import { requireRole } from "@/lib/auth";

type StageCount = { status: string; cnt: number };
type AgingJob   = { id: string; job_number: string | null; client_name: string; site_address: string; pm: string | null; status: string; days_in_stage: number };
type PunchJob   = { id: string; job_number: string | null; client_name: string; open_count: number };
type ActivityRow = { id: string; job_id: string | null; event_type: string; actor: string; from_state: string | null; to_state: string | null; occurred_at: string };
type WarrantyCounts = { open_count: number; in_progress_count: number };

const STATUS_LABEL: Record<string, string> = {
  intake: "Intake", bid: "Bid", design: "Design", field_dims: "Field Dims",
  engineering: "Engineering", procurement: "Procurement", production: "Production",
  delivery: "Delivery", install: "Install", punch: "Punch", on_hold: "On Hold",
};

const STATUS_COLOR: Record<string, string> = {
  intake: "text-white/40 bg-white/10", bid: "text-sky-300 bg-sky-900/30",
  design: "text-sky-300 bg-sky-900/30", field_dims: "text-sky-300 bg-sky-900/30",
  engineering: "text-blue-300 bg-blue-900/30", procurement: "text-blue-300 bg-blue-900/30",
  production: "text-yellow-300 bg-yellow-900/30", delivery: "text-amber-300 bg-amber-900/30",
  install: "text-purple-300 bg-purple-900/30", punch: "text-pink-300 bg-pink-900/30",
  on_hold: "text-orange-300 bg-orange-900/30",
};

function fmtAge(days: number) {
  if (days === 0) return "today";
  if (days === 1) return "1 day";
  return `${days}d`;
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = (now.getTime() - d.getTime()) / 1000;
  if (diff < 60)  return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default async function DashboardPage() {
  await requireRole(["admin", "pm"]);

  const [stageCounts, agingJobs, punchJobs, recentActivity, totalJobs, warrantyCounts] = await Promise.all([
    sql`
      SELECT status, COUNT(*)::int AS cnt FROM jobs
      WHERE status NOT IN ('complete') GROUP BY status ORDER BY cnt DESC
    ` as Promise<StageCount[]>,
    sql`
      SELECT j.id, j.job_number, j.client_name, j.site_address, j.pm, j.status,
        DATE_PART('day', NOW() - al.occurred_at::timestamptz)::int AS days_in_stage
      FROM jobs j
      LEFT JOIN LATERAL (
        SELECT occurred_at FROM activity_log
        WHERE job_id = j.id AND event_type = 'status_change'
        ORDER BY occurred_at DESC LIMIT 1
      ) al ON true
      WHERE j.status NOT IN ('complete', 'intake', 'bid', 'on_hold')
        AND DATE_PART('day', NOW() - al.occurred_at::timestamptz) > 10
      ORDER BY days_in_stage DESC NULLS LAST
      LIMIT 10
    ` as Promise<AgingJob[]>,
    sql`
      SELECT j.id, j.job_number, j.client_name, COUNT(p.id)::int AS open_count
      FROM jobs j
      JOIN punch_list_items p ON p.job_id = j.id AND p.status = 'open'
      GROUP BY j.id, j.job_number, j.client_name
      ORDER BY open_count DESC LIMIT 8
    ` as Promise<PunchJob[]>,
    sql`
      SELECT id, job_id, event_type, actor, from_state, to_state, occurred_at
      FROM activity_log ORDER BY occurred_at DESC LIMIT 20
    ` as Promise<ActivityRow[]>,
    sql`SELECT COUNT(*)::int AS n FROM jobs WHERE status NOT IN ('complete')` as Promise<{ n: number }[]>,
    sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'open')::int AS open_count,
        COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress_count
      FROM warranty_items
    ` as Promise<WarrantyCounts[]>,
  ]);

  const total = totalJobs[0]?.n ?? 0;
  const stuckCount = agingJobs.length;
  const openPunch = punchJobs.reduce((s, j) => s + j.open_count, 0);
  const openWarranty = (warrantyCounts[0]?.open_count ?? 0) + (warrantyCounts[0]?.in_progress_count ?? 0);

  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-heading text-3xl uppercase tracking-wide text-white">Dashboard</h1>
          <p className="text-white/30 text-xs font-condensed uppercase tracking-widest mt-1">{total} active jobs</p>
        </div>
        <div className="flex gap-3">
          <Link href="/jobs" className="text-white/30 hover:text-[#f08122] font-condensed uppercase tracking-widest text-xs border border-white/10 rounded px-3 py-1.5 transition-colors">All Jobs</Link>
          <Link href="/schedule" className="text-white/30 hover:text-[#f08122] font-condensed uppercase tracking-widest text-xs border border-white/10 rounded px-3 py-1.5 transition-colors">Schedule</Link>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <div className="bg-[#2d2d2d] rounded-lg p-4 text-center">
          <p className="text-3xl font-heading text-white">{total}</p>
          <p className="text-white/40 text-xs font-condensed uppercase tracking-widest mt-1">Active Jobs</p>
        </div>
        <div className={"bg-[#2d2d2d] rounded-lg p-4 text-center " + (stuckCount > 0 ? "border border-amber-700/40" : "")}>
          <p className={"text-3xl font-heading " + (stuckCount > 0 ? "text-amber-400" : "text-white")}>{stuckCount}</p>
          <p className="text-white/40 text-xs font-condensed uppercase tracking-widest mt-1">Stuck &gt;10 Days</p>
        </div>
        <Link href="/punch" className={"bg-[#2d2d2d] rounded-lg p-4 text-center hover:bg-[#333] transition-colors " + (openPunch > 0 ? "border border-pink-700/40" : "")}>
          <p className={"text-3xl font-heading " + (openPunch > 0 ? "text-pink-400" : "text-white")}>{openPunch}</p>
          <p className="text-white/40 text-xs font-condensed uppercase tracking-widest mt-1">Open Punch Items</p>
        </Link>
        <Link href="/warranty" className={"bg-[#2d2d2d] rounded-lg p-4 text-center hover:bg-[#333] transition-colors " + (openWarranty > 0 ? "border border-orange-700/40" : "")}>
          <p className={"text-3xl font-heading " + (openWarranty > 0 ? "text-orange-400" : "text-white")}>{openWarranty}</p>
          <p className="text-white/40 text-xs font-condensed uppercase tracking-widest mt-1">Open Warranty</p>
        </Link>
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-6">
        {/* Pipeline by stage */}
        <div className="bg-[#2d2d2d] rounded-lg p-5">
          <p className="text-[#f08122] font-condensed uppercase tracking-[0.3em] text-xs mb-4">Pipeline by Stage</p>
          {stageCounts.length === 0 ? (
            <p className="text-white/20 text-xs font-condensed uppercase tracking-widest">No active jobs</p>
          ) : (
            <div className="space-y-2">
              {stageCounts.map((s) => {
                const maxCnt = Math.max(...stageCounts.map((x) => x.cnt));
                const pct = maxCnt > 0 ? (s.cnt / maxCnt) * 100 : 0;
                const cls = STATUS_COLOR[s.status] ?? "text-white/40 bg-white/10";
                return (
                  <div key={s.status} className="flex items-center gap-3">
                    <span className={"text-[10px] font-condensed uppercase tracking-wider px-2 py-0.5 rounded w-28 text-center shrink-0 " + cls}>
                      {STATUS_LABEL[s.status] ?? s.status}
                    </span>
                    <div className="flex-1 bg-white/5 rounded-full h-1.5">
                      <div className="bg-[#f08122]/60 h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-white/50 text-xs font-condensed w-4 text-right shrink-0">{s.cnt}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Aging alerts */}
        <div className="bg-[#2d2d2d] rounded-lg p-5">
          <p className="text-[#f08122] font-condensed uppercase tracking-[0.3em] text-xs mb-4">
            Aging Alerts <span className="text-white/30 normal-case tracking-normal">(stuck &gt;10 days)</span>
          </p>
          {agingJobs.length === 0 ? (
            <p className="text-green-400/60 text-xs font-condensed uppercase tracking-widest">All jobs moving — nothing stuck</p>
          ) : (
            <div className="space-y-2">
              {agingJobs.map((j) => (
                <Link key={j.id} href={`/jobs/${j.job_number ?? j.id}`}
                  className="flex items-center gap-3 hover:bg-white/5 rounded px-2 py-1.5 -mx-2 transition-colors group">
                  <span className={"text-[10px] font-condensed uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 " + (STATUS_COLOR[j.status] ?? "text-white/40 bg-white/10")}>
                    {STATUS_LABEL[j.status] ?? j.status}
                  </span>
                  <span className="flex-1 text-white/70 text-xs truncate group-hover:text-white">{j.client_name}</span>
                  <span className={"text-xs font-condensed shrink-0 " + (j.days_in_stage > 20 ? "text-red-400" : "text-amber-400")}>
                    {fmtAge(j.days_in_stage)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Open punch */}
        <div className="bg-[#2d2d2d] rounded-lg p-5">
          <p className="text-[#f08122] font-condensed uppercase tracking-[0.3em] text-xs mb-4">Open Punch Items</p>
          {punchJobs.length === 0 ? (
            <p className="text-green-400/60 text-xs font-condensed uppercase tracking-widest">No open punch items</p>
          ) : (
            <div className="space-y-2">
              {punchJobs.map((j) => (
                <Link key={j.id} href={`/jobs/${j.job_number ?? j.id}`}
                  className="flex items-center gap-3 hover:bg-white/5 rounded px-2 py-1.5 -mx-2 transition-colors group">
                  <span className="flex-1 text-white/70 text-xs truncate group-hover:text-white">{j.client_name}</span>
                  <span className="text-pink-400 text-xs font-condensed shrink-0">{j.open_count} open</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Recent activity */}
        <div className="bg-[#2d2d2d] rounded-lg p-5">
          <p className="text-[#f08122] font-condensed uppercase tracking-[0.3em] text-xs mb-4">Recent Activity</p>
          {recentActivity.length === 0 ? (
            <p className="text-white/20 text-xs font-condensed uppercase tracking-widest">No activity yet</p>
          ) : (
            <div className="space-y-2">
              {recentActivity.map((a) => {
                const desc = a.from_state && a.to_state
                  ? `${a.from_state} → ${a.to_state}`
                  : a.event_type.replace(/_/g, " ");
                return (
                  <div key={a.id} className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      {a.job_id ? (
                        <Link href={`/jobs/${a.job_id}`} className="text-white/60 hover:text-white text-xs truncate block">{desc}</Link>
                      ) : (
                        <span className="text-white/60 text-xs truncate block">{desc}</span>
                      )}
                      <span className="text-white/25 text-[10px] font-condensed">{a.actor}</span>
                    </div>
                    <span className="text-white/25 text-[10px] font-condensed shrink-0">{fmtTime(a.occurred_at)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
