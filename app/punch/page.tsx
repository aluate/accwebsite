export const dynamic = "force-dynamic";

import Link from "next/link";
import { sql, withDbTimeout } from "@/lib/db";
import { requireRole } from "@/lib/auth";

type PunchRow = {
  id: string;
  job_id: string;
  job_number: string | null;
  client_name: string;
  site_address: string;
  city: string | null;
  job_status: string;
  room_name: string | null;
  general_location: string | null;
  item_description: string;
  type_code: string;
  status: string;
  created_by: string;
  created_at: string;
  completed_by: string | null;
  completed_at: string | null;
};

const TYPE_COLORS: Record<string, string> = {
  "S":   "bg-blue-900/40 text-blue-300",
  "S+M": "bg-purple-900/40 text-purple-300",
  "HP":  "bg-red-900/40 text-red-300",
  "TD":  "bg-amber-900/40 text-amber-300",
};

const TYPE_LABELS: Record<string, string> = {
  "S":   "Supplier",
  "S+M": "Supplier + Me",
  "HP":  "High Priority",
  "TD":  "To Do",
};

const JOB_STATUS_COLORS: Record<string, string> = {
  punch:      "text-pink-400 bg-pink-900/30",
  install:    "text-purple-400 bg-purple-900/30",
  delivery:   "text-amber-400 bg-amber-900/30",
  production: "text-yellow-400 bg-yellow-900/30",
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

async function fetchPunchItems(filter: "open" | "done" | "all"): Promise<PunchRow[]> {
  if (filter === "open") {
    return sql<PunchRow[]>`
      SELECT p.id, p.job_id, j.job_number, j.client_name, j.site_address, j.city,
        j.status AS job_status, r.name AS room_name, p.general_location,
        p.item_description, p.type_code, p.status,
        p.created_by, p.created_at, p.completed_by, p.completed_at
      FROM punch_list_items p
      JOIN jobs j ON j.id = p.job_id
      LEFT JOIN rooms r ON r.id = p.room_id
      WHERE j.status NOT IN ('complete', 'bid', 'design', 'intake')
        AND p.status = 'open'
      ORDER BY
        CASE p.type_code WHEN 'HP' THEN 1 WHEN 'S+M' THEN 2 WHEN 'S' THEN 3 WHEN 'TD' THEN 4 ELSE 5 END,
        p.created_at ASC
    `;
  }
  if (filter === "done") {
    return sql<PunchRow[]>`
      SELECT p.id, p.job_id, j.job_number, j.client_name, j.site_address, j.city,
        j.status AS job_status, r.name AS room_name, p.general_location,
        p.item_description, p.type_code, p.status,
        p.created_by, p.created_at, p.completed_by, p.completed_at
      FROM punch_list_items p
      JOIN jobs j ON j.id = p.job_id
      LEFT JOIN rooms r ON r.id = p.room_id
      WHERE j.status NOT IN ('complete', 'bid', 'design', 'intake')
        AND p.status = 'done'
      ORDER BY p.completed_at DESC
      LIMIT 200
    `;
  }
  return sql<PunchRow[]>`
    SELECT p.id, p.job_id, j.job_number, j.client_name, j.site_address, j.city,
      j.status AS job_status, r.name AS room_name, p.general_location,
      p.item_description, p.type_code, p.status,
      p.created_by, p.created_at, p.completed_by, p.completed_at
    FROM punch_list_items p
    JOIN jobs j ON j.id = p.job_id
    LEFT JOIN rooms r ON r.id = p.room_id
    WHERE j.status NOT IN ('complete', 'bid', 'design', 'intake')
    ORDER BY
      CASE p.status WHEN 'open' THEN 0 ELSE 1 END,
      CASE p.type_code WHEN 'HP' THEN 1 WHEN 'S+M' THEN 2 WHEN 'S' THEN 3 WHEN 'TD' THEN 4 ELSE 5 END,
      p.created_at ASC
    LIMIT 500
  `;
}

type GroupedJob = {
  job_id: string;
  job_number: string | null;
  client_name: string;
  site_address: string;
  city: string | null;
  job_status: string;
  items: PunchRow[];
  openCount: number;
  doneCount: number;
};

function groupByJob(rows: PunchRow[]): GroupedJob[] {
  const map = new Map<string, GroupedJob>();
  for (const row of rows) {
    if (!map.has(row.job_id)) {
      map.set(row.job_id, {
        job_id: row.job_id, job_number: row.job_number,
        client_name: row.client_name, site_address: row.site_address,
        city: row.city, job_status: row.job_status,
        items: [], openCount: 0, doneCount: 0,
      });
    }
    const g = map.get(row.job_id)!;
    g.items.push(row);
    if (row.status === "open") g.openCount++;
    else g.doneCount++;
  }
  return [...map.values()].sort((a, b) => {
    const aHp = a.items.filter(i => i.type_code === "HP" && i.status === "open").length;
    const bHp = b.items.filter(i => i.type_code === "HP" && i.status === "open").length;
    if (aHp !== bHp) return bHp - aHp;
    return b.openCount - a.openCount;
  });
}

export default async function PunchPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const sp = await searchParams;
  const filter = sp.filter === "done" ? "done" : sp.filter === "all" ? "all" : "open";

  const [, rows] = await withDbTimeout(() => Promise.all([
    requireRole(["admin", "pm", "engineer"]),
    fetchPunchItems(filter),
  ]));
  const groups = groupByJob(rows);
  const totalOpen = rows.filter(r => r.status === "open").length;
  const totalDone = rows.filter(r => r.status === "done").length;

  return (
    <section className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-heading text-3xl uppercase tracking-wide text-white">Punch Loop</h1>
          <p className="text-white/40 text-xs font-condensed uppercase tracking-widest mt-1">
            {totalOpen} open · {totalDone} resolved
          </p>
        </div>
        <Link
          href="/jobs"
          className="text-white/40 font-condensed uppercase tracking-widest text-xs border border-white/15 rounded px-3 py-2 hover:border-white/30 transition-colors"
        >
          ← Jobs
        </Link>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6">
        {(["open", "done", "all"] as const).map((f) => (
          <Link
            key={f}
            href={f === "open" ? "/punch" : `/punch?filter=${f}`}
            className={`font-condensed uppercase tracking-widest text-xs px-4 py-2 rounded border transition-colors ${
              filter === f
                ? "border-[#f08122] text-[#f08122] bg-[#f08122]/10"
                : "border-white/15 text-white/40 hover:border-white/30"
            }`}
          >
            {f === "open" ? `Open (${totalOpen})` : f === "done" ? `Done (${totalDone})` : `All (${totalOpen + totalDone})`}
          </Link>
        ))}
      </div>

      {groups.length === 0 && (
        <div className="text-center py-20">
          <p className="text-white/20 font-condensed uppercase tracking-wider text-sm">
            {filter === "open" ? "No open punch items — all clear." : "No items found."}
          </p>
        </div>
      )}

      <div className="space-y-6">
        {groups.map((group) => {
          const statusCls = JOB_STATUS_COLORS[group.job_status] ?? "text-white/40 bg-white/10";
          const location = [group.site_address, group.city].filter(Boolean).join(", ");
          const hpOpen = group.items.filter(i => i.type_code === "HP" && i.status === "open").length;

          return (
            <div key={group.job_id} className="bg-[#1e1e1e] border border-white/10 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08]">
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`shrink-0 text-[10px] font-condensed uppercase tracking-wider px-2 py-0.5 rounded ${statusCls}`}>
                    {group.job_status}
                  </span>
                  {hpOpen > 0 && (
                    <span className="shrink-0 text-[10px] font-condensed text-red-400 bg-red-900/30 px-2 py-0.5 rounded">
                      {hpOpen} HIGH PRI
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="text-white font-medium text-sm truncate">{group.client_name}</p>
                    {location && <p className="text-white/40 text-xs truncate">{location}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-3">
                  <span className="text-xs font-condensed">
                    {group.openCount > 0 && <span className="text-pink-400">{group.openCount} open</span>}
                    {group.openCount > 0 && group.doneCount > 0 && <span className="text-white/20"> · </span>}
                    {group.doneCount > 0 && <span className="text-white/30">{group.doneCount} done</span>}
                  </span>
                  <Link
                    href={`/jobs/${group.job_id}`}
                    className="text-[10px] font-condensed uppercase tracking-widest text-[#f08122] hover:text-[#d9711e] transition-colors"
                  >
                    Job →
                  </Link>
                </div>
              </div>

              <div className="divide-y divide-white/[0.05]">
                {group.items.map((item) => {
                  const typeCls = TYPE_COLORS[item.type_code] ?? "bg-white/10 text-white/60";
                  const typeLabel = TYPE_LABELS[item.type_code] ?? item.type_code;
                  const where = item.room_name ?? item.general_location ?? "General";
                  const isDone = item.status === "done";

                  return (
                    <div key={item.id} className={`flex items-start gap-3 px-5 py-3 ${isDone ? "opacity-50" : ""}`}>
                      <div className={`mt-0.5 shrink-0 w-4 h-4 rounded border ${isDone ? "bg-green-500/40 border-green-500/60" : "border-white/20"} flex items-center justify-center`}>
                        {isDone && <span className="text-green-400 text-[10px] leading-none">✓</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <span className={`text-[10px] font-condensed uppercase tracking-wider px-1.5 py-0.5 rounded ${typeCls}`}>
                            {typeLabel}
                          </span>
                          <span className="text-white/30 text-[10px] font-condensed">{where}</span>
                        </div>
                        <p className={`text-sm leading-snug ${isDone ? "line-through text-white/40" : "text-white"}`}>
                          {item.item_description}
                        </p>
                        <p className="text-white/25 text-[10px] mt-0.5">
                          {isDone
                            ? `Done by ${item.completed_by} · ${relativeTime(item.completed_at!)}`
                            : `Added by ${item.created_by} · ${relativeTime(item.created_at)}`
                          }
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
