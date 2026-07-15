"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function EnableModuleButton({ jobId, modKey, label }: {
  jobId: string; modKey: string; label: string;
}) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function enable() {
    setLoading(true);
    await fetch(`/api/jobs/${jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [modKey]: true, _actor: "admin", _actorRole: "admin" }),
    });
    router.refresh();
  }

  return (
    <button
      onClick={enable}
      disabled={loading}
      className="text-[10px] font-condensed uppercase tracking-widest text-white/40 hover:text-[#f08122] border border-white/10 hover:border-[#f08122]/30 px-2.5 py-1 rounded transition-colors disabled:opacity-30"
    >
      {loading ? "Adding…" : "+ Add to Scope"}
    </button>
  );
}
