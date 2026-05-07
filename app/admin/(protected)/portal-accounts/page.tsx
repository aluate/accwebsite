"use client";
import Link from "next/link";
import { useEffect, useState, useCallback } from "react";

type Account = {
  id: string; username: string; display_name: string; builder_company: string;
  contact_email: string | null; active: number;
  created_at: string; last_login_at: string | null;
  must_change_pw: number;
};

export default function PortalAccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ username: "", display_name: "", builder_company: "", contact_email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/portal-accounts", { cache: "no-store" });
    if (res.ok) { const b = await res.json(); setAccounts(b.accounts); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(""); setMsg("");
    try {
      const res = await fetch("/api/admin/portal-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(b.error ?? "Failed"); return; }
      setMsg(`Created ${form.username}. Hand them username + password — they'll change on first login.`);
      setForm({ username: "", display_name: "", builder_company: "", contact_email: "", password: "" });
      load();
    } finally { setBusy(false); }
  }

  async function patch(payload: Record<string, unknown>) {
    setBusy(true); setErr("");
    await fetch("/api/admin/portal-accounts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    load();
    setBusy(false);
  }

  return (
    <div className="min-h-screen bg-[#111] text-white">
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-[#f08122] font-condensed uppercase tracking-[0.3em] text-xs">Advanced Custom Cabinets</p>
          <p className="text-white font-condensed uppercase tracking-widest text-sm mt-0.5">Builder Portal Accounts</p>
        </div>
        <nav className="flex items-center gap-4">
          <Link href="/admin/builders" className="text-white/40 hover:text-[#f08122] font-condensed uppercase tracking-widest text-xs">Internal users</Link>
          <Link href="/admin/libraries" className="text-white/40 hover:text-[#f08122] font-condensed uppercase tracking-widest text-xs">Libraries</Link>
          <Link href="/jobs" className="text-white/40 hover:text-[#f08122] font-condensed uppercase tracking-widest text-xs">Jobs</Link>
          <form action="/api/auth/logout" method="POST">
            <button type="submit" className="text-white/30 hover:text-white font-condensed uppercase tracking-widest text-xs">Sign out</button>
          </form>
        </nav>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-12">

        <section>
          <h2 className="font-condensed uppercase tracking-widest text-xs text-[#f08122] mb-4 pb-1 border-b border-white/10">New portal account</h2>
          <form onSubmit={create} className="grid sm:grid-cols-2 gap-4">
            <Field label="Username *" value={form.username} onChange={(v) => setForm({...form, username: v.toLowerCase()})} placeholder="atlas" />
            <Field label="Display name *" value={form.display_name} onChange={(v) => setForm({...form, display_name: v})} placeholder="Atlas Builders PM" />
            <Field label="Builder company *" value={form.builder_company} onChange={(v) => setForm({...form, builder_company: v})} placeholder="Atlas Builders" />
            <Field label="Contact email" value={form.contact_email} onChange={(v) => setForm({...form, contact_email: v})} placeholder="pm@atlas.com" />
            <Field label="Temp password (8+ chars) *" value={form.password} onChange={(v) => setForm({...form, password: v})} placeholder="they'll change on first login" type="password" />
            <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
              <button type="submit" disabled={busy} className="bg-[#f08122] hover:bg-[#d9711e] text-white font-condensed uppercase tracking-widest text-xs py-2 px-5 rounded disabled:opacity-50">Create account</button>
              {msg && <span className="text-green-400 text-xs">{msg}</span>}
              {err && <span className="text-red-400 text-xs">{err}</span>}
            </div>
          </form>
        </section>

        <section>
          <h2 className="font-condensed uppercase tracking-widest text-xs text-[#f08122] mb-4 pb-1 border-b border-white/10">Existing accounts ({accounts.length})</h2>
          {loading ? <p className="text-white/40 text-sm">Loading...</p> :
            accounts.length === 0 ? <p className="text-white/30 italic text-sm">No portal accounts yet.</p> : (
              <div className="space-y-2">
                {accounts.map((a) => (
                  <div key={a.id} className={`bg-[#2d2d2d] rounded p-4 ${a.active ? "" : "opacity-50"}`}>
                    <div className="flex items-start justify-between flex-wrap gap-3">
                      <div>
                        <p className="text-white text-sm">{a.display_name} <span className="text-white/40 ml-2">@{a.username}</span></p>
                        <p className="text-white/60 text-xs mt-0.5">{a.builder_company}{a.contact_email ? ` · ${a.contact_email}` : ""}</p>
                        <p className="text-white/30 text-[10px] font-condensed uppercase tracking-widest mt-1">
                          Created {new Date(a.created_at).toLocaleDateString()} · Last login {a.last_login_at ? new Date(a.last_login_at).toLocaleDateString() : "never"}
                          {a.must_change_pw === 1 && <span className="text-yellow-400 ml-2">(must change pw)</span>}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => {
                            const pw = prompt("New password (8+ chars):");
                            if (pw && pw.length >= 8) patch({ id: a.id, password: pw });
                          }}
                          disabled={busy}
                          className="text-white/60 hover:text-[#f08122] border border-white/15 hover:border-[#f08122] rounded px-2 py-1 text-[10px] font-condensed uppercase tracking-widest"
                        >Reset password</button>
                        <button
                          onClick={() => patch({ id: a.id, active: a.active === 1 ? 0 : 1 })}
                          disabled={busy}
                          className={`border rounded px-2 py-1 text-[10px] font-condensed uppercase tracking-widest ${a.active === 1 ? "text-red-400 border-red-700/40 hover:bg-red-900/20" : "text-green-400 border-green-700/40 hover:bg-green-900/20"}`}
                        >{a.active === 1 ? "Deactivate" : "Reactivate"}</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
          )}
        </section>
      </main>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <div>
      <label className="block text-white/50 text-[10px] font-condensed uppercase tracking-widest mb-1">{label}</label>
      <input
        type={type} value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder} required={label.includes("*")}
        className="w-full bg-[#1a1a1a] border border-white/15 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-[#f08122]"
      />
    </div>
  );
}
