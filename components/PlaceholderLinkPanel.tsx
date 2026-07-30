"use client";
import { useEffect, useState } from "react";

type Placeholder = {
  id: string;
  client_name: string;
  placeholder_unit_count: number | null;
  placeholder_per_unit_value: number | null;
  status: string;
};

export function PlaceholderLinkPanel({
  jobId,
  builderId,
  existingPlaceholderId,
}: {
  jobId: string;
  builderId: string;
  existingPlaceholderId: string | null;
}) {
  const [placeholders, setPlaceholders] = useState<Placeholder[]>([]);
  const [selected, setSelected] = useState<string>(existingPlaceholderId ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!builderId) return;
    fetch(`/api/jobs?builder_id=${encodeURIComponent(builderId)}&is_placeholder=true`)
      .then(r => r.json())
      .then(d => {
        const jobs: Placeholder[] = Array.isArray(d.jobs) ? d.jobs : [];
        setPlaceholders(jobs.filter(j => j.status !== "complete" && j.status !== "cancelled"));
      })
      .catch(() => {});
  }, [builderId]);

  if (placeholders.length === 0 && !existingPlaceholderId) return null;

  async function save() {
    setSaving(true); setError(""); setSaved(false);
    try {
      const r = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeholder_id: selected || null, _actor: "pm", _actorRole: "pm" }),
      });
      if (!r.ok) { const d = await r.json(); setError(d.error ?? "Save failed"); }
      else setSaved(true);
    } catch { setError("Network error"); }
    finally { setSaving(false); }
  }

  return (
    <div className="bg-[#2d2d2d] rounded p-5">
      <p className="text-white/30 font-condensed uppercase tracking-widest text-[10px] mb-3">
        ⬡ Placeholder Link
      </p>
      {existingPlaceholderId && placeholders.length === 0 ? (
        <p className="text-orange-400/60 text-xs">Linked to a placeholder (already complete or from another builder).</p>
      ) : (
        <>
          <select
            value={selected}
            onChange={e => { setSelected(e.target.value); setSaved(false); }}
            className="w-full bg-[#1d1d1d] border border-white/15 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#f08122] transition-colors appearance-none mb-3"
          >
            <option value="">— Not linked to a placeholder</option>
            {placeholders.map(p => (
              <option key={p.id} value={p.id}>
                {p.client_name}
                {p.placeholder_unit_count ? ` (${p.placeholder_unit_count} units` : ""}
                {p.placeholder_per_unit_value ? `, $${Math.round(p.placeholder_per_unit_value).toLocaleString()}/unit` : ""}
                {p.placeholder_unit_count ? ")" : ""}
              </option>
            ))}
          </select>
          {error && <p className="text-red-400 text-xs mb-2">{error}</p>}
          {saved && <p className="text-green-400 text-xs mb-2">Saved ✓</p>}
          <button
            onClick={save}
            disabled={saving || selected === (existingPlaceholderId ?? "")}
            className="text-xs font-condensed uppercase tracking-widest bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/40 text-orange-300 px-3 py-1.5 rounded transition-colors disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save Link"}
          </button>
        </>
      )}
    </div>
  );
}
