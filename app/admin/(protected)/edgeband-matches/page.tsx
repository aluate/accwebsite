"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export const dynamic = "force-dynamic";

type Match = {
  id: string;
  paint_brand: string;
  paint_code: string;
  esi_part: string;
  esi_desc: string | null;
  notes: string | null;
};

type Form = { paint_brand: string; paint_code: string; esi_part: string; esi_desc: string; notes: string };

const BLANK: Form = { paint_brand: "BM", paint_code: "", esi_part: "", esi_desc: "", notes: "" };
const BRANDS = ["BM", "SW", "ML", "OTHER"];

const LABEL = "block text-white/50 text-xs font-condensed uppercase tracking-widest mb-1";
const INPUT = "w-full bg-[#1e1e1e] border border-white/10 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-[#f08122]/50";

export default function EdgebandMatchesPage() {
  const router = useRouter();
  const [matches, setMatches] = useState<Match[]>([]);
  const [form, setForm] = useState<Form>(BLANK);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [filterBrand, setFilterBrand] = useState("ALL");
  const [search, setSearch] = useState("");
  const [msg, setMsg] = useState("");

  async function load() {
    const r = await fetch("/api/admin/edgeband-matches");
    const d = await r.json() as { matches: Match[] };
    setMatches(d.matches ?? []);
  }
  useEffect(() => { load(); }, []);

  async function save() {
    setSaving(true); setMsg("");
    try {
      const r = await fetch("/api/admin/edgeband-matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!r.ok) { const d = await r.json() as { error: string }; setMsg("Error: " + d.error); return; }
      setForm(BLANK);
      setMsg("Saved.");
      await load();
    } finally { setSaving(false); }
  }

  async function del(id: string) {
    setDeleting(id);
    await fetch(`/api/admin/edgeband-matches?id=${id}`, { method: "DELETE" });
    setDeleting(null);
    await load();
  }

  const filtered = matches.filter((m) => {
    if (filterBrand !== "ALL" && m.paint_brand !== filterBrand) return false;
    if (search) {
      const q = search.toLowerCase();
      return m.paint_code.toLowerCase().includes(q) || m.esi_part.toLowerCase().includes(q) || (m.esi_desc ?? "").toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-[#111] text-white px-4 py-6 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-heading uppercase tracking-wide text-white">ESI Edgeband Matches</h1>
        <p className="text-white/40 text-sm mt-1">Map paint color codes to ESI edgeband part numbers. Used to auto-suggest edgebands in finish group cards.</p>
      </div>

      {/* Add form */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-4">
        <h2 className="text-white/60 text-xs font-condensed uppercase tracking-widest">Add / Update Match</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className={LABEL}>Paint Brand</label>
            <select className={INPUT} value={form.paint_brand} onChange={(e) => setForm((f) => ({ ...f, paint_brand: e.target.value }))}>
              {BRANDS.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <label className={LABEL}>Paint Code *</label>
            <input className={INPUT} placeholder="e.g. OC-17 or SW 7757" value={form.paint_code}
              onChange={(e) => setForm((f) => ({ ...f, paint_code: e.target.value }))} />
          </div>
          <div>
            <label className={LABEL}>ESI Part Number *</label>
            <input className={INPUT} placeholder="e.g. ESIRCE3xxxxxxx" value={form.esi_part}
              onChange={(e) => setForm((f) => ({ ...f, esi_part: e.target.value }))} />
          </div>
          <div>
            <label className={LABEL}>ESI Description</label>
            <input className={INPUT} placeholder="e.g. White ESI 15/16 PVC" value={form.esi_desc}
              onChange={(e) => setForm((f) => ({ ...f, esi_desc: e.target.value }))} />
          </div>
          <div className="sm:col-span-2">
            <label className={LABEL}>Notes</label>
            <input className={INPUT} placeholder="Optional notes" value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={save}
            disabled={saving || !form.paint_code || !form.esi_part}
            className="bg-[#f08122] hover:bg-[#f08122]/80 disabled:opacity-40 text-white text-sm font-condensed uppercase tracking-widest px-5 py-2 rounded transition-colors"
          >
            {saving ? "Saving…" : "Save Match"}
          </button>
          {msg && <span className="text-green-400 text-xs font-condensed">{msg}</span>}
        </div>
      </div>

      {/* Filter + list */}
      <div className="space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex gap-1">
            {["ALL", ...BRANDS].map((b) => (
              <button key={b} onClick={() => setFilterBrand(b)}
                className={`text-xs font-condensed uppercase tracking-widest px-2 py-0.5 rounded border transition-colors ${filterBrand === b ? "bg-[#f08122]/20 border-[#f08122]/50 text-[#f08122]" : "border-white/10 text-white/30 hover:text-white hover:border-white/30"}`}
              >{b}</button>
            ))}
          </div>
          <input
            className="bg-[#1e1e1e] border border-white/10 rounded px-3 py-1.5 text-white text-sm focus:outline-none focus:border-[#f08122]/50 flex-1 max-w-xs"
            placeholder="Search code or ESI part…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <span className="text-white/30 text-xs font-condensed">{filtered.length} match{filtered.length !== 1 ? "es" : ""}</span>
        </div>

        {filtered.length === 0 ? (
          <p className="text-white/20 text-sm italic py-4">No matches yet. Add the first one above.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-white/30 text-xs font-condensed uppercase tracking-widest border-b border-white/10">
                  <th className="text-left py-2 pr-4">Brand</th>
                  <th className="text-left py-2 pr-4">Paint Code</th>
                  <th className="text-left py-2 pr-4">ESI Part</th>
                  <th className="text-left py-2 pr-4">Description</th>
                  <th className="text-left py-2 pr-4">Notes</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => (
                  <tr key={m.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="py-2.5 pr-4 font-condensed text-white/60">{m.paint_brand}</td>
                    <td className="py-2.5 pr-4 font-mono text-white">{m.paint_code}</td>
                    <td className="py-2.5 pr-4 font-mono text-[#f08122]">{m.esi_part}</td>
                    <td className="py-2.5 pr-4 text-white/70">{m.esi_desc ?? "—"}</td>
                    <td className="py-2.5 pr-4 text-white/40 text-xs">{m.notes ?? "—"}</td>
                    <td className="py-2.5">
                      <button
                        onClick={() => del(m.id)}
                        disabled={deleting === m.id}
                        className="text-red-400/60 hover:text-red-400 text-xs font-condensed uppercase tracking-wider transition-colors disabled:opacity-30"
                      >
                        {deleting === m.id ? "…" : "Delete"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="pt-4 border-t border-white/10">
        <button onClick={() => router.back()} className="text-white/30 text-xs font-condensed uppercase tracking-wider hover:text-white transition-colors">
          ← Back to Admin
        </button>
      </div>
    </div>
  );
}
