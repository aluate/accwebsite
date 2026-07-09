export const dynamic = "force-dynamic";

import { sql } from "@/lib/db";
import { WipeJobsClient } from "@/components/WipeJobsClient";

// requireRole("admin") is enforced by app/admin/(protected)/layout.tsx

export default async function WipeJobsPage() {
  const [{ count }] = await sql<[{ count: number }]>`SELECT COUNT(*)::int AS count FROM jobs`;

  return (
    <div className="min-h-screen bg-[#111] text-white">
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between gap-6">
        <div>
          <p className="text-[#f08122] font-condensed uppercase tracking-[0.3em] text-xs">
            Advanced Custom Cabinets
          </p>
          <p className="text-white font-condensed uppercase tracking-widest text-sm mt-0.5">
            Wipe Jobs
          </p>
        </div>
        <nav className="flex items-center gap-4">
          <a href="/admin/builders" className="text-white/40 hover:text-[#f08122] font-condensed uppercase tracking-widest text-xs transition-colors">
            Users
          </a>
          <a href="/jobs" className="text-white/40 hover:text-[#f08122] font-condensed uppercase tracking-widest text-xs transition-colors">
            Jobs
          </a>
        </nav>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
        <div className="mb-8">
          <h1 className="font-heading text-2xl uppercase tracking-wide text-red-400">Wipe All Jobs</h1>
          <p className="text-white/30 text-xs font-condensed uppercase tracking-widest mt-1">
            Danger zone — admin only
          </p>
        </div>

        <WipeJobsClient count={count} />
      </main>
    </div>
  );
}
