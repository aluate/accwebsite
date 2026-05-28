export const dynamic = "force-dynamic";

import Link from "next/link";
import { sql, withDbTimeout } from "@/lib/db";
import { requireRole } from "@/lib/auth";

type WarrantyRow = {
  id: string; job_id: string; reported_at: string; reported_by: string;
  category: string; description: string; status: string; priority: string;
  resolved_at: string | null; resolution: string | null;
  client_name: string; job_number: string | null;
};

const STATUS_COLOR: Record<string, string> = {
  open:        "text-red-400 bg-red-900/30 border-red-700/40",
  in_progress: "text-amber-300 bg-amber-900/30 border-amber-700/40",
  resolved:    "text-green-400 bg-green-900/30 border-green-700/40",
  closed:      "text-white/30 bg-white/5 border-white/10",
};

const PRIORITY_COLOR: Record<string, string> = {
  urgent: "text-red-400", high: "text-amber-400",
  normal: "text-white/40", low: "text-white/25",
};

function fmtDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][m-1]} ${d}, ${y}`;
}

export default async function WarrantyListPage() {
  const [, items] = await withDbTimeout(() => Promise.all([
    requireRole(["admin", "pm"]),
    sql`
    SELECT w.*, j.client_name, j.job_number
    FROM warranty_items w
    JOIN jobs j ON j.id = w.job_id
    ORDER BY
      CASE w.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
      CASE w.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
      w.reported_at DESC
  ` as Promise<WarrantyRow[]>,
  ]));

  const openCount = items.filter((i) => i.status === "open").length;
  const activeCount = items.filter((i) => i.status === "in_progress").length;

  return (
    <section className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-heading text-3xl uppercase tracking-wide text-white">Warranty / Callbacks</h1>
          <p className="text-white/30 text-xs font-condensed uppercase tracking-widest mt-1">
            {openCount} open · {activeCount} in progress · {items.length} total
          </p>
        </div>
        <Link href="/jobs" className="text-white/30 hover:text-[#f08122] font-condensed uppercase tracking-widest text-xs border border-white/10 rounded px-3 py-1.5 transition-colors">
          All Jobs
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-24">
          <p className="text-white/20 font-condensed uppercase tracking-widest text-sm">No warranty items yet</p>
          <p className="text-white/10 text-xs mt-2">Log issues from any job page.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const sc = STATUS_COLOR[item.status] ?? "text-white/40 bg-white/5 border-white/10";
            const pc = PRIORITY_COLOR[item.priority] ?? "text-white/40";
            return (
              <div key={item.id} className="bg-[#2d2d2d] rounded-lg px-5 py-4 flex items-start gap-4">
                <span className={"text-[10px] font-condensed uppercase tracking-wider px-2 py-0.5 rounded border shrink-0 mt-0.5 " + sc}>
                  {item.status.replace(/_/g, " ")}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-white/80 text-sm leading-snug">{item.description}</p>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    <Link href={`/jobs/${item.job_number ?? item.job_id}`}
                      className="text-[#f08122] text-xs font-condensed hover:underline">
                      {item.client_name}
                    </Link>
                    <span className="text-white/25 text-[10px] font-condensed">{item.category}</span>
                    <span className="text-white/25 text-[10px] font-condensed">{fmtDate(item.reported_at)}</span>
                    <span className="text-white/25 text-[10px] font-condensed">{item.reported_by}</span>
                    {item.priority !== "normal" && (
                      <span className={"text-[10px] font-condensed uppercase " + pc}>{item.priority}</span>
                    )}
                  </div>
                  {item.resolution && (
                    <p className="text-green-400/60 text-xs mt-1 italic">✓ {item.resolution}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
