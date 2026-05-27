"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

type JobHit  = { id: string; job_number: string | null; client_name: string; site_address: string; city: string | null; pm: string | null; status: string };
type SpecHit = { id: string; job_id: string; name: string; lifecycle_state: string; client_name: string };
type Results = { jobs: JobHit[]; specs: SpecHit[] };

const STATUS_COLOR: Record<string, string> = {
  intake: "text-white/40 bg-white/10", bid: "text-sky-300 bg-sky-900/30",
  design: "text-sky-300 bg-sky-900/30", field_dims: "text-sky-300 bg-sky-900/30",
  engineering: "text-blue-300 bg-blue-900/30", procurement: "text-blue-300 bg-blue-900/30",
  production: "text-yellow-300 bg-yellow-900/30", delivery: "text-amber-300 bg-amber-900/30",
  install: "text-purple-300 bg-purple-900/30", punch: "text-pink-300 bg-pink-900/30",
  complete: "text-green-300 bg-green-900/30", on_hold: "text-orange-300 bg-orange-900/30",
};

const LC_COLOR: Record<string, string> = {
  DRAFT: "text-white/40 bg-white/10", CLIENT_APPROVED: "text-blue-300 bg-blue-900/30",
  RELEASED_TO_ENG: "text-indigo-300 bg-indigo-900/30", ENGINEERED: "text-purple-300 bg-purple-900/30",
  RELEASED_TO_SHOP: "text-green-300 bg-green-900/30",
};

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Results | null>(null);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) { setResults(null); setApiError(false); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setApiError(false);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          setResults(await res.json());
        } else {
          setApiError(true);
          setResults(null);
        }
      } catch {
        setApiError(true);
        setResults(null);
      } finally {
        setLoading(false);
      }
    }, 250);
  }, [query]);

  const total = (results?.jobs.length ?? 0) + (results?.specs.length ?? 0);

  return (
    <section className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/jobs" className="font-condensed uppercase tracking-widest text-xs text-white/30 hover:text-[#f08122] transition-colors">
          ← Jobs
        </Link>
      </div>

      <h1 className="font-heading text-3xl uppercase tracking-wide text-white mb-6">Search</h1>

      <div className="relative mb-8">
        <input
          autoFocus
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Client name, address, job #, PM, builder..."
          className="w-full bg-[#2d2d2d] border border-white/15 focus:border-[#f08122]/60 rounded-lg px-4 py-3 text-white text-base placeholder:text-white/30 focus:outline-none transition-colors"
        />
        {loading && (
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 text-xs font-condensed uppercase tracking-widest animate-pulse">
            searching…
          </span>
        )}
      </div>

      {!results && !apiError && query.trim().length < 2 && (
        <p className="text-white/20 text-sm font-condensed uppercase tracking-widest text-center py-16">
          Type at least 2 characters to search
        </p>
      )}

      {apiError && (
        <p className="text-[#f08122]/60 text-sm font-condensed uppercase tracking-widest text-center py-16">
          Database busy — try again in a moment
        </p>
      )}

      {results && total === 0 && (
        <p className="text-white/20 text-sm font-condensed uppercase tracking-widest text-center py-16">
          No results for &ldquo;{query}&rdquo;
        </p>
      )}

      {results && total > 0 && (
        <div className="space-y-8">
          {results.jobs.length > 0 && (
            <div>
              <p className="text-white/30 text-[10px] font-condensed uppercase tracking-widest mb-3">Jobs — {results.jobs.length}</p>
              <div className="space-y-1.5">
                {results.jobs.map((j) => {
                  const loc = [j.site_address, j.city].filter(Boolean).join(", ");
                  const sc = STATUS_COLOR[j.status] ?? "text-white/40 bg-white/10";
                  return (
                    <Link key={j.id} href={`/jobs/${j.job_number ?? j.id}`}
                      className="flex items-center gap-3 bg-[#2d2d2d] hover:bg-[#353535] rounded-lg px-4 py-3 transition-colors group">
                      <span className="text-[#f08122] font-condensed text-xs w-24 shrink-0">{j.job_number ?? "—"}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium truncate">{j.client_name}</p>
                        {loc && <p className="text-white/40 text-xs truncate">{loc}</p>}
                      </div>
                      {j.pm && <span className="text-white/30 text-xs hidden md:block shrink-0 w-24 truncate">{j.pm}</span>}
                      <span className={"text-[10px] font-condensed uppercase tracking-wider px-2 py-0.5 rounded shrink-0 " + sc}>
                        {j.status.replace(/_/g, " ")}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
          {results.specs.length > 0 && (
            <div>
              <p className="text-white/30 text-[10px] font-condensed uppercase tracking-widest mb-3">Specs — {results.specs.length}</p>
              <div className="space-y-1.5">
                {results.specs.map((s) => {
                  const lc = LC_COLOR[s.lifecycle_state] ?? "text-white/40 bg-white/10";
                  return (
                    <Link key={s.id} href={`/jobs/${s.job_id}/residential/${s.id}`}
                      className="flex items-center gap-3 bg-[#2d2d2d] hover:bg-[#353535] rounded-lg px-4 py-3 transition-colors group">
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium truncate">{s.client_name}</p>
                        <p className="text-white/40 text-xs truncate">{s.name}</p>
                      </div>
                      <span className={"text-[10px] font-condensed uppercase tracking-wider px-2 py-0.5 rounded shrink-0 " + lc}>
                        {s.lifecycle_state.replace(/_/g, " ")}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
