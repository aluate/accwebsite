import Link from "next/link";
import { requirePortalUser, listJobsForPortalUser } from "@/lib/portal-auth";
import { summarize } from "@/lib/portal-required-inputs";

type JobListRow = {
  id: string; client_name: string; site_address: string; city: string | null;
  status: string; delivery_date: string | null;
  delivery_clock_started_at: string | null; estimated_delivery_at: string | null;
};

export default async function PortalJobsPage({ searchParams }: { searchParams: Promise<{ q?: string; show?: string }> }) {
  const user = await requirePortalUser();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().toLowerCase();
  const includeComplete = sp.show === "all";

  const all = await listJobsForPortalUser(user) as JobListRow[];
  const filtered = all.filter((j) => {
    if (!includeComplete && j.status === "complete") return false;
    if (!q) return true;
    return [j.id, j.client_name, j.site_address, j.city ?? ""].some((s) => s.toLowerCase().includes(q));
  });

  return (
    <main className="min-h-screen bg-[#111] text-white">
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-[#f08122] font-condensed uppercase tracking-[0.3em] text-xs">Advanced Custom Cabinets</p>
          <p className="text-white font-condensed uppercase tracking-widest text-sm mt-0.5">
            Builder Portal · {user.builder_company}
          </p>
        </div>
        <form action="/api/portal/auth/logout" method="POST">
          <button type="submit" className="text-white/30 hover:text-white font-condensed uppercase tracking-widest text-xs">Sign out</button>
        </form>
      </header>

      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex flex-wrap items-end gap-3 mb-6">
          <form className="flex-1 min-w-[200px]">
            <label className="block text-white/40 text-[10px] font-condensed uppercase tracking-widest mb-1">Search</label>
            <input
              name="q" defaultValue={sp.q ?? ""}
              placeholder="job #, client, address..."
              className="w-full bg-[#1a1a1a] border border-white/15 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f08122]"
            />
            {includeComplete && <input type="hidden" name="show" value="all" />}
          </form>
          <Link href={includeComplete ? "/portal/jobs" : "/portal/jobs?show=all"} className="text-white/40 hover:text-[#f08122] font-condensed uppercase tracking-widest text-xs border border-white/15 hover:border-[#f08122] rounded px-3 py-2">
            {includeComplete ? "Hide complete" : "Show complete"}
          </Link>
        </div>

        {filtered.length === 0 && (
          <p className="text-white/30 italic text-center py-12">No jobs match. {q && "Clear search to see all."}</p>
        )}

        <div className="space-y-2">
          {filtered.map((j) => {
            const s = summarize(j.id);
            return (
              <Link
                key={j.id}
                href={`/portal/jobs/${j.id}`}
                className="block bg-[#2d2d2d] hover:bg-[#353535] rounded p-4 transition-colors"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[#f08122] font-condensed uppercase tracking-widest text-xs">{j.id}</p>
                    <p className="text-white text-base mt-0.5 truncate">{j.client_name}</p>
                    <p className="text-white/40 text-xs mt-0.5 truncate">{j.site_address}{j.city ? `, ${j.city}` : ""}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`text-[10px] font-condensed uppercase tracking-widest rounded px-2 py-0.5 ${
                      j.status === "complete" ? "text-green-300 bg-green-900/30" :
                      j.status === "production" ? "text-yellow-300 bg-yellow-900/30" :
                      j.status === "active" ? "text-blue-300 bg-blue-900/30" :
                      "text-white/40 bg-white/10"
                    }`}>{j.status}</span>
                    <p className="text-white/30 text-[10px] font-condensed uppercase tracking-widest mt-1">
                      {s.received + s.waived}/{s.total} inputs received
                    </p>
                  </div>
                </div>
                <div className="mt-3 h-1 bg-white/5 rounded overflow-hidden">
                  <div className="h-full bg-[#f08122] transition-all" style={{ width: `${s.pct_complete}%` }} />
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}
