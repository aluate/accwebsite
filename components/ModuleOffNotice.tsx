"use client";

/**
 * ModuleOffNotice — what a job's module page says when that module is off.
 *
 * WHY THIS EXISTS.
 *
 * The three module pages disagreed about what a switched-off module means.
 * /jobs/[id]/residential called notFound() — a blank 404 on a job that plainly
 * exists, reached from a link sitting on that job's own page. /jobs/[id]/trim
 * and /jobs/[id]/doors ignored their flags entirely and showed an empty spec
 * list. Same concept, three behaviours, and the strictest one was also the
 * least explicable: seven of eight recent jobs answered 404 there, because
 * nothing that created them ever ticked the box.
 *
 * A job that exists should never answer "not found". This says which switch is
 * off and offers to turn it on, because that is what the person came to do.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ModuleOffNotice({
  jobRef,
  moduleKey,
  label,
}: {
  /** Whatever the URL used — job number or internal id. The API resolves either. */
  jobRef: string;
  moduleKey: "mod_residential" | "mod_commercial" | "mod_trim" | "mod_doors";
  label: string;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function enable() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/jobs/${encodeURIComponent(jobRef)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [moduleKey]: 1 }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || `Could not turn it on (${res.status}).`);
        setSaving(false);
        return;
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto mt-16 bg-[#2d2d2d] border border-white/10 rounded-lg p-8 text-center">
      <p className="text-[#f08122] font-condensed uppercase tracking-[0.3em] text-xs mb-3">
        {label} is not part of this job
      </p>
      <p className="text-white/70 text-sm mb-6">
        This job exists, but {label.toLowerCase()} is switched off in its scope of work,
        so there is nothing to spec here yet.
      </p>
      <button
        onClick={enable}
        disabled={saving}
        className="bg-[#f08122] hover:bg-[#d9721d] disabled:opacity-50 text-black font-medium rounded px-5 py-2.5 text-sm transition-colors"
      >
        {saving ? "Turning it on…" : `Add ${label} to this job`}
      </button>
      {error && <p className="text-red-400 text-xs mt-4">{error}</p>}
      <p className="text-white/30 text-xs mt-6">
        You can also change the scope of work on the job&rsquo;s Edit page.
      </p>
    </div>
  );
}
