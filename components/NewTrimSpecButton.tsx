"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function NewTrimSpecButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  async function create() {
    setCreating(true);
    const name = prompt("Name this trim spec (e.g. Main House, Garage ADU):");
    if (!name) { setCreating(false); return; }
    const res = await fetch("/api/trim-specs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_id: jobId, name }),
    });
    const { id } = await res.json();
    router.push(`/jobs/${jobId}/trim/${id}`);
  }

  return (
    <button
      onClick={create}
      disabled={creating}
      className="bg-[#f08122] hover:bg-[#d9711e] text-white font-condensed uppercase tracking-widest text-sm py-2.5 px-5 rounded transition-colors disabled:opacity-50"
    >
      {creating ? "Creating…" : "+ New Trim Spec"}
    </button>
  );
}
