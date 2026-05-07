"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// A spec lives under a job. We auto-create with a default name; the user
// can rename later from the spec page if they really want to.
//
// builderProfileId (when known) seeds the spec with that builder's defaults
// for carcass / drawer box / pull / finish-type. Color, door style, and
// edgeband are deliberately left blank — those are the silent-default-prone
// fields that triggered the $70k incident, so the forced-dropdown UI must
// see them as "unpicked" until the user explicitly chooses.
export function NewSpecButton({
  jobId,
  builderProfileId,
}: {
  jobId: string;
  builderProfileId?: string | null;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  async function create() {
    setCreating(true);
    try {
      const body: Record<string, unknown> = { job_id: jobId, name: "Cabinet Spec" };
      if (builderProfileId) body.builder_profile_id = builderProfileId;

      const res = await fetch("/api/specs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) { setCreating(false); return; }
      const { id } = await res.json();
      router.push(`/jobs/${jobId}/residential/${id}`);
    } catch {
      setCreating(false);
    }
  }

  return (
    <button
      onClick={create}
      disabled={creating}
      className="bg-[#f08122] hover:bg-[#d9711e] text-white font-condensed uppercase tracking-widest text-sm py-2.5 px-5 rounded transition-colors disabled:opacity-50"
    >
      {creating ? "Creating…" : "+ New Spec"}
    </button>
  );
}
